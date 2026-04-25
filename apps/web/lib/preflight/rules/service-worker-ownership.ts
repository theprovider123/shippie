/**
 * service-worker-ownership
 *
 * Shippie owns the root service worker for hosted apps. A maker-provided
 * root SW can replace the platform runtime at scope "/" and break offline,
 * update, analytics queueing, and future local-runtime guarantees.
 */
import type { PreflightRule } from '../types.ts';

const ROOT_SW_EXACT = new Set([
  'sw.js',
  'service-worker.js',
  'serviceworker.js',
  'firebase-messaging-sw.js',
  'ngsw-worker.js',
]);

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function isRootServiceWorker(path: string): boolean {
  const clean = normalize(path);
  if (ROOT_SW_EXACT.has(clean)) return true;
  return /^workbox-[a-z0-9._-]+\.js$/.test(clean);
}

export const serviceWorkerOwnershipRule: PreflightRule = {
  id: 'service-worker-ownership',
  title: 'Root service worker ownership',
  run(ctx) {
    const conflicts = [
      ...new Set([...ctx.input.sourceFiles, ...ctx.input.outputFiles].filter(isRootServiceWorker)),
    ].sort();

    if (conflicts.length === 0) {
      return [
        {
          rule: this.id,
          severity: 'pass',
          title: 'No maker root service worker detected',
        },
      ];
    }

    return [
      {
        rule: this.id,
        severity: 'block',
        title: 'Maker root service worker conflicts with Shippie runtime',
        detail:
          `Shippie owns the root service worker scope for hosted apps. Remove or rename: ${conflicts.join(', ')}. ` +
          'A maker service-worker adapter will be added as an explicit compatibility mode.',
        metadata: {
          mode: 'disable',
          files: conflicts,
        },
      },
    ];
  },
};
