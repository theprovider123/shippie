import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { attachSemanticHaptics, haptic } from './haptics.ts';

let calls: unknown[] = [];

const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalElement = (globalThis as { Element?: unknown }).Element;
const originalEvent = (globalThis as { Event?: unknown }).Event;

beforeEach(() => {
  calls = [];
  const win = new Window({ url: 'https://shippie.app/' });
  (globalThis as { document?: unknown }).document = win.document;
  (globalThis as { Element?: unknown }).Element = win.Element;
  (globalThis as { Event?: unknown }).Event = win.Event;
  (globalThis as { navigator?: unknown }).navigator = {
    vibrate: (pattern: number | number[]) => {
      calls.push(pattern);
      return true;
    },
  };
  (globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: false }),
  };
});

afterAll(() => {
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { Element?: unknown }).Element = originalElement;
  (globalThis as { Event?: unknown }).Event = originalEvent;
});

describe('haptic', () => {
  test('tap → short buzz', () => {
    haptic('tap');
    expect(calls).toEqual([10]);
  });
  test('success → two short', () => {
    haptic('success');
    expect(calls).toEqual([[10, 40, 10]]);
  });
  test('warn → medium buzz', () => {
    haptic('warn');
    expect(calls).toEqual([[20, 60, 20]]);
  });
  test('error → long + short', () => {
    haptic('error');
    expect(calls).toEqual([[40, 30, 10]]);
  });
  test('no-ops when prefers-reduced-motion is set', () => {
    (globalThis as { window?: unknown }).window = {
      matchMedia: () => ({ matches: true }),
    };
    haptic('tap');
    expect(calls).toEqual([]);
  });
  test('no-ops when navigator.vibrate is unavailable', () => {
    (globalThis as { navigator?: unknown }).navigator = {};
    haptic('tap');
    expect(calls).toEqual([]);
  });

  test('semantic haptics attach to buttons, toggles, forms, and invalid fields', () => {
    document.body.innerHTML = `
      <button id="button">Save</button>
      <input id="toggle" type="checkbox" />
      <form id="form"><input id="field" required /></form>
    `;
    const detach = attachSemanticHaptics(document);
    document.querySelector('#button')?.dispatchEvent(new Event('click', { bubbles: true }));
    document.querySelector('#toggle')?.dispatchEvent(new Event('click', { bubbles: true }));
    document.querySelector('#form')?.dispatchEvent(new Event('submit', { bubbles: true }));
    document.querySelector('#field')?.dispatchEvent(new Event('invalid', { bubbles: true }));
    detach();
    document.querySelector('#button')?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(calls).toEqual([10, 10, [10, 40, 10], [40, 30, 10]]);
  });
});
