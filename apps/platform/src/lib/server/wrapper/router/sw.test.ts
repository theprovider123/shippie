import { describe, expect, test } from 'vitest';
import { handleSw } from './sw';
import type { WrapperContext } from '../env';

function makeCtx(slug: string, entries: Record<string, string> = {}): WrapperContext {
  const kv = new Map(Object.entries(entries));
  return {
    request: new Request(`https://${slug}.shippie.app/__shippie/sw.js`),
    env: {
      CACHE: {
        get: async (key: string) => kv.get(key) ?? null,
      },
    } as unknown as WrapperContext['env'],
    slug,
    traceId: 'test-trace',
  };
}

describe('/__shippie/sw.js (wrapped-app SW)', () => {
  test('generates parseable service-worker JavaScript', async () => {
    const res = await handleSw(makeCtx('demo-app'));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Service-Worker-Allowed')).toBe('/');
    expect(body).toContain('__shippie/sw.js — auto-generated');
    expect(() => new Function(body)).not.toThrow();
  });

  test('network-first HTML carries a slow-network budget instead of hanging', async () => {
    const res = await handleSw(makeCtx('demo-app'));
    const body = await res.text();

    // Short budget when the capsule already holds the document, longer
    // when there is nothing to fall back to.
    expect(body).toContain('const DOC_TIMEOUT_WITH_FALLBACK_MS = 3500;');
    expect(body).toContain('const DOC_TIMEOUT_WITHOUT_FALLBACK_MS = 8000;');
    expect(body).toContain('async function fetchWithTimeout(req, timeoutMs)');

    // The document branch probes the capsule cache first to pick the
    // budget, then races the network against it; the saved copy (or the
    // recovery page) is the fallback.
    const docBranch = body.slice(body.indexOf('if (isDoc) {'));
    const cachedProbe = docBranch.indexOf("(await cache.match('/index.html'))");
    const budget = docBranch.indexOf(
      'const budgetMs = cached ? DOC_TIMEOUT_WITH_FALLBACK_MS : DOC_TIMEOUT_WITHOUT_FALLBACK_MS;',
    );
    const race = docBranch.indexOf('await fetchWithTimeout(networkReq, budgetMs);');
    const fallback = docBranch.indexOf('return cached || recoveryResponse();');
    expect(cachedProbe).toBeGreaterThan(-1);
    expect(budget).toBeGreaterThan(cachedProbe);
    expect(race).toBeGreaterThan(budget);
    expect(fallback).toBeGreaterThan(race);
  });
});
