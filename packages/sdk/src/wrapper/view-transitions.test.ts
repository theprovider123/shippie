import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { installViewTransitionStyles, wrapNavigation, supportsViewTransitions } from './view-transitions.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test env
  globalThis.document = win.document;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
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
    // @ts-expect-error injecting for test
    win.document.startViewTransition = (cb: () => void) => {
      started += 1;
      cb();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    };
    await wrapNavigation(() => {
      cbCalled += 1;
    }, { kind: 'rise' });
    expect(started).toBe(1);
    expect(cbCalled).toBe(1);
    expect(win.document.documentElement.dataset.shippieTransition).toBeUndefined();
    expect(win.document.querySelector('style[data-shippie-view-transitions]')?.textContent).toContain('shippie-rise-in');
  });

  test('installs transition styles once', () => {
    const a = installViewTransitionStyles({ durationMs: 180 });
    const b = installViewTransitionStyles({ durationMs: 200 });
    expect(a).toBe(b);
    expect(win.document.querySelectorAll('style[data-shippie-view-transitions]')).toHaveLength(1);
    expect(a?.textContent).toContain('180ms');
  });
});
