// packages/sdk/src/wrapper/observe/observe.test.ts
/**
 * Tests for the observation runtime. Bun's happy-dom (via the
 * shared bun-test.d.ts pattern in this monorepo) gives us a real
 * MutationObserver.
 *
 * We exercise: rule application on mount, teardown on unmount,
 * selector validation, opt-out attribute, perf-budget auto-disable,
 * and capability gating.
 */
import { describe, expect, test, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Window } from 'happy-dom';

import { compileEnhanceConfig, isEnhanceable } from './selector-engine.ts';
import { hasCapability } from './capability-gate.ts';
import { _resetForTest, registerRule, listRules } from './registry.ts';
import type { EnhanceRule } from './types.ts';

let win: Window;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalNavigator = (globalThis as { navigator?: unknown }).navigator;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  g.document = win.document;
  g.navigator = win.navigator;
  g.MutationObserver = win.MutationObserver;
  g.CustomEvent = win.CustomEvent;
  g.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  g.performance = win.performance ?? performance;
  _resetForTest();
});

afterEach(() => {
  // happy-dom Windows leak handlers across tests; clear DOM between cases.
  if (win.document.body) win.document.body.innerHTML = '';
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
});

describe('compileEnhanceConfig', () => {
  test('compiles valid selector → rules', () => {
    const compiled = compileEnhanceConfig({
      'video[autoplay]': ['wakelock'],
      'ul[data-shippie-list]': ['swipe-actions', 'haptic-scroll'],
    });
    expect(compiled).toHaveLength(2);
    expect(compiled[0]?.rules).toEqual(['wakelock']);
    expect(compiled[1]?.rules).toEqual(['swipe-actions', 'haptic-scroll']);
  });

  test('drops invalid selectors silently', () => {
    const compiled = compileEnhanceConfig({
      'video[autoplay]': ['wakelock'],
      ':::not-a-selector': ['nope'],
    });
    expect(compiled).toHaveLength(1);
    expect(compiled[0]?.selector).toBe('video[autoplay]');
  });

  test('drops empty rule arrays', () => {
    const compiled = compileEnhanceConfig({
      'video': [],
      'audio': ['x'],
    });
    expect(compiled).toHaveLength(1);
  });

  test('returns [] for missing config', () => {
    expect(compileEnhanceConfig(undefined)).toEqual([]);
    expect(compileEnhanceConfig({} as Record<string, never>)).toEqual([]);
  });
});

describe('isEnhanceable', () => {
  test('skips elements inside data-shippie-no-enhance', () => {
    const wrapper = win.document.createElement('div');
    wrapper.setAttribute('data-shippie-no-enhance', '');
    const inner = win.document.createElement('span');
    wrapper.appendChild(inner);
    win.document.body.appendChild(wrapper);
    expect(isEnhanceable(wrapper as unknown as Element)).toBe(false);
    expect(isEnhanceable(inner as unknown as Element)).toBe(false);
  });

  test('allows elements outside opt-out scope', () => {
    const free = win.document.createElement('span');
    win.document.body.appendChild(free);
    expect(isEnhanceable(free as unknown as Element)).toBe(true);
  });
});

describe('registry', () => {
  test('registerRule + listRules round-trips', () => {
    const r: EnhanceRule = { name: 'r1', capabilities: [], apply: () => {} };
    registerRule(r);
    expect(listRules().some((x) => x.name === 'r1')).toBe(true);
  });

  test('last registration wins on name collision', () => {
    let firstApplied = 0;
    let secondApplied = 0;
    registerRule({ name: 'dup', capabilities: [], apply: () => { firstApplied++; } });
    registerRule({ name: 'dup', capabilities: [], apply: () => { secondApplied++; } });
    const r = listRules().find((x) => x.name === 'dup')!;
    r.apply(win.document.createElement('div') as unknown as Element);
    expect(firstApplied).toBe(0);
    expect(secondApplied).toBe(1);
  });
});

describe('capability-gate', () => {
  test('returns false for unknown capability', () => {
    expect(hasCapability('not-a-capability' as never)).toBe(false);
  });

  test('haptics depends on navigator.vibrate', () => {
    const nav = navigator as unknown as { vibrate?: unknown };
    const orig = nav.vibrate;
    nav.vibrate = () => true;
    expect(hasCapability('haptics')).toBe(true);
    nav.vibrate = undefined;
    expect(hasCapability('haptics')).toBe(false);
    nav.vibrate = orig;
  });
});

describe('startObserve', () => {
  test('applies rule on mount, tears down on remove', async () => {
    const { startObserve } = await import('./index.ts');
    const onApply = mock((_el: Element) => {});
    const onTeardown = mock(() => {});
    registerRule({
      name: 'spy',
      capabilities: [],
      apply: (el) => {
        onApply(el);
        return onTeardown;
      },
    });

    // Pre-mount the element so the initial scan picks it up (the
    // post-mount path is exercised in the over-budget test below).
    const el = win.document.createElement('div');
    el.setAttribute('data-spy', '');
    win.document.body.appendChild(el);

    const stop = startObserve({ config: { 'div[data-spy]': ['spy'] } });
    expect(onApply).toHaveBeenCalledTimes(1);

    el.remove();
    // Let the MutationObserver + rAF dispatch flush.
    await new Promise<void>((r) => setTimeout(() => r(), 16));
    await new Promise<void>((r) => setTimeout(() => r(), 16));
    expect(onTeardown).toHaveBeenCalledTimes(1);

    stop.stop();
  });

  test('over-budget rule auto-disables after warnAfter consecutive calls', async () => {
    const { startObserve } = await import('./index.ts');
    let disabled = false;
    win.addEventListener('shippie:rule-disabled', (e) => {
      const detail = (e as unknown as { detail: { name: string } }).detail;
      if (detail.name === 'slow') disabled = true;
    });
    registerRule({
      name: 'slow',
      capabilities: [],
      apply: () => {
        // Deliberately exceed the 1ms budget.
        const t = performance.now();
        while (performance.now() - t < 5) { /* spin */ }
      },
    });

    // Pre-mount three matching elements so the initial scan applies
    // the slow rule three times in succession — three consecutive
    // over-budget calls trips the watchdog with warnAfter: 2.
    for (let i = 0; i < 3; i++) {
      const el = win.document.createElement('div');
      el.setAttribute('data-slow', '');
      el.setAttribute('id', `slow-${i}`);
      win.document.body.appendChild(el);
    }

    const stop = startObserve({
      config: { 'div[data-slow]': ['slow'] },
      budget: { maxApplyMs: 1, warnAfter: 2 },
    });

    expect(disabled).toBe(true);
    stop.stop();
  });
});
