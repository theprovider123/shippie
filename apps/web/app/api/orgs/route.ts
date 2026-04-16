/**
 * POST /api/orgs — create an organization
 * GET  /api/orgs — list orgs the current user is a member of
 *
 * Spec v6 §15.1.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { slug?: string; name?: string };
  const slug = (body.slug ?? '').trim().toLowerCase();
  const name = (body.name ?? '').trim();

  if (!slug || !name) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  const db = await getDb();

  const existing = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, slug),
  });
  if (existing) return NextResponse.json({ error: 'slug_taken' }, { status: 409 });

  const [org] = await db
    .insert(schema.organizations)
    .values({ slug, name })
    .returning();

  if (!org) return NextResponse.json({ error: 'insert_failed' }, { status: 500 });

  // Creator becomes owner
  await db.insert(schema.organizationMembers).values({
    orgId: org.id,
    userId: session.user.id,
    role: 'owner',
  });

  await writeAuditLog(db, {
    actorUserId: session.user.id,
    organizationId: org.id,
    action: 'org.created',
    targetType: 'organization',
    targetId: org.id,
    metadata: { slug, name },
  });

  return NextResponse.json({ success: true, org });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const db = await getDb();
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(schema.organizationMembers.userId, session.user.id),
  });

  const orgIds = memberships.map((m: { orgId: string }) => m.orgId);
  if (orgIds.length === 0) return NextResponse.json({ orgs: [] });

  const orgs = await db.query.organizations.findMany({
    where: inArray(schema.organizations.id, orgIds),
  });

  return NextResponse.json({
    orgs: orgs.map((o: typeof orgs[number]) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      plan: o.plan,
      role: memberships.find((m: { orgId: string; role: string }) => m.orgId === o.id)?.role,
    })),
  });
}
