/**
 * Event source — subscribes to wrapper-emitted CustomEvents and persists
 * them through the storage layer.
 *
 * The wrapper bootstrap (packages/sdk/src/wrapper/observe-init.ts) dispatches
 * two event types on the global window:
 *
 *   - `shippie:pageview`     detail: { path: string; excerpt?: string }
 *   - `shippie:interaction`  detail: { target: string; kind: 'click' | 'submit' | 'scroll' | 'invalid' }
 *
 * `startTracking` attaches one listener per type and queues incoming events
 * into an in-memory buffer. A 250 ms debounced flush drains the buffer into
 * IndexedDB via `appendPageView` / `appendInteraction`. Debouncing matters
 * because a flurry of clicks (e.g. a user mashing a button or a slider firing
 * pointermove) shouldn't open one IDB transaction per event.
 *
 * Returns a `stop()` teardown that detaches the listeners, flushes any
 * pending buffered events, and clears the timer.
 */
import { appendInteraction, appendPageView } from './storage.ts';
import type { InteractionEvent, PageView } from './types.ts';

const DEBOUNCE_MS = 250;

interface PageViewDetail {
  path: string;
  excerpt?: string;
}

interface InteractionDetail {
  target: string;
  kind: InteractionEvent['kind'];
}

interface QueuedPageView {
  ts: number;
  detail: PageViewDetail;
}

interface QueuedInteraction {
  ts: number;
  detail: InteractionDetail;
}

interface TrackerState {
  pageviews: QueuedPageView[];
  interactions: QueuedInteraction[];
  timer: ReturnType<typeof setTimeout> | null;
  win: Window;
  pvHandler: (ev: Event) => void;
  ixHandler: (ev: Event) => void;
}

function isPageViewDetail(detail: unknown): detail is PageViewDetail {
  if (!detail || typeof detail !== 'object') return false;
  const d = detail as Record<string, unknown>;
  return typeof d.path === 'string';
}

function isInteractionDetail(detail: unknown): detail is InteractionDetail {
  if (!detail || typeof detail !== 'object') return false;
  const d = detail as Record<string, unknown>;
  if (typeof d.target !== 'string') return false;
  return d.kind === 'click' || d.kind === 'submit' || d.kind === 'scroll' || d.kind === 'invalid';
}

async function flush(state: TrackerState): Promise<void> {
  const pvs = state.pageviews.splice(0);
  const ixs = state.interactions.splice(0);
  for (const item of pvs) {
    const view: Omit<PageView, 'id'> = {
      path: item.detail.path,
      ts: item.ts,
    };
    if (item.detail.excerpt !== undefined) view.excerpt = item.detail.excerpt;
    try {
      await appendPageView(view);
    } catch {
      // Best-effort: a single failed write shouldn't kill the tracker.
    }
  }
  for (const item of ixs) {
    const ev: InteractionEvent = {
      ts: item.ts,
      target: item.detail.target,
      kind: item.detail.kind,
    };
    try {
      await appendInteraction(ev);
    } catch {
      // Best-effort: see above.
    }
  }
}

function schedule(state: TrackerState): void {
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void flush(state);
  }, DEBOUNCE_MS);
}

export function startTracking(opts?: { window?: Window }): () => void {
  const win = opts?.window ?? (typeof window !== 'undefined' ? window : undefined);
  if (!win) {
    // SSR / non-browser: no-op stop.
    return () => {};
  }

  const state: TrackerState = {
    pageviews: [],
    interactions: [],
    timer: null,
    win,
    pvHandler: () => {},
    ixHandler: () => {},
  };

  state.pvHandler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail;
    if (!isPageViewDetail(detail)) return;
    state.pageviews.push({ ts: Date.now(), detail });
    schedule(state);
  };
  state.ixHandler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail;
    if (!isInteractionDetail(detail)) return;
    state.interactions.push({ ts: Date.now(), detail });
    schedule(state);
  };

  win.addEventListener('shippie:pageview', state.pvHandler);
  win.addEventListener('shippie:interaction', state.ixHandler);

  return function stop(): void {
    win.removeEventListener('shippie:pageview', state.pvHandler);
    win.removeEventListener('shippie:interaction', state.ixHandler);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    // Drain anything still buffered on teardown so callers don't lose events.
    if (state.pageviews.length > 0 || state.interactions.length > 0) {
      void flush(state);
    }
  };
}
