/**
 * __shippie/* system router.
 *
 * Each file under ./router/ handles one subsystem. This router composes them.
 *
 * Spec v6 §5 (reserved route contract).
 */
/**
 * __shippie/* system router.
 *
 * Post-v5 pivot: auth, session, storage, and fn routes are removed.
 * Shippie no longer holds end-user data. Auth/storage/files are handled
 * by the maker's BYO backend (Supabase, Firebase).
 *
 * Remaining routes: health, meta, sdk.js, manifest, sw.js, icons,
 * install, feedback, analytics.
 *
 * Spec v5 §5 (reserved route contract, post-pivot).
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { healthRouter } from './health.ts';
import { metaRouter } from './meta.ts';
import { sdkRouter } from './sdk.ts';
import { manifestRouter } from './manifest.ts';
import { swRouter } from './sw.ts';
import { iconsRouter } from './icons.ts';
import { installRouter } from './install.ts';
import { feedbackRouter } from './feedback.ts';
import { analyticsRouter } from './analytics.ts';
import { handoffRouter } from './handoff.ts';
import { beaconRouter } from './beacon.ts';
import { pushRouter } from './push.ts';
import { splashRouter } from './splash.ts';

export const systemRouter = new Hono<AppBindings>();

systemRouter.route('/health', healthRouter);
systemRouter.route('/meta', metaRouter);
systemRouter.route('/sdk.js', sdkRouter);
systemRouter.route('/manifest', manifestRouter);
systemRouter.route('/sw.js', swRouter);
systemRouter.route('/icons', iconsRouter);
systemRouter.route('/install', installRouter);
systemRouter.route('/feedback', feedbackRouter);
systemRouter.route('/analytics', analyticsRouter);
systemRouter.route('/handoff', handoffRouter);
systemRouter.route('/beacon', beaconRouter);
systemRouter.route('/push', pushRouter);
systemRouter.route('/splash', splashRouter);

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
