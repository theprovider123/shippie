import { describe, expect, mock, test } from 'bun:test';
import {
  installRuntimeConnectionMonitor,
  readRuntimeConnections,
  runtimeConnectionStorageKey,
  type RuntimeConnectionGlobal,
} from './runtime-connections.ts';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function makeHost(): RuntimeConnectionGlobal & { localStorage: MemoryStorage } {
  const CustomEventCtor =
    globalThis.CustomEvent ??
    (class TestCustomEvent<T = unknown> extends Event {
      detail: T;
      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    } as unknown as typeof CustomEvent);
  return {
    fetch: mock(async () => new Response('{}')) as unknown as typeof fetch,
    navigator: {
      sendBeacon: mock(() => true),
    },
    location: {
      href: 'https://demo.shippie.app/',
      origin: 'https://demo.shippie.app',
      host: 'demo.shippie.app',
    },
    localStorage: new MemoryStorage(),
    CustomEvent: CustomEventCtor,
    dispatchEvent: mock(() => true),
  };
}

describe('runtime connection monitor', () => {
  test('records external fetch hosts locally without recording payloads', async () => {
    const host = makeHost();
    installRuntimeConnectionMonitor({ slug: 'recipe', version: 4, global: host });

    await host.fetch!('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ secret: 'do not store this' }),
    });

    const records = readRuntimeConnections('recipe', host.localStorage);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      host: 'api.openai.com',
      method: 'POST',
      category: 'external-ai',
      purpose: 'External AI processing',
      blocked: false,
    });
    expect(JSON.stringify(records)).not.toContain('do not store this');
  });

  test('keeps quiet for same-origin and Shippie platform calls', async () => {
    const host = makeHost();
    installRuntimeConnectionMonitor({ slug: 'quiet', global: host });

    await host.fetch!('/__shippie/meta');
    await host.fetch!('https://shippie.app/__shippie/health');

    expect(readRuntimeConnections('quiet', host.localStorage)).toEqual([]);
  });

  test('blocks known tracker and advertising hosts', async () => {
    const host = makeHost();
    installRuntimeConnectionMonitor({ slug: 'chatty', global: host });

    await expect(host.fetch!('https://www.google-analytics.com/collect')).rejects.toThrow(
      'Blocked by Shippie Connection Guard',
    );

    const records = readRuntimeConnections('chatty', host.localStorage);
    expect(records[0]).toMatchObject({
      host: 'www.google-analytics.com',
      category: 'tracker',
      blocked: true,
    });
  });

  test('uses a stable per-app storage key', () => {
    expect(runtimeConnectionStorageKey('palate')).toBe('shippie.runtime-connections.v1:palate');
  });
});
