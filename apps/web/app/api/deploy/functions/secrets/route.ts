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
import { z } from 'zod';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { encryptSecret } from '@/lib/functions/secrets-vault';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FunctionSecretSchema = z.object({
  slug: z.string().min(1),
  key: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use SCREAMING_SNAKE_CASE'),
  value: z.string().min(1).max(32_768),
});

export const POST = withLogger('deploy.functions.secrets', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = checkRateLimit({
    key: `deploy-functions-secrets:${session.user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  const parsed = await parseBody(req, FunctionSecretSchema);
  if (!parsed.ok) return parsed.response;
  const { slug, key, value } = parsed.data;

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
});
