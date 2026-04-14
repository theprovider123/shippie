/**
 * __shippie/* system router.
 *
 * Each file under ./router/ handles one subsystem. This router composes them.
 *
 * Spec v6 §5 (reserved route contract).
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { healthRouter } from './health.ts';
import { metaRouter } from './meta.ts';
import { sdkRouter } from './sdk.ts';
import { manifestRouter } from './manifest.ts';
import { swRouter } from './sw.ts';
import { iconsRouter } from './icons.ts';
import { sessionRouter } from './session.ts';
import { installRouter } from './install.ts';

export const systemRouter = new Hono<AppBindings>();

systemRouter.route('/health', healthRouter);
systemRouter.route('/meta', metaRouter);
systemRouter.route('/sdk.js', sdkRouter);
systemRouter.route('/manifest', manifestRouter);
systemRouter.route('/sw.js', swRouter);
systemRouter.route('/icons', iconsRouter);
systemRouter.route('/session', sessionRouter);
systemRouter.route('/install', installRouter);

// Auth + storage + files + feedback + analytics + functions land here in
// later weeks. Each is its own file for testability.
systemRouter.all('*', (c) => {
  return c.json(
    {
      error: 'not_found',
      message: 'This __shippie/* route is not yet implemented in the current build.',
      hint: 'See spec v6 §5 for the full reserved route contract.',
    },
    404,
  );
});
