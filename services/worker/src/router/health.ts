import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

export const healthRouter = new Hono<AppBindings>();

healthRouter.get('/', (c) => {
  return c.json({
    ok: true,
    service: 'shippie-worker',
    env: c.env.SHIPPIE_ENV,
    slug: c.var.slug,
    timestamp: new Date().toISOString(),
  });
});
