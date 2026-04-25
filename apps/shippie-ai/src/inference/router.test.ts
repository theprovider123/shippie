/**
 * Router tests.
 *
 * Two responsibilities to verify:
 *   1. Origin allowlist — adversarial origins rejected, legit ones accepted.
 *      This is the security boundary; bugs here are the most expensive.
 *   2. Request/response round-trip — happy path resolves, errors propagate.
 *
 * We don't spin up real Workers in unit tests; `dispatch` is injected.
 */
// Mark this as a test environment so the module's side-effect boot doesn't
// run when the router module is imported.
(globalThis as unknown as { __SHIPPIE_AI_TEST__?: boolean }).__SHIPPIE_AI_TEST__ = true;

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ALLOWED_ORIGIN_RE, createRouter, isAllowedOrigin } from './router.ts';
import type { InferenceMessage, InferenceResponse } from '../types.ts';

describe('isAllowedOrigin', () => {
  test('accepts canonical *.shippie.app subdomains', () => {
    expect(isAllowedOrigin('https://recipe.shippie.app')).toBe(true);
    expect(isAllowedOrigin('https://whiteboard.shippie.app')).toBe(true);
    expect(isAllowedOrigin('https://journal.shippie.app')).toBe(true);
    expect(isAllowedOrigin('https://ai.shippie.app')).toBe(true);
    expect(isAllowedOrigin('https://app-with-hyphens.shippie.app')).toBe(true);
  });

  test('rejects adversarial origins', () => {
    // The classic "domain bait" attacks.
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://shippie.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://ai.shippie.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://recipe-shippie.app')).toBe(false); // missing dot
    expect(isAllowedOrigin('https://shippie.app')).toBe(false); // apex, no subdomain
    // No TLS — explicit reject.
    expect(isAllowedOrigin('http://recipe.shippie.app')).toBe(false);
    // Multi-label subdomain — out for v1.
    expect(isAllowedOrigin('https://foo.bar.shippie.app')).toBe(false);
    // Empty / null / weird input.
    expect(isAllowedOrigin('')).toBe(false);
    expect(isAllowedOrigin('null')).toBe(false);
    expect(isAllowedOrigin('https://SHIPPIE.app/recipe')).toBe(false); // uppercase + path
  });

  test('regex matches the documented contract', () => {
    expect(ALLOWED_ORIGIN_RE.source).toBe('^https:\\/\\/[a-z0-9-]+\\.shippie\\.app$');
  });
});

interface FakeMessageEvent {
  data: unknown;
  origin: string;
  source: { postMessage: (data: InferenceResponse, targetOrigin: string) => void };
}

class FakeWindow {
  private listeners = new Set<(e: FakeMessageEvent) => void>();
  addEventListener = (_type: string, l: EventListener) => {
    this.listeners.add(l as unknown as (e: FakeMessageEvent) => void);
  };
  removeEventListener = (_type: string, l: EventListener) => {
    this.listeners.delete(l as unknown as (e: FakeMessageEvent) => void);
  };
  emit(event: FakeMessageEvent) {
    for (const l of this.listeners) l(event);
  }
}

let fakeWindow: FakeWindow;
let now = 1_700_000_000_000;

const newSource = () => {
  const calls: Array<{ data: InferenceResponse; targetOrigin: string }> = [];
  return {
    calls,
    postMessage: (data: InferenceResponse, targetOrigin: string) => {
      calls.push({ data, targetOrigin });
    },
  };
};

beforeEach(() => {
  fakeWindow = new FakeWindow();
  now = 1_700_000_000_000;
});

afterEach(() => {
  // Nothing to tear down; FakeWindow is fresh per test.
});

describe('createRouter', () => {
  test('round-trips a request from an allowed origin', async () => {
    const dispatched: InferenceMessage[] = [];
    const usageCalls: unknown[] = [];

    createRouter({
      dispatch: async (req) => {
        dispatched.push(req);
        now += 12; // 12ms inference
        return { label: 'food', confidence: 0.92 };
      },
      now: () => now,
      listenOn: fakeWindow as unknown as Window,
      logUsage: async (entry) => {
        usageCalls.push(entry);
      },
    });

    const source = newSource();
    fakeWindow.emit({
      origin: 'https://recipe.shippie.app',
      source,
      data: {
        requestId: 'req-1',
        task: 'classify',
        payload: { text: 'pasta', labels: ['food', 'travel'] },
      },
    });

    // Allow microtasks to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.task).toBe('classify');
    expect(source.calls).toHaveLength(1);
    expect(source.calls[0]!.targetOrigin).toBe('https://recipe.shippie.app');
    expect(source.calls[0]!.data).toEqual({
      requestId: 'req-1',
      result: { label: 'food', confidence: 0.92 },
    });

    // Usage logged with origin + duration, never the input text.
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0]).toMatchObject({
      origin: 'https://recipe.shippie.app',
      task: 'classify',
      durationMs: 12,
    });
    // Sanity: nothing in the log row leaks the input.
    expect(JSON.stringify(usageCalls[0])).not.toContain('pasta');
  });

  test('drops messages from disallowed origins (no dispatch, no reply)', async () => {
    const dispatched: InferenceMessage[] = [];
    createRouter({
      dispatch: async (req) => {
        dispatched.push(req);
        return null;
      },
      now: () => now,
      listenOn: fakeWindow as unknown as Window,
      logUsage: async () => {},
    });

    const source = newSource();
    for (const origin of [
      'https://evil.com',
      'https://shippie.app.evil.com',
      'https://ai.shippie.app.evil.com',
      'http://recipe.shippie.app',
      '',
    ]) {
      fakeWindow.emit({
        origin,
        source,
        data: { requestId: 'r', task: 'classify', payload: { text: 'x', labels: ['a'] } },
      });
    }

    await Promise.resolve();
    expect(dispatched).toHaveLength(0);
    expect(source.calls).toHaveLength(0);
  });

  test('returns error reply when dispatch throws', async () => {
    createRouter({
      dispatch: async () => {
        throw new Error('model failed');
      },
      now: () => now,
      listenOn: fakeWindow as unknown as Window,
      logUsage: async () => {},
    });

    const source = newSource();
    fakeWindow.emit({
      origin: 'https://recipe.shippie.app',
      source,
      data: {
        requestId: 'req-2',
        task: 'embed',
        payload: { text: 'hi' },
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(source.calls).toHaveLength(1);
    expect(source.calls[0]!.data).toEqual({ requestId: 'req-2', error: 'model failed' });
    expect(source.calls[0]!.targetOrigin).toBe('https://recipe.shippie.app');
  });

  test('rejects malformed messages', async () => {
    const dispatched: InferenceMessage[] = [];
    createRouter({
      dispatch: async (req) => {
        dispatched.push(req);
        return null;
      },
      now: () => now,
      listenOn: fakeWindow as unknown as Window,
      logUsage: async () => {},
    });

    const source = newSource();

    // No requestId.
    fakeWindow.emit({
      origin: 'https://recipe.shippie.app',
      source,
      data: { task: 'classify', payload: {} },
    });
    // Unknown task.
    fakeWindow.emit({
      origin: 'https://recipe.shippie.app',
      source,
      data: { requestId: 'a', task: 'evil', payload: {} },
    });
    // Not an object at all.
    fakeWindow.emit({
      origin: 'https://recipe.shippie.app',
      source,
      data: 'string-payload',
    });

    await Promise.resolve();
    expect(dispatched).toHaveLength(0);
    expect(source.calls).toHaveLength(0);
  });

  test('never replies with targetOrigin "*" — always pins to the sender', async () => {
    createRouter({
      dispatch: async () => ({ ok: true }),
      now: () => now,
      listenOn: fakeWindow as unknown as Window,
      logUsage: async () => {},
    });

    const source = newSource();
    fakeWindow.emit({
      origin: 'https://recipe.shippie.app',
      source,
      data: { requestId: 'r', task: 'embed', payload: { text: 'x' } },
    });

    await Promise.resolve();
    await Promise.resolve();

    for (const c of source.calls) {
      expect(c.targetOrigin).not.toBe('*');
      expect(c.targetOrigin).toBe('https://recipe.shippie.app');
    }
  });
});
