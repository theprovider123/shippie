import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  createLocalNavigation,
  installViewTransitionStyles,
  wrapNavigation,
  supportsViewTransitions,
} from './view-transitions.ts';

let win: Window;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalHistory = (globalThis as { history?: unknown }).history;
const originalLocation = (globalThis as { location?: unknown }).location;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test env
  globalThis.window = win;
  // @ts-expect-error test env
  globalThis.document = win.document;
  // @ts-ignore test env
  globalThis.history = win.history;
  // @ts-expect-error test env
  globalThis.location = win.location;
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { history?: unknown }).history = originalHistory;
  (globalThis as { location?: unknown }).location = originalLocation;
});

describe('supportsViewTransitions', () => {
  test('returns false when document.startViewTransition is missing', () => {
    expect(supportsViewTransitions()).toBe(false);
  });

  test('returns true when document.startViewTransition exists', () => {
    // @ts-expect-error injecting for test
    win.document.startViewTransition = () => ({ finished: Promise.resolve() });
    expect(supportsViewTransitions()).toBe(true);
  });
});

describe('wrapNavigation', () => {
  test('calls the callback directly when View Transitions unsupported', async () => {
    let called = 0;
    await wrapNavigation(() => {
      called += 1;
    });
    expect(called).toBe(1);
  });

  test('uses startViewTransition when available', async () => {
    let started = 0;
    let cbCalled = 0;
    let callbackResult: unknown;
    // @ts-expect-error injecting for test
    win.document.startViewTransition = (cb: () => void) => {
      started += 1;
      callbackResult = cb();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    };
    await wrapNavigation(() => {
      cbCalled += 1;
    }, { kind: 'rise' });
    expect(started).toBe(1);
    expect(cbCalled).toBe(1);
    expect(callbackResult).toBeUndefined();
    expect(win.document.documentElement.dataset.shippieTransition).toBeUndefined();
    expect(win.document.querySelector('style[data-shippie-view-transitions]')?.textContent).toContain('shippie-rise-in');
  });

  test('swallows native View Transition timeout errors after applying the update', async () => {
    let cbCalled = 0;
    // @ts-expect-error injecting for test
    win.document.startViewTransition = (cb: () => void) => {
      cb();
      return {
        finished: Promise.reject(new Error('View transition update callback timed out.')),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      };
    };
    await wrapNavigation(() => {
      cbCalled += 1;
    });
    expect(cbCalled).toBe(1);
    expect(win.document.documentElement.dataset.shippieTransition).toBeUndefined();
  });

  test('installs transition styles once', () => {
    const a = installViewTransitionStyles({ durationMs: 180 });
    const b = installViewTransitionStyles({ durationMs: 200 });
    expect(a).toBe(b);
    expect(win.document.querySelectorAll('style[data-shippie-view-transitions]')).toHaveLength(1);
    expect(a?.textContent).toContain('180ms');
  });
});

describe('createLocalNavigation', () => {
  test('pushes local state and rewinds it on browser back', async () => {
    let current = 'home';
    const nav = createLocalNavigation('home', (next) => {
      current = next;
    });

    await nav.navigate('detail', { kind: 'rise' });
    expect(current).toBe('detail');
    expect(nav.canGoBack()).toBe(true);

    win.dispatchEvent(new win.PopStateEvent('popstate', { state: null } as PopStateEventInit));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(current).toBe('home');
    expect(nav.canGoBack()).toBe(false);
    nav.destroy();
  });

  test('backOrReplace uses history when present and replace fallback when absent', async () => {
    let current = 'home';
    const nav = createLocalNavigation('home', (next) => {
      current = next;
    });

    await nav.navigate('detail');
    expect(await nav.backOrReplace('home')).toBe('back');
    win.dispatchEvent(new win.PopStateEvent('popstate', { state: null } as PopStateEventInit));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(current).toBe('home');

    expect(await nav.backOrReplace('home')).toBe('replace');
    expect(current).toBe('home');
    nav.destroy();
  });
});
