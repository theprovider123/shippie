/**
 * POST /api/orgs — create an organization
 * GET  /api/orgs — list orgs the current user is a member of
 *
 * Spec v6 §15.1.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

const CreateOrgSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_REGEX, 'invalid_slug'),
  name: z.string().trim().min(1).max(120),
});

export const POST = withLogger('orgs.create', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = checkRateLimit({
    key: `orgs-create:${session.user.id}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  const parsed = await parseBody(req, CreateOrgSchema);
  if (!parsed.ok) return parsed.response;
  const { slug, name } = parsed.data;

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
});

export const GET = withLogger('orgs.list', async () => {
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
});
