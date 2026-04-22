/**
 * POST /api/domains — add a custom domain to an app
 * GET  /api/domains?slug=<slug> — list domains for an app
 *
 * Spec v5 §5.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AddDomainSchema = z.object({
  slug: z.string().trim().min(1),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, 'invalid_domain'),
});

export const POST = withLogger('domains.add', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const rl = checkRateLimit({
    key: `domains:${session.user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  const parsed = await parseBody(req, AddDomainSchema);
  if (!parsed.ok) return parsed.response;
  const { slug, domain } = parsed.data;

  const db = await getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, slug) });
  if (!app) return NextResponse.json({ error: 'app_not_found' }, { status: 404 });
  if (app.makerId !== session.user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const token = randomBytes(16).toString('hex');
  const [row] = await db.insert(schema.customDomains).values({
    appId: app.id,
    domain,
    verificationToken: token,
  }).returning();

  return NextResponse.json({
    success: true,
    domain_id: row!.id,
    domain,
    verification_record: `_shippie-verify.${domain} TXT shippie-verify=${token}`,
    instructions: `Add this DNS TXT record, then POST /api/domains/verify with { domain_id: "${row!.id}" }`,
  });
});

export const GET = withLogger('domains.list', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'missing_slug' }, { status: 400 });

  const db = await getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, slug) });
  if (!app) return NextResponse.json({ error: 'app_not_found' }, { status: 404 });
  if (app.makerId !== session.user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const domains = await db.query.customDomains.findMany({
    where: eq(schema.customDomains.appId, app.id),
  });

  return NextResponse.json({ domains });
});
