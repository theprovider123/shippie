/**
 * Tests for the wrapper proof emitter.
 *
 * Bun test runs in a Node-like environment without IndexedDB, so the
 * module's IDB path no-ops and the in-memory fallback exercises the
 * queue. That's the design — IDB is the upgrade for browsers, the
 * memory queue is the floor.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
  configureProof,
  emitProofEvent,
  flushNow as flushProofQueue,
  _resetProofForTests,
} from './proof.ts';

interface FetchCall {
  url: string;
  body: { appSlug: string; deviceHash: string; events: { eventType: string; payload?: unknown }[] };
}

function makeFetch(input: { status: number; throwOnFirst?: boolean } = { status: 202 }) {
  const calls: FetchCall[] = [];
  let firstCall = true;
  const fetchImpl: typeof fetch = (async (url: string | URL, init?: RequestInit) => {
    if (firstCall && input.throwOnFirst) {
      firstCall = false;
      throw new Error('network down');
    }
    firstCall = false;
    const body = JSON.parse(String(init?.body ?? '{}')) as FetchCall['body'];
    calls.push({ url: String(url), body });
    return new Response(JSON.stringify({ accepted: body.events.length }), {
      status: input.status,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

afterEach(() => {
  _resetProofForTests();
  // Wipe localStorage device-hash to ensure a fresh hash per test.
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('shippie:device-hash:v1');
    } catch {
      /* ignore */
    }
  }
});

describe('emitProofEvent + flush', () => {
  test('flushes queued events in one POST', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    emitProofEvent('local_db_used');
    emitProofEvent('ai_ran_local', { task: 'classify' });
    const sent = await flushProofQueue();
    expect(sent).toBe(2);
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('https://x.test/api/v1/proof');
    expect(calls[0]!.body.appSlug).toBe('recipe');
    expect(calls[0]!.body.events.map((e) => e.eventType).sort()).toEqual([
      'ai_ran_local',
      'local_db_used',
    ]);
  });

  test('coalesces duplicate event types within a single flush window', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    for (let i = 0; i < 100; i++) emitProofEvent('local_db_used');
    const sent = await flushProofQueue();
    expect(sent).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.body.events.length).toBe(1);
  });

  test('payload differences keep events distinct', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    emitProofEvent('ai_ran_local', { task: 'classify' });
    emitProofEvent('ai_ran_local', { task: 'embed' });
    const sent = await flushProofQueue();
    expect(sent).toBe(2);
    expect(calls[0]!.body.events.length).toBe(2);
  });

  test('drops batch on 4xx (malformed) — does not retry', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 400 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    emitProofEvent('local_db_used');
    const first = await flushProofQueue();
    expect(first).toBe(0); // 4xx returns sent=0
    // Confirm the event isn't re-queued on the next flush.
    const second = await flushProofQueue();
    expect(second).toBe(0);
    expect(calls.length).toBe(1); // only the first POST
  });

  test('retries on 5xx — re-queues for next flush', async () => {
    const { fetchImpl: failingFetch, calls: failingCalls } = makeFetch({ status: 503 });
    configureProof({ appSlug: 'recipe', fetchImpl: failingFetch, endpointOrigin: 'https://x.test' });
    emitProofEvent('local_db_used');
    const first = await flushProofQueue();
    expect(first).toBe(0);
    expect(failingCalls.length).toBe(1);
    // Reconfigure with a 202 fetcher; the event should still be in the queue.
    const { fetchImpl: okFetch, calls: okCalls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl: okFetch, endpointOrigin: 'https://x.test' });
    const second = await flushProofQueue();
    expect(second).toBe(1);
    expect(okCalls.length).toBe(1);
  });

  test('retries on network throw — re-queues', async () => {
    const { fetchImpl: throwOnce, calls: c1 } = makeFetch({ status: 202, throwOnFirst: true });
    configureProof({ appSlug: 'recipe', fetchImpl: throwOnce, endpointOrigin: 'https://x.test' });
    emitProofEvent('peer_synced');
    const first = await flushProofQueue();
    expect(first).toBe(0); // threw
    expect(c1.length).toBe(0);
    // The same fetcher's second call returns 202 — event was re-queued so
    // the next flush sends it.
    const second = await flushProofQueue();
    expect(second).toBe(1);
    expect(c1.length).toBe(1);
    expect(c1[0]!.body.events[0]?.eventType).toBe('peer_synced');
  });

  test('flush is a no-op when nothing queued', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    expect(await flushProofQueue()).toBe(0);
    expect(calls.length).toBe(0);
  });

  test('successful flush resets the dedup set so the next observation period can re-emit', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    emitProofEvent('local_db_used');
    expect(await flushProofQueue()).toBe(1);
    // After flush, the same event becomes new again.
    emitProofEvent('local_db_used');
    expect(await flushProofQueue()).toBe(1);
    expect(calls.length).toBe(2);
  });

  test('flush is a no-op without configure', async () => {
    expect(await flushProofQueue()).toBe(0);
  });
});

describe('device hash', () => {
  test('reuses device hash across emits', async () => {
    const { fetchImpl, calls } = makeFetch({ status: 202 });
    configureProof({ appSlug: 'recipe', fetchImpl, endpointOrigin: 'https://x.test' });
    emitProofEvent('local_db_used');
    await flushProofQueue();
    emitProofEvent('ai_ran_local');
    await flushProofQueue();
    expect(calls.length).toBe(2);
    expect(calls[0]!.body.deviceHash).toBe(calls[1]!.body.deviceHash);
    expect(calls[0]!.body.deviceHash.length).toBeGreaterThanOrEqual(16);
  });
});
