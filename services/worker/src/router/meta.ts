/**
 * __shippie/meta
 *
 * Returns public app metadata. SDK init reads this to know the app's
 * type, theme, permissions, and active version.
 *
 * Spec v6 §5, §7.1.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

interface AppMetaPayload {
  slug: string;
  name?: string;
  type?: 'app' | 'web_app' | 'website';
  theme_color?: string;
  background_color?: string;
  icon?: string;
  version?: number;
  permissions?: {
    auth: boolean;
    storage: 'none' | 'r' | 'rw';
    files: boolean;
    notifications: boolean;
    analytics: boolean;
    native_bridge?: string[];
  };
}

export const metaRouter = new Hono<AppBindings>();

metaRouter.get('/', async (c) => {
  const slug = c.var.slug;
  const meta = await c.env.APP_CONFIG.getJson<AppMetaPayload>(`apps:${slug}:meta`);

  if (!meta) {
    // Stub response for local dev when no app has been published yet.
    // Returns a minimal meta object so the SDK can init without erroring.
    return c.json(
      {
        slug,
        name: slug,
        type: 'app',
        theme_color: '#f97316',
        background_color: '#ffffff',
        version: 0,
        permissions: {
          auth: false,
          storage: 'none' as const,
          files: false,
          notifications: false,
          analytics: true,
        },
      } satisfies AppMetaPayload,
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  return c.json(meta, 200, { 'Cache-Control': 'public, max-age=60' });
});
