import { describe, expect, test } from 'bun:test';
import {
  createShippieIframeSdk,
  isTextureName,
  listBuiltinTextureNames,
} from './index.ts';

interface PostedMessage {
  message: unknown;
  targetOrigin: string;
}

function fakeWindow(): {
  win: any;
  posted: PostedMessage[];
  fireMessage: (data: unknown) => void;
} {
  const posted: PostedMessage[] = [];
  const listeners = new Set<(event: { data: unknown }) => void>();
  const win: any = {
    addEventListener(_type: string, h: (event: { data: unknown }) => void) {
      listeners.add(h);
    },
    removeEventListener(_type: string, h: (event: { data: unknown }) => void) {
      listeners.delete(h);
    },
  };
  // Parent receives the postMessage; we capture for assertion.
  const parent = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message, targetOrigin });
    },
  };
  win.parent = parent;
  win.self = win;
  return {
    win,
    posted,
    fireMessage(data) {
      for (const l of listeners) l({ data });
    },
  };
}

describe('createShippieIframeSdk — wire format + helpers', () => {
  test('builds a valid bridge envelope on intent.broadcast', () => {
    const { win, posted } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    sdk.intent.broadcast('cooked-meal', [{ title: 'Carbonara' }]);
    expect(posted).toHaveLength(1);
    const message = posted[0]!.message as Record<string, unknown>;
    expect(message.protocol).toBe('shippie.bridge.v1');
    expect(message.appId).toBe('app_demo');
    expect(message.capability).toBe('intent.provide');
    expect(message.method).toBe('broadcast');
    expect((message.payload as { intent: string }).intent).toBe('cooked-meal');
    delete (globalThis as any).window;
  });

  test('intent.subscribe receives shippie.intent.broadcast messages', () => {
    const { win, fireMessage } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    const received: any[] = [];
    sdk.intent.subscribe('workout-completed', (b) => received.push(b));
    fireMessage({
      kind: 'shippie.intent.broadcast',
      intent: 'workout-completed',
      rows: [{ id: 'w1' }],
      providerAppId: 'app_workout',
    });
    expect(received).toHaveLength(1);
    expect(received[0].rows).toEqual([{ id: 'w1' }]);
    expect(received[0].providerAppId).toBe('app_workout');
    delete (globalThis as any).window;
  });

  test('intent.subscribe ignores broadcasts for other intents', () => {
    const { win, fireMessage } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    const received: any[] = [];
    sdk.intent.subscribe('cooked-meal', (b) => received.push(b));
    fireMessage({ kind: 'shippie.intent.broadcast', intent: 'workout-completed', rows: [] });
    expect(received).toEqual([]);
    delete (globalThis as any).window;
  });

  test('intent.subscribe returns an unsubscribe handle', () => {
    const { win, fireMessage } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    const received: any[] = [];
    const off = sdk.intent.subscribe('cooked-meal', (b) => received.push(b));
    off();
    fireMessage({ kind: 'shippie.intent.broadcast', intent: 'cooked-meal', rows: [] });
    expect(received).toEqual([]);
    delete (globalThis as any).window;
  });

  test('feel.texture validates the preset name', () => {
    const { win, posted } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    sdk.feel.texture('confirm');
    sdk.feel.texture('not-a-real-texture' as any);
    expect(posted).toHaveLength(1);
    expect((posted[0]!.message as any).capability).toBe('feel.texture');
    delete (globalThis as any).window;
  });

  test('data.openPanel posts the right capability', () => {
    const { win, posted } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    sdk.data.openPanel();
    expect(posted).toHaveLength(1);
    expect((posted[0]!.message as any).capability).toBe('data.openPanel');
    delete (globalThis as any).window;
  });

  test('openYourData uses the container bridge when iframe-loaded', () => {
    const { win, posted } = fakeWindow();
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    sdk.openYourData({ appSlug: 'recipe-saver' });
    expect(posted).toHaveLength(1);
    expect((posted[0]!.message as any).capability).toBe('data.openPanel');
    delete (globalThis as any).window;
  });

  test('openYourData falls back to the platform data section outside a container', () => {
    let assigned = '';
    const win: any = {
      addEventListener() {},
      removeEventListener() {},
      location: {
        origin: 'https://shippie.app',
        assign(value: string) {
          assigned = value;
        },
      },
    };
    win.parent = win;
    win.self = win;
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    sdk.openYourData({ appSlug: 'recipe-saver' });
    expect(assigned).toBe('/container?section=data&app=recipe-saver');
    delete (globalThis as any).window;
  });

  test('all calls no-op outside a container (parent === window)', () => {
    const win: any = {
      addEventListener() {},
      removeEventListener() {},
    };
    win.parent = win; // same-window → standalone tab
    win.self = win;
    (globalThis as any).window = win;
    const sdk = createShippieIframeSdk({ appId: 'app_demo' });
    expect(sdk.inContainer).toBe(false);
    sdk.intent.broadcast('cooked-meal', [{}]);
    sdk.feel.texture('confirm');
    sdk.data.openPanel();
    sdk.requestIntent('cooked-meal');
    // No throws, no state changes — that's the whole assertion.
    expect(true).toBe(true);
    delete (globalThis as any).window;
  });

  test('listBuiltinTextureNames returns the 9 presets', () => {
    expect(listBuiltinTextureNames()).toHaveLength(9);
  });

  test('isTextureName recognises every preset', () => {
    for (const name of listBuiltinTextureNames()) {
      expect(isTextureName(name)).toBe(true);
    }
  });
});
