/**
 * POST /api/orgs/invite/[token]/accept
 *
 * Accepts an org invite: marks the row as accepted, inserts the
 * organization_members row, writes an audit log entry, redirects to
 * the org dashboard.
 *
 * Spec v6 §15.1.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger(
  'orgs.invite.accept',
  async (_req: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const { token } = await params;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const db = await getDb();

    const invite = await db.query.organizationInvites.findFirst({
      where: and(
        eq(schema.organizationInvites.tokenHash, tokenHash),
        isNull(schema.organizationInvites.acceptedAt),
      ),
    });

    if (!invite) {
      return NextResponse.json({ error: 'invite_not_found' }, { status: 404 });
    }
    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'expired' }, { status: 410 });
    }
    if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.organizationInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.organizationInvites.id, invite.id));

      await tx
        .insert(schema.organizationMembers)
        .values({
          orgId: invite.orgId,
          userId: session.user!.id!,
          role: invite.role,
          invitedBy: invite.invitedBy,
        })
        .onConflictDoUpdate({
          target: [schema.organizationMembers.orgId, schema.organizationMembers.userId],
          set: { role: invite.role },
        });
    });

    await writeAuditLog(db, {
      actorUserId: session.user.id,
      organizationId: invite.orgId,
      action: 'org.invite.accepted',
      targetType: 'user',
      targetId: session.user.id,
      metadata: { role: invite.role },
    });

    return NextResponse.redirect(
      new URL(`/dashboard?welcomed=${invite.orgId}`, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4100'),
      303,
    );
  },
);
