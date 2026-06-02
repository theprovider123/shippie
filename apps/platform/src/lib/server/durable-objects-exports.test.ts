import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: every Durable Object class bound in wrangler.toml must be re-exported
 * from the post-build worker wrapper. The build (wrap-worker-with-scheduled.mjs)
 * re-exports SignalRoom/BusPulseSegment from their sidecars; if a wrapper refactor
 * drops one, DO calls fail at runtime in prod with no test catching it. workerd
 * only warns at startup. This test makes that drift a red CI check instead.
 */
const platformRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(resolve(platformRoot, rel), 'utf8');
}

describe('durable object exports', () => {
  it('re-exports every wrangler-bound DO class from the worker wrapper', () => {
    const wrangler = read('wrangler.toml');
    const wrapper = read('scripts/wrap-worker-with-scheduled.mjs');

    const boundClasses = [...wrangler.matchAll(/class_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(boundClasses.length).toBeGreaterThan(0);

    const exported = new Set(
      [...wrapper.matchAll(/export\s*\{\s*([A-Za-z0-9_]+)\s*\}/g)].map((m) => m[1]),
    );

    const missing = [...new Set(boundClasses)].filter((cls) => !exported.has(cls));
    expect(missing, `DO classes bound but not re-exported by the wrapper: ${missing.join(', ')}`).toEqual([]);
  });
});
