import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  SHIPPIE_APP_LIFECYCLE_EVENT,
  createAppLifecyclePayload,
  reportAppNavigation,
} from './lifecycle.ts';

let win: Window;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalLocation = (globalThis as { location?: unknown }).location;
const originalPerformance = (globalThis as { performance?: unknown }).performance;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/__shippie-run/crewtrip/?tab=plans' });
  win.document.title = 'Crewtrip';
  // @ts-expect-error test env
  globalThis.window = win;
  // @ts-expect-error test env
  globalThis.document = win.document;
  // @ts-expect-error test env
  globalThis.location = win.location;
  // @ts-ignore test env
  globalThis.performance = win.performance;
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { location?: unknown }).location = originalLocation;
  (globalThis as { performance?: unknown }).performance = originalPerformance;
});

describe('app lifecycle contract', () => {
  test('builds a typed ready payload with URL context', () => {
    const payload = createAppLifecyclePayload({ event: 'ready', appId: 'app_crewtrip' });
    expect(payload.type).toBe(SHIPPIE_APP_LIFECYCLE_EVENT);
    expect(payload.version).toBe(1);
    expect(payload.event).toBe('ready');
    expect(payload.appId).toBe('app_crewtrip');
    expect(payload.path).toBe('/__shippie-run/crewtrip/?tab=plans');
    expect(payload.title).toBe('Crewtrip');
  });

  test('posts navigation state to the parent window', () => {
    const messages: unknown[] = [];
    Object.defineProperty(win, 'parent', {
      value: { postMessage: (message: unknown) => messages.push(message) },
      configurable: true,
    });

    reportAppNavigation({ canGoBack: true, navDepth: 2 });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: SHIPPIE_APP_LIFECYCLE_EVENT,
      event: 'navigation',
      canGoBack: true,
      navDepth: 2,
    });
  });
});
