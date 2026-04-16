/**
 * POST /api/orgs/[slug]/invites — create an org invite with a signed token
 *
 * Returns a URL the invitee can follow to join. In prod this is emailed
 * via Resend; in dev the caller uses the URL directly.
 *
 * Request: { email, role }
 *
 * Spec v6 §15.1 (organization_invites flow).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);
const VALID_ROLES = new Set(['owner', 'admin', 'developer', 'viewer']);
const INVITE_TTL_DAYS = 7;

export const POST = withLogger(
  'orgs.invite.create',
  async (req: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const { slug } = await params;
    const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    const role = body.role ?? 'developer';

    if (!email) return NextResponse.json({ error: 'missing_email' }, { status: 400 });
    if (!VALID_ROLES.has(role)) return NextResponse.json({ error: 'invalid_role' }, { status: 400 });

    const db = await getDb();

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.slug, slug),
    });
    if (!org) return NextResponse.json({ error: 'org_not_found' }, { status: 404 });

    const callerMembership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(schema.organizationMembers.orgId, org.id),
        eq(schema.organizationMembers.userId, session.user.id),
      ),
    });
    if (!callerMembership || !ADMIN_ROLES.has(callerMembership.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

    const [invite] = await db
      .insert(schema.organizationInvites)
      .values({
        orgId: org.id,
        email,
        role,
        tokenHash,
        expiresAt,
        invitedBy: session.user.id,
      })
      .returning();

    await writeAuditLog(db, {
      actorUserId: session.user.id,
      organizationId: org.id,
      action: 'org.invite.created',
      targetType: 'invite',
      targetId: invite!.id,
      metadata: { email, role },
    });

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4100'}/orgs/invite/${token}`;

    return NextResponse.json({
      success: true,
      invite_id: invite!.id,
      expires_at: expiresAt.toISOString(),
      accept_url: acceptUrl,
    });
  },
);
