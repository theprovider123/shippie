import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  attachBackSwipe,
  attachKeyboardAvoidance,
  attachPressFeedback,
  attachPullToRefresh,
} from './gestures.ts';

let win: Window;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test
  globalThis.window = win;
  // @ts-expect-error test
  globalThis.document = win.document;
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
});

function firePointer(
  target: { dispatchEvent(event: object): boolean },
  type: string,
  props: Record<string, number>,
) {
  const event = new win.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  target.dispatchEvent(event);
}

describe('attachBackSwipe', () => {
  test('invokes onTrigger when a swipe starts near left edge and crosses threshold', () => {
    let triggered = 0;
    const detach = attachBackSwipe({
      edgeWidth: 24,
      threshold: 60,
      onTrigger: () => {
        triggered += 1;
      },
    });
    firePointer(win.document, 'pointerdown', { clientX: 5, clientY: 400, pointerId: 1 });
    firePointer(win.document, 'pointermove', { clientX: 80, clientY: 400, pointerId: 1 });
    firePointer(win.document, 'pointerup', { clientX: 80, clientY: 400, pointerId: 1 });
    expect(triggered).toBe(1);
    detach();
  });

  test('does not trigger when starting point is not near edge', () => {
    let triggered = 0;
    const detach = attachBackSwipe({
      edgeWidth: 24,
      threshold: 60,
      onTrigger: () => {
        triggered += 1;
      },
    });
    firePointer(win.document, 'pointerdown', { clientX: 200, clientY: 400, pointerId: 1 });
    firePointer(win.document, 'pointermove', { clientX: 280, clientY: 400, pointerId: 1 });
    firePointer(win.document, 'pointerup', { clientX: 280, clientY: 400, pointerId: 1 });
    expect(triggered).toBe(0);
    detach();
  });

  test('detach removes listeners (no-op after)', () => {
    let triggered = 0;
    const detach = attachBackSwipe({ edgeWidth: 24, threshold: 60, onTrigger: () => (triggered += 1) });
    detach();
    firePointer(win.document, 'pointerdown', { clientX: 5, clientY: 400, pointerId: 1 });
    firePointer(win.document, 'pointermove', { clientX: 80, clientY: 400, pointerId: 1 });
    firePointer(win.document, 'pointerup', { clientX: 80, clientY: 400, pointerId: 1 });
    expect(triggered).toBe(0);
  });
});

describe('attachPullToRefresh', () => {
  test('invokes onRefresh when pulling down past threshold from scrollTop=0', () => {
    let refreshed = 0;
    const target = win.document.documentElement;
    const detach = attachPullToRefresh(target, {
      threshold: 60,
      onRefresh: () => {
        refreshed += 1;
      },
    });
    firePointer(target, 'pointerdown', { clientX: 100, clientY: 50, pointerId: 1 });
    firePointer(target, 'pointermove', { clientX: 100, clientY: 120, pointerId: 1 });
    firePointer(target, 'pointerup', { clientX: 100, clientY: 120, pointerId: 1 });
    expect(refreshed).toBe(1);
    detach();
  });

  test('does not trigger when scrollTop > 0', () => {
    let refreshed = 0;
    const target = win.document.documentElement;
    Object.defineProperty(target, 'scrollTop', { value: 200, writable: true, configurable: true });
    const detach = attachPullToRefresh(target, { threshold: 60, onRefresh: () => (refreshed += 1) });
    firePointer(target, 'pointerdown', { clientX: 100, clientY: 50, pointerId: 1 });
    firePointer(target, 'pointermove', { clientX: 100, clientY: 200, pointerId: 1 });
    firePointer(target, 'pointerup', { clientX: 100, clientY: 200, pointerId: 1 });
    expect(refreshed).toBe(0);
    detach();
  });
});

describe('attachPressFeedback', () => {
  test('marks interactive elements while pressed and clears on release', () => {
    win.document.body.innerHTML = '<button id="b">Tap</button>';
    const button = win.document.getElementById('b')!;
    const detach = attachPressFeedback(win.document);
    firePointer(button, 'pointerdown', { clientX: 10, clientY: 10, pointerId: 1 });
    expect(button.getAttribute('data-shippie-pressing')).toBe('true');
    firePointer(button, 'pointerup', { clientX: 10, clientY: 10, pointerId: 1 });
    expect(button.getAttribute('data-shippie-pressing')).toBeNull();
    detach();
  });
});

describe('attachKeyboardAvoidance', () => {
  test('scrolls focused text inputs into view after a short delay', async () => {
    win.document.body.innerHTML = '<input id="i" />';
    const input = win.document.getElementById('i') as unknown as HTMLInputElement & { scrolled?: boolean };
    input.scrollIntoView = () => {
      input.scrolled = true;
    };
    const detach = attachKeyboardAvoidance(win.document, { delayMs: 0 });
    input.dispatchEvent(new win.Event('focusin', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(input.scrolled).toBe(true);
    detach();
  });
});
