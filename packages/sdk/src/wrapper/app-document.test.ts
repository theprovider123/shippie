import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { openAppDocument } from './app-document.ts';

const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
const originalIndexedDb = (globalThis as { indexedDB?: unknown }).indexedDB;

interface CounterPayload {
  delta: number;
}

describe('openAppDocument', () => {
  let win: Window;

  beforeEach(() => {
    win = new Window();
    (globalThis as { window?: unknown }).window = win;
    (globalThis as { localStorage?: unknown }).localStorage = win.localStorage;
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
  });

  afterEach(() => {
    win.close();
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDb;
  });

  test('opens an encrypted local-first document and renders local writes immediately', async () => {
    const doc = await openAppDocument<{ count: number }, CounterPayload>({
      appSlug: 'counter',
      documentName: 'main',
      initialState: { count: 0 },
      reducer: (state, event) => ({ count: state.count + event.payload.delta }),
    });

    await doc.append({ kind: 'counter.increment', payload: { delta: 2 } });

    expect(doc.state()).toEqual({ count: 2 });
    expect(doc.pendingEventIds()).toHaveLength(1);
  });

  test('reuses the same local document identity across reloads', async () => {
    const first = await openAppDocument<{ count: number }, CounterPayload>({
      appSlug: 'counter',
      initialState: { count: 0 },
      reducer: (state, event) => ({ count: state.count + event.payload.delta }),
    });
    await first.append({ kind: 'counter.increment', payload: { delta: 3 } });

    const second = await openAppDocument<{ count: number }, CounterPayload>({
      appSlug: 'counter',
      initialState: { count: 0 },
      reducer: (state, event) => ({ count: state.count + event.payload.delta }),
    });

    expect(second.state()).toEqual({ count: 3 });
    expect(second.events().map((event) => event.kind)).toEqual(['counter.increment']);
  });
});
