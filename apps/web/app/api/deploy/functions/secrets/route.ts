/**
 * POST /api/deploy/functions/secrets
 *
 * Upsert an encrypted secret for an app's functions. Secrets never
 * appear in build logs, deploy artifacts, or the API response — only
 * the masked key is echoed back.
 *
 * Request: { slug, key, value }
 *
 * Spec v6 §1 (secrets management).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { encryptSecret } from '@/lib/functions/secrets-vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    key?: string;
    value?: string;
  };
  const slug = (body.slug ?? '').trim();
  const key = (body.key ?? '').trim();
  const value = body.value ?? '';

  if (!slug || !key || !value) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return NextResponse.json(
      { error: 'invalid_key', message: 'Use SCREAMING_SNAKE_CASE' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, slug) });
  if (!app) return NextResponse.json({ error: 'app_not_found' }, { status: 404 });
  if (app.makerId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const valueEncrypted = encryptSecret(value);

  await db
    .insert(schema.functionSecrets)
    .values({
      appId: app.id,
      key,
      valueEncrypted,
      createdBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: [schema.functionSecrets.appId, schema.functionSecrets.key],
      set: { valueEncrypted, updatedAt: new Date() },
    });

  return NextResponse.json({
    success: true,
    slug,
    key,
    masked: `${value.slice(0, 4)}…${value.slice(-2)}`,
  });
}
