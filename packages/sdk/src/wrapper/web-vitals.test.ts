import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { observeWebVitals, type VitalSample } from './web-vitals.ts';

type ObserverCb = (list: { getEntries: () => unknown[] }) => void;

const origPO = (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver;
const origDoc = (globalThis as { document?: unknown }).document;
const origNav = (globalThis as { navigator?: unknown }).navigator;
const origPerf = (globalThis as { performance?: unknown }).performance;

let observers: { type: string; cb: ObserverCb }[] = [];
let visibilityListeners: (() => void)[] = [];
let pagehideListeners: (() => void)[] = [];

beforeEach(() => {
  observers = [];
  visibilityListeners = [];
  pagehideListeners = [];

  const FakePO = class {
    public cb: ObserverCb;
    constructor(cb: ObserverCb) {
      this.cb = cb;
    }
    observe(opts: { type: string; buffered?: boolean }) {
      observers.push({ type: opts.type, cb: this.cb });
    }
    disconnect() {}
  };
  (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = FakePO;

  (globalThis as { document?: unknown }).document = {
    visibilityState: 'visible',
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.push(listener);
      if (type === 'pagehide') pagehideListeners.push(listener);
    },
    removeEventListener: () => {},
  };

  (globalThis as { navigator?: unknown }).navigator = {};
  (globalThis as { performance?: unknown }).performance = {
    getEntriesByType: (t: string) => (t === 'navigation' ? [{ type: 'navigate' }] : []),
  };
});

afterEach(() => {
  // no-op — beforeEach resets
});

afterAll(() => {
  (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = origPO;
  (globalThis as { document?: unknown }).document = origDoc;
  (globalThis as { navigator?: unknown }).navigator = origNav;
  (globalThis as { performance?: unknown }).performance = origPerf;
});

describe('observeWebVitals', () => {
  test('does not emit until flush', () => {
    const got: VitalSample[] = [];
    observeWebVitals({ report: (s) => got.push(s) });
    const lcpObs = observers.find((o) => o.type === 'largest-contentful-paint')!;
    lcpObs.cb({ getEntries: () => [{ startTime: 1234 }] });
    expect(got.length).toBe(0);
  });

  test('emits LCP on flush with the latest largest-contentful-paint time', () => {
    const got: VitalSample[] = [];
    const flushHandle: { flush?: () => void } = {};
    observeWebVitals({ report: (s) => got.push(s), flushHandle });
    const lcpObs = observers.find((o) => o.type === 'largest-contentful-paint')!;
    lcpObs.cb({ getEntries: () => [{ startTime: 1200 }] });
    lcpObs.cb({ getEntries: () => [{ startTime: 2400 }] });
    flushHandle.flush!();
    const lcp = got.find((g) => g.name === 'LCP');
    expect(lcp?.value).toBe(2400);
  });

  test('emits CLS as the sum of non-input layout shifts', () => {
    const got: VitalSample[] = [];
    const flushHandle: { flush?: () => void } = {};
    observeWebVitals({ report: (s) => got.push(s), flushHandle });
    const clsObs = observers.find((o) => o.type === 'layout-shift')!;
    clsObs.cb({
      getEntries: () => [
        { value: 0.05, hadRecentInput: false },
        { value: 0.01, hadRecentInput: true }, // excluded
        { value: 0.03, hadRecentInput: false },
      ],
    });
    flushHandle.flush!();
    const cls = got.find((g) => g.name === 'CLS');
    expect(cls?.value).toBeCloseTo(0.08, 5);
  });

  test('emits INP as the max interaction duration', () => {
    const got: VitalSample[] = [];
    const flushHandle: { flush?: () => void } = {};
    observeWebVitals({ report: (s) => got.push(s), flushHandle });
    const inpObs = observers.find((o) => o.type === 'event' || o.type === 'first-input');
    expect(inpObs).not.toBeUndefined();
    inpObs!.cb({
      getEntries: () => [
        { duration: 48, interactionId: 1 },
        { duration: 160, interactionId: 2 },
        { duration: 72, interactionId: 3 },
        { duration: 999, interactionId: 0 }, // ignored (not an interaction)
      ],
    });
    flushHandle.flush!();
    const inp = got.find((g) => g.name === 'INP');
    expect(inp?.value).toBe(160);
  });

  test('returned detach prevents further emissions', () => {
    const got: VitalSample[] = [];
    const flushHandle: { flush?: () => void } = {};
    const detach = observeWebVitals({ report: (s) => got.push(s), flushHandle });
    detach();
    flushHandle.flush?.();
    expect(got.length).toBe(0);
  });

  test('every sample has a stable id and navigationType', () => {
    const got: VitalSample[] = [];
    const flushHandle: { flush?: () => void } = {};
    observeWebVitals({ report: (s) => got.push(s), flushHandle });
    const lcp = observers.find((o) => o.type === 'largest-contentful-paint')!;
    lcp.cb({ getEntries: () => [{ startTime: 100 }] });
    flushHandle.flush!();
    expect(got.length).toBeGreaterThanOrEqual(1);
    for (const s of got) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(['navigate', 'reload', 'back_forward', 'prerender', 'unknown']).toContain(s.navigationType);
    }
  });

  test('visibilitychange to hidden triggers flush', () => {
    const got: VitalSample[] = [];
    observeWebVitals({ report: (s) => got.push(s) });
    const lcp = observers.find((o) => o.type === 'largest-contentful-paint')!;
    lcp.cb({ getEntries: () => [{ startTime: 500 }] });
    // Simulate hidden state then fire the listener.
    (globalThis as { document?: { visibilityState: string } }).document!.visibilityState = 'hidden';
    for (const l of visibilityListeners) l();
    expect(got.some((s) => s.name === 'LCP')).toBe(true);
  });
});
