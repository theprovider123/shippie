/**
 * POST /api/apps/[slug]/icon
 *
 * Upload an icon image for the app. Accepts PNG, JPEG, WebP, or SVG up to
 * 1 MiB. Stores the file in R2 under `icons/<slug>/<sha256-prefix>.<ext>`
 * and writes the public URL back to `apps.icon_url`.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { getDrizzleClient, schema } from '$server/db/client';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) throw error(500, 'bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  const slug = event.params.slug;
  const db = getDrizzleClient(env.DB);

  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!app) return json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== who.userId) return json({ error: 'forbidden' }, { status: 403 });

  // Remixes keep their forked icon — same lock as PATCH /identity.
  const [lineage] = await db
    .select({ parentAppId: schema.appLineage.parentAppId })
    .from(schema.appLineage)
    .where(eq(schema.appLineage.appId, app.id))
    .limit(1);
  if (lineage?.parentAppId) {
    return json({ error: 'remix_identity_locked' }, { status: 403 });
  }

  const form = await event.request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json({ error: 'no_file' }, { status: 400 });
  if (!ALLOWED.has(file.type)) return json({ error: 'invalid_type' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 1048576) return json({ error: 'too_large' }, { status: 400 });

  const r2 = env.APPS;
  if (!r2) throw error(500, 'R2 unavailable');

  const ext = file.type.replace('image/', '').replace('svg+xml', 'svg');
  const arr = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(arr)
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const key = 'icons/' + slug + '/' + hash + '.' + ext;

  await r2.put(key, bytes, { httpMetadata: { contentType: file.type } });

  const iconUrl = 'https://r2.shippie.app/' + key;
  await db.update(schema.apps).set({ iconUrl }).where(eq(schema.apps.id, app.id));

  return json({ iconUrl });
};
