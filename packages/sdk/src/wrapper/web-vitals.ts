// packages/sdk/src/wrapper/web-vitals.ts
/**
 * Client-side web-vitals collector for the wrapper runtime.
 *
 * Observes LCP, CLS, and INP. Holds state across the page lifetime and
 * emits one sample per metric when the page becomes hidden or unloads.
 * Simplified vs. the full `web-vitals` library — exact parity is Phase 5.
 *
 * No runtime deps. Callers pass a `report` callback; the wrapper batches
 * samples into the beacon path.
 */

export type VitalName = 'LCP' | 'CLS' | 'INP';

export interface VitalSample {
  name: VitalName;
  value: number;
  id: string;
  navigationType: 'navigate' | 'reload' | 'back_forward' | 'prerender' | 'unknown';
}

export interface WebVitalsOptions {
  report: (sample: VitalSample) => void;
  /** Test-only: bypass visibility trigger. */
  flushHandle?: { flush?: () => void };
}

interface PerfEntryLike {
  startTime?: number;
  value?: number;
  hadRecentInput?: boolean;
  duration?: number;
  interactionId?: number;
}

function randomId(): string {
  // Browser-safe 8-char id using getRandomValues, with a Math.random fallback.
  const bytes = new Uint8Array(4);
  const cryptoObj =
    (globalThis as { crypto?: { getRandomValues?: (buf: Uint8Array) => Uint8Array } }).crypto ??
    (globalThis as { msCrypto?: { getRandomValues?: (buf: Uint8Array) => Uint8Array } }).msCrypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function readNavigationType(): VitalSample['navigationType'] {
  try {
    const perf = (globalThis as { performance?: Performance }).performance;
    const nav = perf?.getEntriesByType?.('navigation') as
      | Array<{ type?: string }>
      | undefined;
    const t = nav?.[0]?.type;
    if (t === 'navigate' || t === 'reload' || t === 'back_forward' || t === 'prerender') return t;
  } catch {
    // fall through
  }
  return 'unknown';
}

type POCallback = (list: { getEntries: () => PerfEntryLike[] }) => void;
type POCtor = new (cb: POCallback) => {
  observe: (opts: { type: string; buffered?: boolean; durationThreshold?: number }) => void;
  disconnect: () => void;
};

export function observeWebVitals(options: WebVitalsOptions): () => void {
  if (typeof globalThis === 'undefined') return () => {};
  const PO = (globalThis as { PerformanceObserver?: POCtor }).PerformanceObserver;
  if (!PO) return () => {};

  let active = true;
  const observers: Array<{ disconnect: () => void }> = [];
  const pageId = randomId();
  const navigationType = readNavigationType();

  // LCP — keep the latest entry.
  let lcpValue: number | null = null;
  try {
    const lcp = new PO((list) => {
      const entries = list.getEntries();
      for (const e of entries) {
        if (typeof e.startTime === 'number') lcpValue = e.startTime;
      }
    });
    lcp.observe({ type: 'largest-contentful-paint', buffered: true });
    observers.push(lcp);
  } catch {
    // browser doesn't support this type; skip
  }

  // CLS — sum non-input layout-shift values.
  let clsValue = 0;
  try {
    const cls = new PO((list) => {
      const entries = list.getEntries();
      for (const e of entries) {
        if (!e.hadRecentInput && typeof e.value === 'number') {
          clsValue += e.value;
        }
      }
    });
    cls.observe({ type: 'layout-shift', buffered: true });
    observers.push(cls);
  } catch {
    // skip
  }

  // INP — max duration of interaction events. Prefer 'event'; fall back to 'first-input'.
  let inpValue = 0;
  let eventObsAttached = false;
  try {
    const inp = new PO((list) => {
      const entries = list.getEntries();
      for (const e of entries) {
        if (
          typeof e.interactionId === 'number' &&
          e.interactionId > 0 &&
          typeof e.duration === 'number'
        ) {
          if (e.duration > inpValue) inpValue = e.duration;
        }
      }
    });
    inp.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    observers.push(inp);
    eventObsAttached = true;
  } catch {
    // try first-input fallback
  }
  if (!eventObsAttached) {
    try {
      const fi = new PO((list) => {
        const entries = list.getEntries();
        for (const e of entries) {
          if (typeof e.duration === 'number' && e.duration > inpValue) inpValue = e.duration;
        }
      });
      fi.observe({ type: 'first-input', buffered: true });
      observers.push(fi);
    } catch {
      // skip
    }
  }

  let flushed = false;
  const flush = () => {
    if (!active || flushed) return;
    flushed = true;
    if (lcpValue !== null) {
      options.report({ name: 'LCP', value: lcpValue, id: pageId, navigationType });
    }
    options.report({ name: 'CLS', value: clsValue, id: pageId, navigationType });
    if (inpValue > 0) {
      options.report({ name: 'INP', value: inpValue, id: pageId, navigationType });
    }
  };

  if (options.flushHandle) options.flushHandle.flush = flush;

  const onVis = () => {
    const vs = (globalThis as { document?: { visibilityState?: string } }).document
      ?.visibilityState;
    if (vs === 'hidden') flush();
  };
  const onHide = () => flush();

  const doc = (globalThis as { document?: Document }).document;
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', onVis);
    doc.addEventListener('pagehide', onHide);
  }

  return () => {
    active = false;
    for (const o of observers) {
      try {
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('visibilitychange', onVis);
      doc.removeEventListener('pagehide', onHide);
    }
  };
}
