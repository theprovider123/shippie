/**
 * __shippie/install/*
 *
 * Install tracking + phone handoff. Week 7-ish.
 *
 * Spec v6 §5, §12.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

export const installRouter = new Hono<AppBindings>();

installRouter.get('/', (c) => {
  return c.json({
    slug: c.var.slug,
    installed: false,
    message: 'Install tracking lands in Week 7',
  });
});

installRouter.post('/', async (c) => {
  // Stub — Week 7 records the install in device_installs via platform API
  return c.json({ ok: true });
});

installRouter.get('/phone', (c) => {
  // Dev stub — real implementation returns a QR code or deep link
  return c.json({
    slug: c.var.slug,
    phone_url: `https://${c.var.slug}.shippie.app/`,
    note: 'QR generation lands in Week 10',
  });
});
