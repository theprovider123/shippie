/**
 * POST /api/domains/verify — check DNS TXT record and mark domain verified.
 *
 * Request: { domain_id }
 *
 * Spec v5 §5.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { resolve as dnsResolve } from 'node:dns/promises';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('domains.verify', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { domain_id?: string };
  if (!body.domain_id) return NextResponse.json({ error: 'missing_domain_id' }, { status: 400 });

  const db = await getDb();
  const domainRow = await db.query.customDomains.findFirst({
    where: eq(schema.customDomains.id, body.domain_id),
  });
  if (!domainRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Verify ownership
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, domainRow.appId) });
  if (!app || app.makerId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Check DNS TXT record
  const verifyHost = `_shippie-verify.${domainRow.domain}`;
  const expectedValue = `shippie-verify=${domainRow.verificationToken}`;

  let verified = false;
  try {
    const records = await dnsResolve(verifyHost, 'TXT');
    const flat = records.flat().map((r) => r.trim());
    verified = flat.includes(expectedValue);
  } catch {
    // DNS lookup failed — record doesn't exist yet
  }

  if (!verified) {
    return NextResponse.json({
      verified: false,
      message: `TXT record not found. Add: ${verifyHost} TXT ${expectedValue}`,
    });
  }

  await db
    .update(schema.customDomains)
    .set({ verifiedAt: new Date() })
    .where(eq(schema.customDomains.id, domainRow.id));

  await writeAuditLog(db, {
    actorUserId: session.user.id,
    action: 'domain.verified',
    targetType: 'domain',
    targetId: domainRow.id,
    metadata: { domain: domainRow.domain, app_slug: app.slug },
  });

  return NextResponse.json({ verified: true, domain: domainRow.domain });
});
