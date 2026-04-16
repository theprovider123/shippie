/**
 * POST /api/orgs/[slug]/members — add a member by email (dev: direct add; prod: invite flow)
 *
 * Requires the caller to be an owner or admin of the org.
 *
 * Spec v6 §15.1.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);
const VALID_ROLES = new Set(['owner', 'admin', 'developer', 'viewer']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
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

  const targetUser = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (!targetUser) {
    return NextResponse.json(
      { error: 'user_not_found', message: 'User must sign up first (no email invites in MVP)' },
      { status: 404 },
    );
  }

  await db
    .insert(schema.organizationMembers)
    .values({
      orgId: org.id,
      userId: targetUser.id,
      role,
      invitedBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: [schema.organizationMembers.orgId, schema.organizationMembers.userId],
      set: { role },
    });

  await writeAuditLog(db, {
    actorUserId: session.user.id,
    organizationId: org.id,
    action: 'org.member.added',
    targetType: 'user',
    targetId: targetUser.id,
    metadata: { email, role },
  });

  return NextResponse.json({ success: true, org_id: org.id, user_id: targetUser.id, role });
}
