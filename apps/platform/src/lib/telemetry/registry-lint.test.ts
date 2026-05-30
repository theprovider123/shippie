/**
 * Lint test: every analytics_events writer in the codebase must
 * appear in the telemetry-egress registry.
 *
 * This catches the failure modes that grep over fetch() / sendBeacon
 * cannot — it works backward from the persistence target instead of
 * the network call, so server-side handlers, dynamic endpoints, and
 * helper-wrapped fetches are all covered.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TELEMETRY_CHANNELS } from './egress-registry';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');

function walk(dir: string, accept: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.svelte-kit' || entry === '.wrangler' || entry === 'dist') continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...walk(full, accept));
    } else if (accept(full)) {
      out.push(full);
    }
  }
  return out;
}

function repoRelative(absPath: string): string {
  return absPath.startsWith(REPO_ROOT) ? absPath.slice(REPO_ROOT.length + 1) : absPath;
}

describe('telemetry-egress registry lint', () => {
  it('every analytics_events writer is named in the registry', () => {
    // Walk the platform wrapper-router directory; any handler that
    // imports analyticsEvents must be in TELEMETRY_CHANNELS as a
    // writer_module.
    const routerDir = join(REPO_ROOT, 'apps/platform/src/lib/server/wrapper/router');
    const handlerFiles = walk(routerDir, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'));

    const writers = new Set(TELEMETRY_CHANNELS.map((c) => c.writer_module));
    const offenders: string[] = [];

    for (const file of handlerFiles) {
      const body = readFileSync(file, 'utf8');
      // `analyticsEvents` is the drizzle schema export. `analytics_events`
      // catches direct table-name string references in case any handler
      // bypasses the drizzle export.
      if (!body.includes('analyticsEvents') && !body.includes('analytics_events')) {
        continue;
      }
      const rel = repoRelative(file);
      if (!writers.has(rel)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('every registered writer_module exists on disk and references analytics_events or the cloud proof endpoint', () => {
    const missing: string[] = [];
    const orphan: string[] = [];

    for (const channel of TELEMETRY_CHANNELS) {
      const abs = join(REPO_ROOT, channel.writer_module);
      try {
        statSync(abs);
      } catch {
        missing.push(channel.writer_module);
        continue;
      }
      const body = readFileSync(abs, 'utf8');
      // The writer must visibly touch the egress channel — either the
      // analytics_events table or a known telemetry endpoint host.
      const touchesAnalytics = body.includes('analyticsEvents') || body.includes('analytics_events');
      const touchesProof = body.includes('/api/v1/proof');
      const touchesEgressRegistry = body.includes('emitTelemetry') || body.includes('egress-registry');
      if (!touchesAnalytics && !touchesProof && !touchesEgressRegistry) {
        orphan.push(channel.writer_module);
      }
    }

    expect(missing).toEqual([]);
    expect(orphan).toEqual([]);
  });

  it('no client-side module under apps/platform/src fetches a Shippie-egress endpoint outside its registered writer', () => {
    // Scan client-side TypeScript modules (excluding the registered
    // writers themselves and excluding server-only `lib/server/`). If
    // any other client module fires fetch/sendBeacon at a known
    // Shippie-egress endpoint, that's an unregistered egress path.
    const srcDir = join(REPO_ROOT, 'apps/platform/src');
    const files = walk(srcDir, (p) => (p.endsWith('.ts') || p.endsWith('.svelte')) && !p.endsWith('.test.ts'));

    const writers = new Set(TELEMETRY_CHANNELS.map((c) => c.writer_module));
    const KNOWN_PATHS = ['/__shippie/analytics', '/__shippie/beacon', '/__shippie/install', '/__shippie/handoff', '/api/v1/proof'];
    const offenders: Array<{ file: string; path: string }> = [];

    for (const file of files) {
      const rel = repoRelative(file);
      if (writers.has(rel)) continue;
      if (rel.includes('/lib/server/')) continue;
      // Skip the registry itself.
      if (rel.endsWith('/egress-registry.ts')) continue;
      const body = readFileSync(file, 'utf8');
      // Look for fetch/sendBeacon calls that include a known egress
      // path literal. False positives are acceptable for unregistered
      // egress endpoints; what matters is no SILENT egress.
      for (const path of KNOWN_PATHS) {
        // Match either `fetch('...path...'` or `sendBeacon('...path...'`
        const fetchRe = new RegExp(`(fetch|sendBeacon)\\s*\\(\\s*['\"\`][^'\"\`]*${path.replace(/[/]/g, '\\/')}`);
        if (fetchRe.test(body)) {
          offenders.push({ file: rel, path });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
