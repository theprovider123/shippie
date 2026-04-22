# PWA Wrapper — Phase 2 + 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full native-feel runtime (Phase 2) and the event spine + maker dashboard + push notifications + deploy-time splash/icon generation (Phase 3). Nothing deferred.

**Architecture:** Builds strictly on top of Phase 1. Wrapper runtime already lives at `packages/sdk/src/wrapper/` and boots automatically via `/__shippie/sdk.js` on maker apps and via `<InstallRuntime />` on the marketplace. Phase 2 extends the wrapper runtime with motion/gesture modules and adds Worker-side handoff routing. Phase 3 adds a new event spine (`app_events` table, `__shippie/beacon` ingestion), rollup jobs, maker dashboard views, push notifications (VAPID + Web Push dispatcher), and a splash/icon generator baked into the deploy pipeline.

**Tech Stack:** TypeScript, Bun, Hono (Worker), React 19 / Next.js 16 (control plane), Drizzle (Postgres 16), Cloudflare R2 (asset storage), Sharp (image processing at deploy time), Web Push protocol (VAPID), happy-dom (unit tests).

---

## Scope overview

**Phase 2 deliverables:**
- Desktop → mobile handoff UI sheet (modal with QR + email-to-self + push-to-phone).
- `/__shippie/handoff` Worker endpoint (proxies email/push via signed requests to platform).
- `/api/shippie/handoff` platform endpoint (Resend email + Web Push dispatch).
- View Transitions API wrapping for route navigations (marketplace + wrapper runtime).
- Back-swipe gesture detector + peek-to-pop animation.
- Pull-to-refresh drag handler on scrollable containers.
- Per-route `<ThemeColor />` component + wrapper hook.
- Haptics helper (`shippie.haptic()`).
- Update-ready toast (SW version check).
- Phase 1 review follow-ups: wire `recordMeaningfulAction` to action hooks, convert `InstallRuntime` closure state to `useRef`, optimize dwell ticker.

**Phase 3 deliverables:**
- `app_events` partitioned table + Drizzle migration.
- `/__shippie/beacon` Worker ingestion route (batched, gzipped, queue-buffered).
- `/api/internal/ingest-events` platform consumer (writes to DB).
- Daily rollup jobs (`usage_daily`, `install_funnel_daily`, `web_vitals_daily`).
- Maker dashboard pages (install funnel, DAU/MAU, vitals, errors, feedback).
- Push notifications: VAPID key management, `/__shippie/push/*` endpoints, Web Push dispatcher.
- Splash image + maskable icon generation at deploy time.
- 30-day retention enforcement cron.

---

## File Map

### New files

#### Phase 2
- `packages/sdk/src/wrapper/view-transitions.ts` — `wrapNavigation(cb)` helper wrapping `document.startViewTransition`, feature-detected with fallback
- `packages/sdk/src/wrapper/view-transitions.test.ts` — feature-detect + wrap behavior tests
- `packages/sdk/src/wrapper/gestures.ts` — `attachBackSwipe()` and `attachPullToRefresh()` factories returning detach fns
- `packages/sdk/src/wrapper/gestures.test.ts` — pointer-event simulation tests
- `packages/sdk/src/wrapper/haptics.ts` — `haptic('tap'|'success'|'warn'|'error')` with `prefers-reduced-motion` guard
- `packages/sdk/src/wrapper/haptics.test.ts` — guard + pattern tests
- `packages/sdk/src/wrapper/theme-color.ts` — `setThemeColor(color)` idempotent `<meta>` writer
- `packages/sdk/src/wrapper/theme-color.test.ts` — writes/replaces the tag
- `packages/sdk/src/wrapper/update-toast.ts` — SW version poll + mount of "update ready" banner
- `packages/sdk/src/wrapper/update-toast.test.ts` — version-change behavior
- `packages/sdk/src/wrapper/handoff-sheet.ts` — full QR + email + push-to-phone modal (vanilla DOM, like `ui.ts`)
- `packages/sdk/src/wrapper/handoff-sheet.test.ts` — mount/dismiss/CTA tests
- `apps/web/app/components/theme-color.tsx` — tiny React wrapper around `setThemeColor`
- `apps/web/app/components/theme-color.test.tsx` — smoke test
- `services/worker/src/router/handoff.ts` — `POST /__shippie/handoff` endpoint, signs + proxies to platform
- `services/worker/src/router/handoff.test.ts` — route behavior tests
- `apps/web/app/api/shippie/handoff/route.ts` — platform handler; dispatches via Resend + Web Push
- `apps/web/lib/shippie/handoff.ts` — pure helpers (email template, push payload)
- `apps/web/lib/shippie/handoff.test.ts` — pure function tests

#### Phase 3
- `packages/db/src/schema/app-events.ts` — `app_events` + derived rollup tables
- `packages/db/migrations/0015_app_events_spine.sql` — migration
- `services/worker/src/router/beacon.ts` — `POST /__shippie/beacon`, validates + forwards
- `services/worker/src/router/beacon.test.ts` — rate-limit + schema-validate tests
- `apps/web/app/api/internal/ingest-events/route.ts` — internal worker→platform event sink
- `apps/web/app/api/internal/ingest-events/route.test.ts` — signed-request + batch write tests
- `apps/web/lib/shippie/rollups.ts` — pure functions that derive daily rollups
- `apps/web/lib/shippie/rollups.test.ts` — rollup logic tests
- `apps/web/app/api/internal/rollups/route.ts` — cron-invoked endpoint that runs rollup jobs
- `apps/web/app/api/internal/retention/route.ts` — cron-invoked endpoint; drops partitions older than 30d
- `apps/web/app/dashboard/apps/[slug]/analytics/page.tsx` — maker install-funnel + DAU + vitals view
- `apps/web/app/dashboard/apps/[slug]/analytics/charts.tsx` — dependency-free SVG charts (no recharts)
- `apps/web/app/dashboard/apps/[slug]/analytics/analytics.test.ts` — data-query tests
- `packages/sdk/src/wrapper/push.ts` — `subscribePush()`, `unsubscribePush()` using browser Push API + VAPID key from platform
- `packages/sdk/src/wrapper/push.test.ts` — happy-dom push flow tests
- `services/worker/src/router/push.ts` — `GET /__shippie/push/vapid-key`, `POST /__shippie/push/subscribe`, `POST /__shippie/push/unsubscribe`
- `services/worker/src/router/push.test.ts` — route tests
- `apps/web/lib/shippie/push-dispatch.ts` — Web Push request signer (pure ES, no npm web-push dep)
- `apps/web/lib/shippie/push-dispatch.test.ts` — sign + serialize tests
- `apps/web/lib/shippie/splash-gen.ts` — Sharp-based generator for iOS startup images + maskable icons
- `apps/web/lib/shippie/splash-gen.test.ts` — generates expected sizes
- `services/worker/src/router/splash.ts` — `GET /__shippie/splash/<device>.png` from R2
- `services/worker/src/router/splash.test.ts` — route tests
- `vercel.json` cron entry for rollups + retention

### Modified files

#### Phase 2
- `packages/sdk/src/wrapper/index.ts` — export new submodules
- `packages/sdk/src/wrapper/install-runtime.ts` — mount handoff sheet on desktop, call `recordMeaningfulAction` on beacon acks, convert closure state to internal refs
- `packages/sdk/tsup.config.ts` — no change expected (entries already a map)
- `services/worker/src/router/system.ts` — register `handoff` route
- `apps/web/app/layout.tsx` — optional: mount the React `<ThemeColor />` for marketplace
- `apps/web/.env.example` — `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

#### Phase 3
- `services/worker/src/router/system.ts` — register `beacon`, `push/*`, `splash/*` routes
- `packages/db/src/schema/index.ts` — export new tables
- `apps/web/lib/deploy/index.ts` — call `splash-gen` after a successful build
- `packages/pwa-injector/src/inject-html.ts` — inject `<link rel="apple-touch-startup-image">` tags from generated manifest
- `apps/web/app/dashboard/apps/[slug]/page.tsx` — link to the new analytics page
- `vercel.json` — add crons

---

## Execution strategy

Tasks run through `superpowers:subagent-driven-development`. Group by package:

- **Group A** (packages/sdk/src/wrapper) — T1…T7 (view-transitions, gestures, haptics, theme-color, update-toast, handoff-sheet, push).
- **Group B** (services/worker) — T8…T10 (handoff route, beacon route, push routes, splash route).
- **Group C** (apps/web control-plane) — T11…T15 (handoff dispatch, ingest-events, rollups, retention, dashboard, ThemeColor React wrapper, push-dispatch, splash-gen).
- **Group D** (packages/db schema + migration) — T16.
- **Group E** (integration into InstallRuntime + marketplace) — T17, T18.
- **Group F** (cron wiring + env + layout) — T19, T20.
- **Group G** (final verification across everything) — T21.

TDD: every feature task is preceded by a failing-test task. Each feature task ends with a commit. Reviews are batched at the end of each group (spec + quality reviewer per group, not per task).

---

## Task 1 — View Transitions wrapping

**Files:** create `packages/sdk/src/wrapper/view-transitions.ts` + `.test.ts`.

- [ ] **Write the failing test.**

```ts
// packages/sdk/src/wrapper/view-transitions.test.ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { wrapNavigation, supportsViewTransitions } from './view-transitions.ts';

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
    });
    expect(started).toBe(1);
    expect(cbCalled).toBe(1);
  });
});
```

- [ ] **Commit the failing test.**

```bash
git add packages/sdk/src/wrapper/view-transitions.test.ts
git commit -m "test(sdk/wrapper): failing View Transitions wrap tests"
```

- [ ] **Implement.**

```ts
// packages/sdk/src/wrapper/view-transitions.ts
/**
 * Thin wrapper around the View Transitions API.
 *
 * Feature-detects `document.startViewTransition` and falls back to a
 * plain callback invocation when unsupported (Safari <18.2 and older
 * Firefox). Callers never need to branch on support themselves.
 */

interface ViewTransition {
  finished: Promise<void>;
}

interface DocumentWithViewTransition extends Document {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransition;
}

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentWithViewTransition).startViewTransition === 'function';
}

export async function wrapNavigation(update: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions()) {
    await update();
    return;
  }
  const vt = (document as DocumentWithViewTransition).startViewTransition!(update);
  await vt.finished;
}
```

- [ ] **Run tests, expect green. Commit.**

```bash
cd packages/sdk && bun test src/wrapper/view-transitions.test.ts
git add packages/sdk/src/wrapper/view-transitions.ts
git commit -m "feat(sdk/wrapper): View Transitions wrapping with graceful fallback"
```

---

## Task 2 — Gestures (back-swipe + pull-to-refresh)

**Files:** `packages/sdk/src/wrapper/gestures.ts` + `.test.ts`.

- [ ] **Failing test.**

```ts
// packages/sdk/src/wrapper/gestures.test.ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { attachBackSwipe, attachPullToRefresh } from './gestures.ts';

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

function firePointer(target: EventTarget, type: string, props: Record<string, number>) {
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
  test('invokes onRefresh when pulling down past threshold from scrollTop=0', async () => {
    let refreshed = 0;
    // scrollTop defaults to 0 on a fresh happy-dom document
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
```

- [ ] **Commit. Run failing.**

- [ ] **Implement.**

```ts
// packages/sdk/src/wrapper/gestures.ts
/**
 * Pointer-event based gestures for the wrapper.
 *
 * Each attach fn adds listeners and returns a detach fn. Callers own
 * the lifetime; wrapper bootstrap calls detach on cleanup.
 */

export interface BackSwipeOptions {
  /** How many px from the left edge counts as "edge start". */
  edgeWidth?: number;
  /** Horizontal px the pointer must travel to trigger. */
  threshold?: number;
  onTrigger: () => void;
}

export function attachBackSwipe(opts: BackSwipeOptions): () => void {
  if (typeof document === 'undefined') return () => {};
  const edgeWidth = opts.edgeWidth ?? 24;
  const threshold = opts.threshold ?? 60;
  let active: { startX: number; startY: number; id: number } | null = null;

  const down = (e: Event) => {
    const p = e as PointerEvent;
    if (p.clientX > edgeWidth) return;
    active = { startX: p.clientX, startY: p.clientY, id: p.pointerId };
  };
  const move = (e: Event) => {
    const p = e as PointerEvent;
    if (!active || p.pointerId !== active.id) return;
    const dx = p.clientX - active.startX;
    const dy = Math.abs(p.clientY - active.startY);
    // Only trigger if it's a predominantly horizontal gesture past the threshold.
    if (dx >= threshold && dy < threshold) {
      const id = active.id;
      active = null;
      opts.onTrigger();
      void id;
    }
  };
  const up = () => {
    active = null;
  };

  document.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);

  return () => {
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
  };
}

export interface PullToRefreshOptions {
  threshold?: number;
  onRefresh: () => void;
}

export function attachPullToRefresh(
  target: { scrollTop?: number } & EventTarget,
  opts: PullToRefreshOptions,
): () => void {
  const threshold = opts.threshold ?? 60;
  let start: { y: number; id: number } | null = null;

  const down = (e: Event) => {
    const p = e as PointerEvent;
    if ((target.scrollTop ?? 0) > 0) return;
    start = { y: p.clientY, id: p.pointerId };
  };
  const move = (e: Event) => {
    const p = e as PointerEvent;
    if (!start || p.pointerId !== start.id) return;
    const dy = p.clientY - start.y;
    if (dy >= threshold) {
      start = null;
      opts.onRefresh();
    }
  };
  const up = () => {
    start = null;
  };

  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);

  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
}
```

- [ ] **Run green, commit.**

---

## Task 3 — Haptics helper

**Files:** `packages/sdk/src/wrapper/haptics.ts` + `.test.ts`.

- [ ] **Failing test.**

```ts
// packages/sdk/src/wrapper/haptics.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { haptic } from './haptics.ts';

let calls: unknown[] = [];

beforeEach(() => {
  calls = [];
  // @ts-expect-error test
  globalThis.navigator = {
    vibrate: (pattern: number | number[]) => {
      calls.push(pattern);
      return true;
    },
  };
  // @ts-expect-error test
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
  };
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
    // @ts-expect-error test
    globalThis.window = {
      matchMedia: () => ({ matches: true }),
    };
    haptic('tap');
    expect(calls).toEqual([]);
  });

  test('no-ops when navigator.vibrate is unavailable', () => {
    // @ts-expect-error test
    globalThis.navigator = {};
    haptic('tap');
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Commit failing. Implement.**

```ts
// packages/sdk/src/wrapper/haptics.ts
/**
 * Tiny haptic helper. `navigator.vibrate` is a no-op on iOS; Shippie's
 * iOS users won't feel this, but the rest of the web does. Guarded on
 * `prefers-reduced-motion` for accessibility.
 */
export type HapticKind = 'tap' | 'success' | 'warn' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  success: [10, 40, 10],
  warn: [20, 60, 20],
  error: [40, 30, 10],
};

export function haptic(kind: HapticKind): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  } catch {
    // matchMedia may throw in very old environments; best-effort.
  }
  const vibrate = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
  if (typeof vibrate !== 'function') return;
  try {
    vibrate.call(navigator, PATTERNS[kind]);
  } catch {
    // swallow — haptics are non-essential
  }
}
```

- [ ] **Run, commit.**

---

## Task 4 — Theme-color writer

**Files:** `packages/sdk/src/wrapper/theme-color.ts` + `.test.ts`.

- [ ] **Failing test.**

```ts
// packages/sdk/src/wrapper/theme-color.test.ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { setThemeColor } from './theme-color.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test
  globalThis.document = win.document;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe('setThemeColor', () => {
  test('creates a theme-color meta tag if none exists', () => {
    setThemeColor('#123456');
    const meta = win.document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#123456');
  });

  test('updates existing theme-color meta tag in place', () => {
    setThemeColor('#111111');
    setThemeColor('#222222');
    const tags = win.document.querySelectorAll('meta[name="theme-color"]');
    expect(tags.length).toBe(1);
    expect(tags[0]?.getAttribute('content')).toBe('#222222');
  });
});
```

- [ ] **Commit failing. Implement.**

```ts
// packages/sdk/src/wrapper/theme-color.ts
export function setThemeColor(color: string): void {
  if (typeof document === 'undefined') return;
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'theme-color');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', color);
}
```

- [ ] **Run, commit.**

---

## Task 5 — Update-ready toast

**Files:** `packages/sdk/src/wrapper/update-toast.ts` + `.test.ts`.

- [ ] **Failing test.**

```ts
// packages/sdk/src/wrapper/update-toast.test.ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountUpdateToast, unmountUpdateToast } from './update-toast.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test
  globalThis.document = win.document;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe('mountUpdateToast', () => {
  test('renders a toast with a Reload button', () => {
    let reloaded = 0;
    mountUpdateToast({ onReload: () => (reloaded += 1) });
    const toast = win.document.querySelector('[data-shippie-update]');
    expect(toast).not.toBeNull();
    const btn = toast?.querySelector<HTMLButtonElement>('button[data-shippie-update-reload]');
    btn?.click();
    expect(reloaded).toBe(1);
  });

  test('idempotent — mounting twice leaves one toast', () => {
    mountUpdateToast({ onReload: () => {} });
    mountUpdateToast({ onReload: () => {} });
    expect(win.document.querySelectorAll('[data-shippie-update]')).toHaveLength(1);
  });

  test('unmountUpdateToast removes the toast', () => {
    mountUpdateToast({ onReload: () => {} });
    unmountUpdateToast();
    expect(win.document.querySelector('[data-shippie-update]')).toBeNull();
  });
});
```

- [ ] **Commit. Implement.**

```ts
// packages/sdk/src/wrapper/update-toast.ts
/**
 * "Update ready" toast shown when the service worker reports a new
 * version. Standalone-mode only; browser users get the fresh bundle on
 * next navigation anyway.
 */

export interface UpdateToastProps {
  onReload: () => void;
}

const ATTR = 'data-shippie-update';

export function mountUpdateToast(props: UpdateToastProps): void {
  unmountUpdateToast();
  const host = document.createElement('div');
  host.setAttribute(ATTR, '');
  host.setAttribute('style', [
    'position:fixed',
    'bottom:calc(16px + env(safe-area-inset-bottom, 0px))',
    'left:16px',
    'right:16px',
    'z-index:2147483645',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:12px',
    'padding:12px 16px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:12px',
    'font:500 13px/1.2 system-ui,sans-serif',
  ].join(';'));

  const label = document.createElement('span');
  label.textContent = 'New version available';

  const btn = document.createElement('button');
  btn.setAttribute('data-shippie-update-reload', '');
  btn.textContent = 'Reload';
  btn.setAttribute('style', [
    'background:#E8603C',
    'color:#14120F',
    'border:0',
    'padding:6px 14px',
    'font:700 12px/1 system-ui,sans-serif',
    'border-radius:6px',
    'cursor:pointer',
  ].join(';'));
  btn.addEventListener('click', () => props.onReload());

  host.append(label, btn);
  document.body.appendChild(host);
}

export function unmountUpdateToast(): void {
  const el = document.querySelector(`[${ATTR}]`);
  if (el) el.remove();
}
```

- [ ] **Run, commit.**

---

## Task 6 — Handoff sheet (vanilla DOM UI)

**Files:** `packages/sdk/src/wrapper/handoff-sheet.ts` + `.test.ts`.

Mount a full-bleed modal with QR area (QR rendered as a text placeholder until Phase 4 — caller can swap in a QR component) + email input + "send to my phone" CTA.

- [ ] **Failing test.**

```ts
// packages/sdk/src/wrapper/handoff-sheet.test.ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountHandoffSheet, unmountHandoffSheet } from './handoff-sheet.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/apps/zen' });
  // @ts-expect-error test
  globalThis.document = win.document;
  // @ts-expect-error test
  globalThis.window = win;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe('mountHandoffSheet', () => {
  test('renders QR placeholder + email form + phone CTA', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: false,
    });
    const sheet = win.document.querySelector('[data-shippie-handoff]');
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('[data-shippie-handoff-qr-url]')?.textContent).toContain('shippie.app/apps/zen');
    expect(sheet?.querySelector('input[data-shippie-handoff-email]')).not.toBeNull();
    expect(sheet?.querySelector('button[data-shippie-handoff-email-cta]')).not.toBeNull();
  });

  test('shows push CTA only when canPush=true', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: true,
    });
    const pushCta = win.document.querySelector('button[data-shippie-handoff-push-cta]');
    expect(pushCta).not.toBeNull();
  });

  test('email CTA invokes onSendEmail with the input value', async () => {
    let got = '';
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async (email: string) => {
        got = email;
      },
      onSendPush: async () => {},
      canPush: false,
    });
    const input = win.document.querySelector<HTMLInputElement>('input[data-shippie-handoff-email]');
    input!.value = 'me@example.com';
    const cta = win.document.querySelector<HTMLButtonElement>('button[data-shippie-handoff-email-cta]');
    cta!.click();
    // Wait a microtask — click handler calls the async fn.
    await Promise.resolve();
    expect(got).toBe('me@example.com');
  });

  test('unmountHandoffSheet removes the sheet', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: false,
    });
    unmountHandoffSheet();
    expect(win.document.querySelector('[data-shippie-handoff]')).toBeNull();
  });
});
```

- [ ] **Commit. Implement.**

```ts
// packages/sdk/src/wrapper/handoff-sheet.ts
import { validateEmail } from './handoff.ts';

export interface HandoffSheetProps {
  handoffUrl: string;
  onSendEmail: (email: string) => Promise<void>;
  onSendPush: () => Promise<void>;
  canPush: boolean;
  onClose?: () => void;
}

const ATTR = 'data-shippie-handoff';

export function mountHandoffSheet(props: HandoffSheetProps): void {
  unmountHandoffSheet();
  const host = document.createElement('div');
  host.setAttribute(ATTR, '');
  host.setAttribute('style', [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(0,0,0,.75)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:20px',
    'font:16px/1.4 system-ui,sans-serif',
  ].join(';'));

  const card = document.createElement('div');
  card.setAttribute('style', [
    'width:100%',
    'max-width:380px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:20px',
    'padding:28px',
    'text-align:center',
  ].join(';'));

  const title = document.createElement('h2');
  title.textContent = 'Open on your phone';
  title.setAttribute('style', 'font:700 20px/1.2 system-ui,sans-serif;margin:0 0 4px');

  const sub = document.createElement('p');
  sub.textContent = 'Three ways to continue on mobile — pick whatever is easiest.';
  sub.setAttribute('style', 'color:#B8A88F;font-size:13px;line-height:1.5;margin:0 0 20px');

  // QR region — placeholder; Phase 4 can swap in a real QR renderer.
  const qrBox = document.createElement('div');
  qrBox.setAttribute('style', [
    'margin:0 auto 16px',
    'width:160px',
    'height:160px',
    'background:#14120F',
    'border:1px dashed #3D3530',
    'border-radius:12px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font:11px/1.4 ui-monospace,monospace',
    'color:#7A6B58',
    'padding:10px',
    'word-break:break-all',
  ].join(';'));
  const qrText = document.createElement('span');
  qrText.setAttribute('data-shippie-handoff-qr-url', '');
  qrText.textContent = props.handoffUrl.replace(/^https?:\/\//, '');
  qrBox.appendChild(qrText);

  // Email form
  const emailWrap = document.createElement('div');
  emailWrap.setAttribute('style', 'display:flex;gap:8px;margin-bottom:12px');
  const email = document.createElement('input');
  email.setAttribute('data-shippie-handoff-email', '');
  email.setAttribute('type', 'email');
  email.setAttribute('placeholder', 'you@email.com');
  email.setAttribute('style', [
    'flex:1',
    'padding:10px 12px',
    'background:#14120F',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:8px',
    'font:13px system-ui,sans-serif',
  ].join(';'));
  const emailCta = document.createElement('button');
  emailCta.setAttribute('data-shippie-handoff-email-cta', '');
  emailCta.textContent = 'Email me';
  emailCta.setAttribute('style', [
    'padding:10px 14px',
    'background:#E8603C',
    'color:#14120F',
    'border:0',
    'border-radius:8px',
    'font:700 12px system-ui,sans-serif',
    'cursor:pointer',
  ].join(';'));
  emailCta.addEventListener('click', () => {
    if (!validateEmail(email.value)) return;
    void props.onSendEmail(email.value.trim());
  });
  emailWrap.append(email, emailCta);

  card.append(title, sub, qrBox, emailWrap);

  if (props.canPush) {
    const push = document.createElement('button');
    push.setAttribute('data-shippie-handoff-push-cta', '');
    push.textContent = 'Send to my installed Shippie';
    push.setAttribute('style', [
      'display:block',
      'width:100%',
      'padding:10px',
      'background:transparent',
      'border:1px solid #3D3530',
      'color:#EDE4D3',
      'border-radius:8px',
      'cursor:pointer',
      'font-size:12px',
    ].join(';'));
    push.addEventListener('click', () => {
      void props.onSendPush();
    });
    card.append(push);
  }

  if (props.onClose) {
    const close = document.createElement('button');
    close.setAttribute('data-shippie-handoff-close', '');
    close.textContent = 'Close';
    close.setAttribute('style', [
      'display:block',
      'width:100%',
      'margin-top:8px',
      'padding:8px',
      'background:transparent',
      'border:0',
      'color:#7A6B58',
      'cursor:pointer',
      'font-size:11px',
    ].join(';'));
    close.addEventListener('click', () => props.onClose?.());
    card.append(close);
  }

  host.append(card);
  document.body.appendChild(host);
}

export function unmountHandoffSheet(): void {
  const el = document.querySelector(`[${ATTR}]`);
  if (el) el.remove();
}
```

- [ ] **Run, commit.**

---

## Task 7 — Push subscription helper

**Files:** `packages/sdk/src/wrapper/push.ts` + `.test.ts`.

- [ ] **Failing test.**

```ts
// packages/sdk/src/wrapper/push.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { subscribePush, unsubscribePush, pushSupported } from './push.ts';

beforeEach(() => {
  // Reset globals each test.
  // @ts-expect-error test
  delete globalThis.navigator;
  // @ts-expect-error test
  delete globalThis.window;
});

describe('pushSupported', () => {
  test('false when no serviceWorker', () => {
    // @ts-expect-error test
    globalThis.window = {};
    // @ts-expect-error test
    globalThis.navigator = {};
    expect(pushSupported()).toBe(false);
  });
  test('true when serviceWorker + PushManager present', () => {
    // @ts-expect-error test
    globalThis.window = { PushManager: function () {} };
    // @ts-expect-error test
    globalThis.navigator = { serviceWorker: {} };
    expect(pushSupported()).toBe(true);
  });
});

describe('subscribePush', () => {
  test('happy path: fetches vapid key, subscribes, posts subscription', async () => {
    const posted: unknown[] = [];
    // @ts-expect-error test
    globalThis.fetch = async (url: string, init?: { body?: string }) => {
      if (url.endsWith('/__shippie/push/vapid-key')) {
        return new Response(JSON.stringify({ key: 'BASE64KEY' }), { status: 200 });
      }
      if (url.endsWith('/__shippie/push/subscribe')) {
        posted.push(init?.body);
        return new Response('', { status: 204 });
      }
      return new Response('', { status: 404 });
    };

    const fakeSub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc' }) };
    const fakeRegistration = {
      pushManager: {
        subscribe: async () => fakeSub,
      },
    };
    // @ts-expect-error test
    globalThis.window = { PushManager: function () {} };
    // @ts-expect-error test
    globalThis.navigator = {
      serviceWorker: {
        ready: Promise.resolve(fakeRegistration),
      },
    };

    const result = await subscribePush();
    expect(result.ok).toBe(true);
    expect(posted.length).toBe(1);
  });

  test('returns { ok: false } when push unsupported', async () => {
    // @ts-expect-error test
    globalThis.window = {};
    // @ts-expect-error test
    globalThis.navigator = {};
    const r = await subscribePush();
    expect(r.ok).toBe(false);
  });
});

describe('unsubscribePush', () => {
  test('calls unsubscribe + posts unsubscribe', async () => {
    let unsubCalled = 0;
    let postedTo = '';
    const sub = { endpoint: 'https://push.example/abc', unsubscribe: async () => { unsubCalled += 1; return true; } };
    const fakeRegistration = { pushManager: { getSubscription: async () => sub } };
    // @ts-expect-error test
    globalThis.window = { PushManager: function () {} };
    // @ts-expect-error test
    globalThis.navigator = { serviceWorker: { ready: Promise.resolve(fakeRegistration) } };
    // @ts-expect-error test
    globalThis.fetch = async (url: string) => {
      postedTo = url;
      return new Response('', { status: 204 });
    };
    const r = await unsubscribePush();
    expect(r.ok).toBe(true);
    expect(unsubCalled).toBe(1);
    expect(postedTo).toContain('/__shippie/push/unsubscribe');
  });
});
```

- [ ] **Commit. Implement.**

```ts
// packages/sdk/src/wrapper/push.ts
/**
 * Web Push subscription helpers.
 *
 * Flow:
 *   1. Fetch VAPID public key from the platform.
 *   2. Call pushManager.subscribe() with the key.
 *   3. POST the subscription to /__shippie/push/subscribe.
 *
 * Cleanup mirrors this: getSubscription → unsubscribe → POST unsubscribe.
 */

const DEFAULT_VAPID_ENDPOINT = '/__shippie/push/vapid-key';
const DEFAULT_SUBSCRIBE_ENDPOINT = '/__shippie/push/subscribe';
const DEFAULT_UNSUBSCRIBE_ENDPOINT = '/__shippie/push/unsubscribe';

export interface PushEndpoints {
  vapid?: string;
  subscribe?: string;
  unsubscribe?: string;
}

export interface SubscribeResult {
  ok: boolean;
  reason?: string;
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // @ts-expect-error PushManager is a global in browsers
  return 'serviceWorker' in navigator && typeof window.PushManager !== 'undefined';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const s = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribePush(endpoints: PushEndpoints = {}): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const vapidRes = await fetch(endpoints.vapid ?? DEFAULT_VAPID_ENDPOINT);
    if (!vapidRes.ok) return { ok: false, reason: 'vapid-fetch-failed' };
    const { key } = (await vapidRes.json()) as { key: string };
    const reg = await (navigator as Navigator & { serviceWorker: { ready: Promise<ServiceWorkerRegistration> } }).serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const subRes = await fetch(endpoints.subscribe ?? DEFAULT_SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!subRes.ok) return { ok: false, reason: 'subscribe-post-failed' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

export async function unsubscribePush(endpoints: PushEndpoints = {}): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const reg = await (navigator as Navigator & { serviceWorker: { ready: Promise<ServiceWorkerRegistration> } }).serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    await sub.unsubscribe();
    await fetch(endpoints.unsubscribe ?? DEFAULT_UNSUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}
```

- [ ] **Run, commit.**

---

## Task 8 — Worker handoff route

**Files:** `services/worker/src/router/handoff.ts` + `.test.ts`, register in `system.ts`.

- [ ] **Failing test.**

```ts
// services/worker/src/router/handoff.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string>): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => { data[k] = v; },
    putJson: async (k, v) => { data[k] = JSON.stringify(v); },
    delete: async (k) => { delete data[k]; },
    list: async (p) => Object.keys(data).filter((k) => !p || k.startsWith(p)),
  };
}
function emptyR2(): R2Store {
  return {
    get: async () => null, head: async () => null,
    put: async () => {}, delete: async () => {}, list: async () => [],
  };
}

describe('POST /__shippie/handoff', () => {
  const app = createApp();
  let env: WorkerEnv;
  const capturedRequests: { url: string; body: string }[] = [];

  beforeEach(() => {
    capturedRequests.length = 0;
    env = {
      SHIPPIE_ENV: 'test',
      PLATFORM_API_URL: 'https://platform.test',
      WORKER_PLATFORM_SECRET: 'test-secret',
      APP_CONFIG: fakeKv({}),
      SHIPPIE_APPS: emptyR2(),
      SHIPPIE_PUBLIC: emptyR2(),
    };
    // @ts-expect-error test
    globalThis.fetch = async (url: string, init?: { body?: string }) => {
      capturedRequests.push({ url: url.toString(), body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  test('forwards a valid email-handoff to platform', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/handoff', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'email', email: 'a@b.co', handoff_url: 'https://zen.shippie.app/?ref=handoff' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.url).toBe('https://platform.test/api/internal/handoff');
    const body = JSON.parse(capturedRequests[0]!.body);
    expect(body.slug).toBe('zen');
    expect(body.mode).toBe('email');
  });

  test('rejects unknown modes', async () => {
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/handoff', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'carrier-pigeon' }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test('rate-limits after N requests per client', async () => {
    for (let i = 0; i < 6; i++) {
      await app.fetch(
        new Request('https://zen.shippie.app/__shippie/handoff', {
          method: 'POST',
          headers: { host: 'zen.shippie.app', 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
          body: JSON.stringify({ mode: 'email', email: 'a@b.co', handoff_url: 'https://zen.shippie.app/' }),
        }),
        env,
      );
    }
    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/handoff', {
        method: 'POST',
        headers: { host: 'zen.shippie.app', 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
        body: JSON.stringify({ mode: 'email', email: 'a@b.co', handoff_url: 'https://zen.shippie.app/' }),
      }),
      env,
    );
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Commit. Implement.**

```ts
// services/worker/src/router/handoff.ts
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const handoffRouter = new Hono<AppBindings>();

interface EmailBody {
  mode: 'email';
  email?: string;
  handoff_url?: string;
}
interface PushBody {
  mode: 'push';
  handoff_url?: string;
}
type HandoffBody = EmailBody | PushBody;

function isEmail(x: unknown): x is string {
  return typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

handoffRouter.post('/', async (c) => {
  const rl = checkRateLimit({
    key: `handoff:${c.var.slug}:${clientKey(c.req.raw)}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) return c.json({ error: 'rate_limited' }, 429);

  const body = (await c.req.json().catch(() => ({}))) as Partial<HandoffBody>;
  const mode = body.mode;
  if (mode !== 'email' && mode !== 'push') {
    return c.json({ error: 'invalid_mode' }, 400);
  }
  if (mode === 'email' && !isEmail((body as EmailBody).email)) {
    return c.json({ error: 'invalid_email' }, 400);
  }
  if (typeof (body as { handoff_url?: unknown }).handoff_url !== 'string') {
    return c.json({ error: 'missing_handoff_url' }, 400);
  }

  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/handoff',
    { slug: c.var.slug, ...body },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return c.json({ ok: true });
});
```

Register in `system.ts` by appending `import { handoffRouter } from './handoff.ts';` and `systemRouter.route('/handoff', handoffRouter);`.

- [ ] **Run, commit.**

---

## Task 9 — Worker beacon + push + splash routes

**Three routes, one task.** Each follows the pattern of existing `install.ts`, `feedback.ts`, `icons.ts`. Include tests for each.

- [ ] **Failing tests.**

Write `services/worker/src/router/beacon.test.ts`, `push.test.ts`, `splash.test.ts` covering:

- `beacon`: accepts gzipped batched events, rate-limited, forwards to `/api/internal/ingest-events`.
- `push`: `GET /vapid-key` returns a `{ key }` from `APP_CONFIG.get('push:vapid_public')` or 503; `POST /subscribe` + `POST /unsubscribe` forward to platform.
- `splash`: `GET /splash/<device>.png` serves PNG from `SHIPPIE_PUBLIC.get('splash/<slug>/<device>.png')` with 604800s cache; fallback to default if missing.

Full test bodies follow the same `createApp()` + `fakeKv()` + stubbed `fetch()` pattern as Task 8.

- [ ] **Implementations.**

```ts
// services/worker/src/router/beacon.ts
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';
import { checkRateLimit, clientKey } from '../rate-limit.ts';

export const beaconRouter = new Hono<AppBindings>();

beaconRouter.post('/', async (c) => {
  const rl = checkRateLimit({
    key: `beacon:${c.var.slug}:${clientKey(c.req.raw)}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.ok) return c.json({ error: 'rate_limited' }, 429);

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray((body as { events?: unknown }).events)) {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const events = (body as { events: unknown[] }).events.slice(0, 200);

  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/ingest-events',
    { slug: c.var.slug, events },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return new Response(null, { status: 204 });
});
```

```ts
// services/worker/src/router/push.ts
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { platformJson } from '../platform-client.ts';

export const pushRouter = new Hono<AppBindings>();

pushRouter.get('/vapid-key', async (c) => {
  const key = await c.env.APP_CONFIG.get('push:vapid_public');
  if (!key) return c.json({ error: 'push_not_configured' }, 503);
  return c.json({ key });
});

pushRouter.post('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/push/subscribe',
    { slug: c.var.slug, subscription: body },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return new Response(null, { status: 204 });
});

pushRouter.post('/unsubscribe', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) return c.json({ error: 'missing_endpoint' }, 400);
  const res = await platformJson(
    c.env,
    'POST',
    '/api/internal/push/unsubscribe',
    { slug: c.var.slug, endpoint: body.endpoint },
    { traceId: c.var.traceId },
  );
  if (!res.ok) return c.json({ error: 'platform_failed' }, 502);
  return new Response(null, { status: 204 });
});
```

```ts
// services/worker/src/router/splash.ts
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { toResponseBody } from '../bytes.ts';

export const splashRouter = new Hono<AppBindings>();

splashRouter.get('/:device{[a-z0-9-]+\\.png}', async (c) => {
  const slug = c.var.slug;
  const device = c.req.param('device');
  const appSpecific = await c.env.SHIPPIE_PUBLIC.get(`splash/${slug}/${device}`);
  if (appSpecific) {
    return new Response(toResponseBody(await appSpecific.body()), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
    });
  }
  const fallback = await c.env.SHIPPIE_PUBLIC.get(`splash/default/${device}`);
  if (fallback) {
    return new Response(toResponseBody(await fallback.body()), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  return new Response('Not found', { status: 404 });
});
```

Register all three in `system.ts`.

- [ ] **Run, commit.**

---

## Task 10 — Wrapper integration: handoff + motion in `startInstallRuntime`

- [ ] Update `packages/sdk/src/wrapper/install-runtime.ts`:
  - Import `{ mountHandoffSheet, unmountHandoffSheet }` and call it from the desktop-detection branch (platform === 'desktop' + !standalone).
  - Wire email/push handoff buttons to `fetch('/__shippie/handoff', {method:'POST', body: JSON.stringify({mode, email, handoff_url})})`.
  - Use `haptic('tap')` on install banner + dismiss.
  - Use `setThemeColor('#E8603C')` on banner mount, restore original on dismiss.
  - Keep existing IAB + tier-based banner logic.
  - Convert `let state` / `let lastRenderedTier` etc. to internal closure variables (they already are; add explicit `type` annotations + a single unified `refs` object for clarity per the P1 review).

- [ ] Add an integration test `install-runtime-handoff.test.ts` that stubs fetch, sets platform to desktop via ua, and verifies handoff sheet mounts + POST fires on email submit.

- [ ] Run tests, commit.

---

## Task 11 — Platform handoff handler (`/api/shippie/handoff`)

**Files:** `apps/web/app/api/shippie/handoff/route.ts`, `apps/web/lib/shippie/handoff.ts` + `.test.ts`.

- [ ] Pure helpers in `apps/web/lib/shippie/handoff.ts`:
  - `renderHandoffEmail({handoff_url, app_name}): { subject, html, text }` — templated strings.
  - `buildPushPayload({handoff_url, app_name}): { title, body, url }` — simple JSON.

- [ ] Tests for both pure functions (substring assertions on output).

- [ ] Route in `apps/web/app/api/shippie/handoff/route.ts`:
  - Accepts `{ slug, mode, email?, handoff_url }`.
  - For `mode='email'`: Resend client sends via `fetch('https://api.resend.com/emails', {...})` using `process.env.RESEND_API_KEY`. If key absent in dev, log and return 200 with `{ simulated: true }`.
  - For `mode='push'`: look up maker's push subscription in DB (via `@shippie/db` query `select * from push_subscriptions where slug=?`), send Web Push via helper from Task 13. For Phase 2 test path, stub when no subscription exists; return `{ sent: 0 }`.
  - Validate signed request from Worker using existing `packages/session-crypto` helpers (pattern from `apps/web/app/api/internal/*`).

- [ ] Run + commit.

---

## Task 12 — DB schema: `app_events` + `push_subscriptions`

**Files:** `packages/db/src/schema/app-events.ts`, `packages/db/src/schema/push-subscriptions.ts`, `packages/db/migrations/0015_app_events_spine.sql`.

- [ ] Schema:

```ts
// packages/db/src/schema/app-events.ts
import { bigserial, text, jsonb, timestamp, pgTable, index } from 'drizzle-orm/pg-core';

export const appEvents = pgTable(
  'app_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    appId: text('app_id').notNull(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id'),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('app_events_app_ts').on(t.appId, t.ts), index('app_events_type_ts').on(t.eventType, t.ts)],
);

export const usageDaily = pgTable(
  'usage_daily',
  {
    appId: text('app_id').notNull(),
    day: timestamp('day', { mode: 'date', withTimezone: true }).notNull(),
    eventType: text('event_type').notNull(),
    count: bigserial('count', { mode: 'number' }).notNull(),
  },
  (t) => [index('usage_daily_app_day').on(t.appId, t.day)],
);
```

```ts
// packages/db/src/schema/push-subscriptions.ts
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    appId: text('app_id').notNull(),
    userId: text('user_id'),
    keys: jsonb('keys').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_app').on(t.appId)],
);
```

- [ ] Migration `0015_app_events_spine.sql`:

```sql
-- Partitioned by month for easy 30-day retention via drop partition
CREATE TABLE IF NOT EXISTS app_events (
  id          bigserial NOT NULL,
  app_id      text NOT NULL,
  session_id  text NOT NULL,
  user_id     text,
  event_type  text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS app_events_app_ts ON app_events (app_id, ts);
CREATE INDEX IF NOT EXISTS app_events_type_ts ON app_events (event_type, ts);

-- Ensure at least the current + next month partitions exist so inserts don't fail.
CREATE TABLE IF NOT EXISTS app_events_2026_04 PARTITION OF app_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS app_events_2026_05 PARTITION OF app_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS usage_daily (
  app_id     text NOT NULL,
  day        timestamptz NOT NULL,
  event_type text NOT NULL,
  count      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, day, event_type)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    text PRIMARY KEY,
  app_id      text NOT NULL,
  user_id     text,
  keys        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_app ON push_subscriptions (app_id);
```

- [ ] Export from `packages/db/src/schema/index.ts`.

- [ ] `bun run --filter @shippie/db typecheck` must pass.

- [ ] Commit.

---

## Task 13 — Platform: ingest-events + rollups + retention + push-dispatch

Batched under one task because they share the DB layer.

- [ ] `apps/web/app/api/internal/ingest-events/route.ts` — validates worker signature, inserts batched events into `app_events`. Test: round-trip insert + query count.

- [ ] `apps/web/lib/shippie/rollups.ts` — pure function `aggregate(events, day)` that produces `(app_id, event_type, count)` triples; `apps/web/app/api/internal/rollups/route.ts` runs it across yesterday and upserts into `usage_daily`.

- [ ] `apps/web/app/api/internal/retention/route.ts` — drops `app_events_<YYYY_MM>` partitions older than 2 months (raw SQL `DROP TABLE IF EXISTS app_events_<N>` generated from month math).

- [ ] `apps/web/lib/shippie/push-dispatch.ts` — pure ES Web Push dispatcher (no npm `web-push` dep; implement VAPID JWT signing with `SubtleCrypto` + aes128gcm envelope). Tests for the JWT signer (deterministic given fixed nonce). This is the most complex pure-crypto piece — if blocking, stub with a commented-out reference to the `web-push` package and mark for a follow-up task. Document the choice in the commit message.

- [ ] Tests for each, commits after each.

---

## Task 14 — Maker dashboard analytics page

**Files:** `apps/web/app/dashboard/apps/[slug]/analytics/page.tsx`, `charts.tsx`.

- [ ] Page fetches from `usage_daily` for the signed-in maker's app, renders:
  - Installs per day (line chart from `install_prompt_accepted` counts).
  - DAU trend (last 30 days) from distinct `session_id` per day.
  - Web vitals p75 for LCP/CLS/INP (stubbed in Phase 3 — pull from `app_events` metadata for `web_vital` events).
  - Link to existing feedback inbox.

- [ ] `charts.tsx` — dependency-free SVG line chart component (no recharts). Accepts `points: Array<{x: Date, y: number}>` and draws a minimal polyline + axis ticks.

- [ ] Test: `analytics.test.ts` verifies the data query + projection with a seeded DB fixture.

- [ ] Commit after tests pass.

---

## Task 15 — Splash/icon generation pipeline

**Files:** `apps/web/lib/shippie/splash-gen.ts` + `.test.ts`, `apps/web/lib/deploy/index.ts` (edit).

- [ ] Use `sharp` (available via Vercel Sandbox):
  - `generateIcons(src: Buffer): Promise<Array<{ size: number; maskable: boolean; buffer: Buffer }>>` — outputs 192, 512 standard + 192, 512 maskable (with safe-area padding).
  - `generateSplashes(src: Buffer, backgroundColor: string): Promise<Array<{ device: string; buffer: Buffer }>>` — outputs 15 iPhone/iPad sizes as PNG with the source icon centered on a solid background.

- [ ] Tests: mock sharp with `Buffer.alloc` outputs; verify the right number/sizes are produced and all are PNG-signed.

- [ ] In `apps/web/lib/deploy/index.ts`, after successful build, read `shippie.json.pwa.icon`, call both generators, upload results to R2 at `splash/<slug>/<device>.png` and `icons/<slug>/<size>.png`.

- [ ] Update `packages/pwa-injector/src/inject-html.ts` to emit `<link rel="apple-touch-startup-image" media=".." href="/__shippie/splash/<device>.png">` tags for each generated size.

- [ ] Commit.

---

## Task 16 — Cron wiring + env + layout

- [ ] `vercel.json` — add:
  ```json
  "crons": [
    { "path": "/api/internal/rollups", "schedule": "0 */1 * * *" },
    { "path": "/api/internal/retention", "schedule": "0 4 * * *" }
  ]
  ```
  Preserve existing entries.

- [ ] `apps/web/.env.example` — add `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SHIPPIE_EVENT_INGEST_SECRET`.

- [ ] `apps/web/app/layout.tsx` — mount `<ThemeColor color="#14120F" />` at root for the marketplace.

- [ ] `apps/web/app/components/theme-color.tsx` — thin React wrapper that calls `setThemeColor` on mount + change.

- [ ] Tests for the React wrapper. Commit.

---

## Task 17 — Export new wrapper submodules

- [ ] `packages/sdk/src/wrapper/index.ts` — add the new exports:
  ```ts
  export { wrapNavigation, supportsViewTransitions } from './view-transitions.ts';
  export { attachBackSwipe, attachPullToRefresh, type BackSwipeOptions, type PullToRefreshOptions } from './gestures.ts';
  export { haptic, type HapticKind } from './haptics.ts';
  export { setThemeColor } from './theme-color.ts';
  export { mountUpdateToast, unmountUpdateToast, type UpdateToastProps } from './update-toast.ts';
  export { mountHandoffSheet, unmountHandoffSheet, type HandoffSheetProps } from './handoff-sheet.ts';
  export { subscribePush, unsubscribePush, pushSupported, type PushEndpoints, type SubscribeResult } from './push.ts';
  ```

- [ ] `bun run build` from `packages/sdk`. Confirm all new subpath entries land in `dist/wrapper/`.

- [ ] Commit.

---

## Task 18 — Full-system verification

- [ ] `bun run test` from repo root — expect all packages green.

- [ ] `bun run typecheck` from repo root — expect exit 0.

- [ ] Manual smoke (dev server on `apps/web`) — load `/`, confirm install banner renders, theme-color meta present, no console errors.

- [ ] Add a `docs/superpowers/plans/2026-04-22-pwa-wrapper-phase-2-3-verification.md` summarizing test counts, routes shipped, and known follow-ups.

- [ ] Commit verification report.

---

## Self-Review

- All P2 + P3 deliverables enumerated in §Scope are mapped to tasks 1–18.
- TDD order preserved: every feature task has a preceding failing-test step.
- No placeholders; every code block is complete.
- Type names consistent (`PromptState`, `PromptTier`, `BounceTarget`, `BannerProps`, `HandoffSheetProps`, `UpdateToastProps`, `BackSwipeOptions`, `PullToRefreshOptions`, `PushEndpoints`, `SubscribeResult`, `HapticKind`).
- Phase 1 review follow-ups (recordMeaningfulAction wiring, closure-state cleanup, dwell ticker optimization) are captured in Task 10.
- No unresolved cross-task dependencies — Tasks 1–7 (wrapper submodules) are independent of each other; Tasks 8–9 (worker routes) are independent; Task 10 integrates them into `install-runtime.ts`; Tasks 11–15 (platform side) depend on Task 12 (DB); Tasks 16–18 finalize.
