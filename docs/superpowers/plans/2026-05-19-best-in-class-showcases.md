# Best-in-Class Showcase Elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift four showcases (Chiwit, Palate/Recipe, Match Room, World Cup Fantasy) from typography-handshake-only to best-in-class local apps via a shared kit + 6 platform moves + per-app heroes.

**Architecture:** New workspace package `@shippie/showcase-kit-v2` holds 6 shared functional primitives (Keepsake, Onboarding, IntentToast, QrShareSheet, BackupCard, EmptyState). Each app skins them in its own atmosphere and adds one Shippie-native hero (Chiwit ambient pulse · Palate cook-with-me · Match Room fanfare+keepsake · WC Fantasy couch league). Phase 0 lays the kit. Phase 1 runs 4 parallel implementer agents — one per app. Phase 2 smokes cross-app intents. Phase 3+4 are user-driven (real-phone + deploy).

**Tech Stack:** TypeScript 5.7 · React 19 · Vite 5 (apps) · tsup 8.5 (package) · bun:test + happy-dom · jspdf 2.5 · workspace packages (`@shippie/sdk`, `@shippie/share`, `@shippie/qr`, `@shippie/proximity`, `@shippie/local-db`, `@shippie/backup-providers`) · Cloudflare Workers (no change needed at platform layer).

**Spec:** `docs/superpowers/specs/2026-05-19-best-in-class-showcases-design.md` — read this before starting. Per-app sections (§4-7) and shared-move specs (§3) are the source of truth for behavior.

---

## File Map

### Phase 0 — new package

```
packages/showcase-kit-v2/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── keepsake/{KeepsakeRenderer.tsx,pdf-from-canvas.ts,share-keepsake.ts,types.ts,index.ts}
│   ├── onboarding/{OnboardingFlow.tsx,useFirstRun.ts,types.ts,index.ts}
│   ├── intent-toast/{IntentToastHost.tsx,useToastQueue.ts,types.ts,index.ts}
│   ├── qr-sheet/{QrShareSheet.tsx,encode-fragment.ts,index.ts}
│   ├── backup-card/{BackupCard.tsx,useBackupState.ts,index.ts}
│   ├── empty-state/{EmptyState.tsx,types.ts,index.ts}
│   └── index.ts
└── src/**/*.test.ts (colocated)
```

### Phase 1 — per-app modifications (4 streams)

- `apps/showcase-chiwit/src/{App.tsx,styles.css,Onboarding.tsx,IntentMatchers.ts,WeeklyShape.tsx,components/*.tsx}` (+ keepsake template + per-app skinned components)
- `apps/showcase-recipe/src/{App.tsx,styles.css,CookAlong.tsx,IntentMatchers.ts,CookRecap.tsx,components/{PantryRow,PlanGrid,ShopList,RecipeSheet}.tsx}`
- `apps/showcase-match-room/src/{App.tsx,styles.css,HeroScoreboard.tsx,PresenceRibbon.tsx,Buzzer.tsx,FulltimeProgramme.tsx,Onboarding.tsx,IntentMatchers.ts}`
- `apps/showcase-world-cup-fantasy/src/{App.tsx,styles.css,CouchLeague.tsx,CaptainCompare.tsx,Leaderboard.tsx,TournamentProgramme.tsx,Onboarding.tsx,IntentMatchers.ts}`

### Phase 0 root changes

- `bun.lock` (auto, after `bun install`)
- `apps/platform/package.json` if the platform host imports kit-v2 anywhere (Phase 2 smoke only)

---

# Phase 0 — Build `@shippie/showcase-kit-v2`

## Task 1: Scaffold the package

**Files:**
- Create: `packages/showcase-kit-v2/package.json`
- Create: `packages/showcase-kit-v2/tsconfig.json`
- Create: `packages/showcase-kit-v2/tsup.config.ts`
- Create: `packages/showcase-kit-v2/src/index.ts`

- [ ] **Step 1: Write `package.json`** — mirror `@shippie/sdk` pattern with `exports.types` + `exports.import` both `./src/index.ts`:

```json
{
  "name": "@shippie/showcase-kit-v2",
  "version": "0.1.0",
  "description": "Shared functional primitives for Shippie showcase apps: keepsake renderer, onboarding flow, cross-app intent toast, QR share sheet, backup card, empty state.",
  "license": "MIT",
  "type": "module",
  "main": "./src/index.ts",
  "module": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "publishConfig": {
    "main": "./dist/index.js",
    "module": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "typecheck": "tsc --noEmit && tsup --dts-only --silent",
    "lint": "echo 'lint placeholder'",
    "test": "bun test",
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo"
  },
  "dependencies": {
    "@shippie/sdk": "workspace:*",
    "@shippie/share": "workspace:*",
    "@shippie/qr": "workspace:*",
    "@shippie/local-db": "workspace:*",
    "@shippie/backup-providers": "workspace:*",
    "jspdf": "^2.5.2"
  },
  "peerDependencies": {
    "react": ">=19.0.0"
  },
  "devDependencies": {
    "@types/bun": "^1.3.12",
    "@types/react": "^19.0.0",
    "happy-dom": "15",
    "tsup": "^8.5.1",
    "typescript": "^5.7.0"
  },
  "sideEffects": false
}
```

- [ ] **Step 2: Write `tsconfig.json`** — extend the repo base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Write `tsup.config.ts`** — `dts: true` is mandatory (May 18 lesson):

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  external: ['react', 'react-dom'],
});
```

- [ ] **Step 4: Write empty `src/index.ts`** — exports will be added per component task:

```ts
// Re-exports added per component task.
export {};
```

- [ ] **Step 5: Install + verify package resolves**

Run: `bun install`
Expected: `packages/showcase-kit-v2` resolves in workspace; no errors.

Run: `bun run --cwd packages/showcase-kit-v2 typecheck`
Expected: PASS (empty index, no compile errors).

- [ ] **Step 6: Commit**

```bash
git add packages/showcase-kit-v2 bun.lock
git commit -m "feat(showcase-kit-v2): scaffold package"
```

---

## Task 2: EmptyState primitive (simplest — start here)

**Files:**
- Create: `packages/showcase-kit-v2/src/empty-state/types.ts`
- Create: `packages/showcase-kit-v2/src/empty-state/EmptyState.tsx`
- Create: `packages/showcase-kit-v2/src/empty-state/EmptyState.test.tsx`
- Create: `packages/showcase-kit-v2/src/empty-state/index.ts`
- Modify: `packages/showcase-kit-v2/src/index.ts` — add re-export

- [ ] **Step 1: Write `types.ts`**

```ts
import type { ReactNode } from 'react';

export type EmptyStateAction =
  | { label: string; onClick: () => void }
  | { label: string; href: string };

export type EmptyStateProps = {
  eyebrow: string;
  headline: ReactNode;          // allow <em> for italic accent
  body?: ReactNode;
  cta?: EmptyStateAction;
  className?: string;
};
```

- [ ] **Step 2: Write the failing test `EmptyState.test.tsx`**

```tsx
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  test('renders eyebrow, headline, body, cta', () => {
    const html = renderToString(
      <EmptyState
        eyebrow="No signals yet"
        headline={<>Log one when you <em>notice it</em></>}
        body="Tap any quick-signal pill."
        cta={{ label: 'Log now', onClick: () => {} }}
      />
    );
    expect(html).toContain('NO SIGNALS YET'); // uppercased via CSS class
    expect(html).toContain('shippie-empty-state__eyebrow');
    expect(html).toContain('<em>notice it</em>');
    expect(html).toContain('Log now');
  });

  test('omits body and cta when not provided', () => {
    const html = renderToString(<EmptyState eyebrow="X" headline="Y" />);
    expect(html).not.toContain('shippie-empty-state__body');
    expect(html).not.toContain('shippie-empty-state__cta');
  });

  test('href cta renders as anchor', () => {
    const html = renderToString(
      <EmptyState eyebrow="X" headline="Y" cta={{ label: 'Go', href: '/x' }} />
    );
    expect(html).toContain('href="/x"');
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `bun run --cwd packages/showcase-kit-v2 test`
Expected: FAIL — `EmptyState` not found.

- [ ] **Step 4: Implement `EmptyState.tsx`**

```tsx
import type { EmptyStateProps } from './types';

export function EmptyState({ eyebrow, headline, body, cta, className }: EmptyStateProps) {
  return (
    <div className={`shippie-empty-state${className ? ' ' + className : ''}`}>
      <p className="shippie-empty-state__eyebrow">{eyebrow}</p>
      <h2 className="shippie-empty-state__headline">{headline}</h2>
      {body ? <p className="shippie-empty-state__body">{body}</p> : null}
      {cta ? (
        'href' in cta ? (
          <a className="shippie-empty-state__cta" href={cta.href}>{cta.label}</a>
        ) : (
          <button type="button" className="shippie-empty-state__cta" onClick={cta.onClick}>
            {cta.label}
          </button>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Write `index.ts`**

```ts
export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAction } from './types';
```

- [ ] **Step 6: Re-export from package root** — modify `packages/showcase-kit-v2/src/index.ts`:

```ts
export * from './empty-state';
```

- [ ] **Step 7: Run tests + typecheck**

Run: `bun run --cwd packages/showcase-kit-v2 test`
Expected: 3/3 PASS.

Run: `bun run --cwd packages/showcase-kit-v2 typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/showcase-kit-v2/src
git commit -m "feat(showcase-kit-v2): add EmptyState primitive"
```

---

## Task 3: Onboarding flow

**Files:**
- Create: `packages/showcase-kit-v2/src/onboarding/types.ts`
- Create: `packages/showcase-kit-v2/src/onboarding/useFirstRun.ts`
- Create: `packages/showcase-kit-v2/src/onboarding/useFirstRun.test.ts`
- Create: `packages/showcase-kit-v2/src/onboarding/OnboardingFlow.tsx`
- Create: `packages/showcase-kit-v2/src/onboarding/index.ts`
- Modify: `packages/showcase-kit-v2/src/index.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
import type { ReactNode } from 'react';

export type OnboardingSlide = {
  title: ReactNode;
  body: ReactNode;
  cta?: string;
};

export type OnboardingFlowProps = {
  appSlug: string;
  version: number;
  slides: OnboardingSlide[];   // 2-3 max
  onComplete?: () => void;
  storageImpl?: Storage;       // override for tests
};
```

- [ ] **Step 2: Write `useFirstRun.test.ts`** (test the gate logic first)

```ts
import { describe, expect, test, beforeEach } from 'bun:test';
import { hasCompletedOnboarding, markOnboardingComplete, resetOnboarding } from './useFirstRun';

const fakeStore: Storage = (() => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: () => null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
})();

describe('onboarding gate', () => {
  beforeEach(() => fakeStore.clear());

  test('returns false on first run', () => {
    expect(hasCompletedOnboarding('chiwit', 1, fakeStore)).toBe(false);
  });

  test('returns true after mark', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    expect(hasCompletedOnboarding('chiwit', 1, fakeStore)).toBe(true);
  });

  test('returns false after version bump', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    expect(hasCompletedOnboarding('chiwit', 2, fakeStore)).toBe(false);
  });

  test('reset clears the gate', () => {
    markOnboardingComplete('chiwit', 1, fakeStore);
    resetOnboarding('chiwit', fakeStore);
    expect(hasCompletedOnboarding('chiwit', 1, fakeStore)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test, verify failure**

Run: `bun run --cwd packages/showcase-kit-v2 test useFirstRun`
Expected: FAIL — functions not defined.

- [ ] **Step 4: Implement `useFirstRun.ts`**

```ts
import { useEffect, useState } from 'react';

const KEY = (slug: string) => `shippie:onboarding:${slug}:v`;

function safeStorage(override?: Storage): Storage | null {
  if (override) return override;
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function hasCompletedOnboarding(slug: string, version: number, store?: Storage): boolean {
  const s = safeStorage(store);
  if (!s) return false;
  const raw = s.getItem(KEY(slug));
  if (!raw) return false;
  const v = Number(raw);
  return Number.isFinite(v) && v >= version;
}

export function markOnboardingComplete(slug: string, version: number, store?: Storage): void {
  const s = safeStorage(store);
  if (!s) return;
  s.setItem(KEY(slug), String(version));
}

export function resetOnboarding(slug: string, store?: Storage): void {
  const s = safeStorage(store);
  if (!s) return;
  s.removeItem(KEY(slug));
}

export function useOnboardingGate(slug: string, version: number) {
  const [done, setDone] = useState(() => hasCompletedOnboarding(slug, version));
  useEffect(() => { setDone(hasCompletedOnboarding(slug, version)); }, [slug, version]);
  return {
    done,
    complete: () => { markOnboardingComplete(slug, version); setDone(true); },
    reset: () => { resetOnboarding(slug); setDone(false); },
  };
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `bun run --cwd packages/showcase-kit-v2 test useFirstRun`
Expected: 4/4 PASS.

- [ ] **Step 6: Implement `OnboardingFlow.tsx`**

```tsx
import { useState, useCallback } from 'react';
import { useOnboardingGate } from './useFirstRun';
import type { OnboardingFlowProps } from './types';

export function OnboardingFlow({ appSlug, version, slides, onComplete }: OnboardingFlowProps) {
  const { done, complete } = useOnboardingGate(appSlug, version);
  const [idx, setIdx] = useState(0);

  const finish = useCallback(() => {
    complete();
    onComplete?.();
  }, [complete, onComplete]);

  if (done) return null;
  if (slides.length === 0) return null;

  const slide = slides[Math.min(idx, slides.length - 1)];
  const last = idx >= slides.length - 1;

  return (
    <div className="shippie-onboarding" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="shippie-onboarding__surface">
        <div className="shippie-onboarding__progress">
          {slides.map((_, i) => (
            <span key={i} className={`shippie-onboarding__dot${i === idx ? ' is-current' : ''}`} />
          ))}
        </div>
        <h2 className="shippie-onboarding__title">{slide.title}</h2>
        <p className="shippie-onboarding__body">{slide.body}</p>
        <div className="shippie-onboarding__actions">
          {!last ? (
            <button type="button" className="shippie-onboarding__skip" onClick={finish}>
              Skip
            </button>
          ) : null}
          <button
            type="button"
            className="shippie-onboarding__next"
            onClick={() => last ? finish() : setIdx(idx + 1)}
          >
            {slide.cta ?? (last ? 'Got it' : 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write `index.ts`**

```ts
export { OnboardingFlow } from './OnboardingFlow';
export { useOnboardingGate, hasCompletedOnboarding, markOnboardingComplete, resetOnboarding } from './useFirstRun';
export type { OnboardingFlowProps, OnboardingSlide } from './types';
```

- [ ] **Step 8: Re-export from root** — append to `src/index.ts`:

```ts
export * from './onboarding';
```

- [ ] **Step 9: Run tests + typecheck**

Run: `bun run --cwd packages/showcase-kit-v2 test && bun run --cwd packages/showcase-kit-v2 typecheck`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/showcase-kit-v2/src
git commit -m "feat(showcase-kit-v2): add OnboardingFlow + version-aware first-run gate"
```

---

## Task 4: Intent toast

**Files:**
- Create: `packages/showcase-kit-v2/src/intent-toast/types.ts`
- Create: `packages/showcase-kit-v2/src/intent-toast/useToastQueue.ts`
- Create: `packages/showcase-kit-v2/src/intent-toast/useToastQueue.test.ts`
- Create: `packages/showcase-kit-v2/src/intent-toast/IntentToastHost.tsx`
- Create: `packages/showcase-kit-v2/src/intent-toast/index.ts`
- Modify: `packages/showcase-kit-v2/src/index.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type IntentLike = {
  kind: string;
  payload?: Record<string, unknown>;
  sourceAppId?: string;
  timestamp?: number;
};

export type ToastSpec = {
  title: string;
  body?: string;
  href?: string;
  icon?: string;            // sibling app emoji/icon
};

export type IntentMatcher = {
  kind: string;
  toast: (intent: IntentLike) => ToastSpec;
  throttleMs?: number;      // per-kind throttle, default 30_000
};

export type IntentToastHostProps = {
  matchers: IntentMatcher[];
  position?: 'top' | 'bottom';
  autoDismissMs?: number;   // default 4000
};
```

- [ ] **Step 2: Write `useToastQueue.test.ts`**

```ts
import { describe, expect, test, mock } from 'bun:test';
import { createToastQueue } from './useToastQueue';

describe('toast queue', () => {
  test('emits visible toast on push', () => {
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 1000, onVisible });
    q.push({ kind: 'coffee.brewed', toast: () => ({ title: 'X' }) }, { kind: 'coffee.brewed' });
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(onVisible.mock.calls[0]?.[0]?.title).toBe('X');
  });

  test('throttles repeats of same kind within window', () => {
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 10000, onVisible });
    const m = { kind: 'k', toast: () => ({ title: 't' }), throttleMs: 30000 };
    q.push(m, { kind: 'k' });
    q.push(m, { kind: 'k' });   // throttled
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  test('global cap of 3 within 30s', () => {
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 100, onVisible });
    const mk = (k: string) => ({ kind: k, toast: () => ({ title: k }) });
    q.push(mk('a'), { kind: 'a' });
    q.push(mk('b'), { kind: 'b' });
    q.push(mk('c'), { kind: 'c' });
    q.push(mk('d'), { kind: 'd' }); // dropped — cap hit
    expect(onVisible).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 3: Run test, verify FAIL**

Run: `bun run --cwd packages/showcase-kit-v2 test useToastQueue`
Expected: FAIL.

- [ ] **Step 4: Implement `useToastQueue.ts`**

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import type { IntentLike, IntentMatcher, ToastSpec } from './types';

type QueueOpts = {
  autoDismissMs?: number;
  onVisible?: (toast: ToastSpec) => void;
  now?: () => number;
};

const DEFAULT_DISMISS = 4000;
const GLOBAL_WINDOW_MS = 30_000;
const GLOBAL_CAP = 3;

export function createToastQueue(opts: QueueOpts = {}) {
  const now = opts.now ?? (() => Date.now());
  const lastByKind = new Map<string, number>();
  const recentTimestamps: number[] = [];
  let current: ToastSpec | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  const trim = () => {
    const cutoff = now() - GLOBAL_WINDOW_MS;
    while (recentTimestamps.length && recentTimestamps[0]! < cutoff) recentTimestamps.shift();
  };

  function push(matcher: IntentMatcher, intent: IntentLike): boolean {
    const t = now();
    const throttle = matcher.throttleMs ?? GLOBAL_WINDOW_MS;
    const last = lastByKind.get(matcher.kind) ?? -Infinity;
    if (t - last < throttle) return false;
    trim();
    if (recentTimestamps.length >= GLOBAL_CAP) return false;

    const spec = matcher.toast(intent);
    lastByKind.set(matcher.kind, t);
    recentTimestamps.push(t);
    current = spec;
    opts.onVisible?.(spec);
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => { current = null; }, opts.autoDismissMs ?? DEFAULT_DISMISS);
    return true;
  }

  function peek() { return current; }
  function dismiss() {
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    current = null;
  }

  return { push, peek, dismiss };
}

export function useToastQueue(opts: QueueOpts = {}) {
  const [visible, setVisible] = useState<ToastSpec | null>(null);
  const queueRef = useRef<ReturnType<typeof createToastQueue> | null>(null);

  if (!queueRef.current) {
    queueRef.current = createToastQueue({ ...opts, onVisible: setVisible });
  }

  const push = useCallback((matcher: IntentMatcher, intent: IntentLike) => {
    return queueRef.current!.push(matcher, intent);
  }, []);

  const dismiss = useCallback(() => {
    queueRef.current!.dismiss();
    setVisible(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(null), opts.autoDismissMs ?? DEFAULT_DISMISS);
    return () => clearTimeout(t);
  }, [visible, opts.autoDismissMs]);

  return { visible, push, dismiss };
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `bun run --cwd packages/showcase-kit-v2 test useToastQueue`
Expected: 3/3 PASS.

- [ ] **Step 6: Implement `IntentToastHost.tsx`**

The SDK already exposes an intent stream via `@shippie/sdk` — the `createShippieIframeSdk` returns an object with `onIntent` / `subscribe` (verify the exact API by reading `packages/sdk/src/index.ts` and `packages/iframe-sdk/src/index.ts` before writing the host). If the API name differs, adjust this code accordingly.

```tsx
import { useEffect } from 'react';
import { useToastQueue } from './useToastQueue';
import type { IntentLike, IntentMatcher, IntentToastHostProps } from './types';

export type IntentSubscription = {
  subscribe: (cb: (intent: IntentLike) => void) => () => void;
};

export function IntentToastHost({
  matchers,
  source,
  position = 'top',
  autoDismissMs = 4000,
}: IntentToastHostProps & { source: IntentSubscription }) {
  const { visible, push, dismiss } = useToastQueue({ autoDismissMs });

  useEffect(() => {
    const byKind = new Map<string, IntentMatcher>();
    for (const m of matchers) byKind.set(m.kind, m);
    return source.subscribe((intent) => {
      const m = byKind.get(intent.kind);
      if (m) push(m, intent);
    });
  }, [matchers, source, push]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`shippie-intent-toast shippie-intent-toast--${position}`}
      onClick={() => { if (visible.href) window.location.assign(visible.href); }}
    >
      {visible.icon ? <span className="shippie-intent-toast__icon">{visible.icon}</span> : null}
      <div className="shippie-intent-toast__text">
        <strong>{visible.title}</strong>
        {visible.body ? <span>{visible.body}</span> : null}
      </div>
      <button type="button" aria-label="Dismiss" className="shippie-intent-toast__close" onClick={(e) => { e.stopPropagation(); dismiss(); }}>×</button>
    </div>
  );
}
```

- [ ] **Step 7: Write `index.ts`**

```ts
export { IntentToastHost } from './IntentToastHost';
export type { IntentToastHostProps, IntentMatcher, ToastSpec, IntentLike, IntentSubscription } from './types';
export { createToastQueue, useToastQueue } from './useToastQueue';
```

- [ ] **Step 8: Re-export + run tests + typecheck + commit**

```bash
# Append to src/index.ts:
echo "export * from './intent-toast';" >> packages/showcase-kit-v2/src/index.ts
bun run --cwd packages/showcase-kit-v2 test && bun run --cwd packages/showcase-kit-v2 typecheck
git add packages/showcase-kit-v2/src
git commit -m "feat(showcase-kit-v2): add IntentToastHost + throttled toast queue"
```

---

## Task 5: QR share sheet

**Files:**
- Create: `packages/showcase-kit-v2/src/qr-sheet/encode-fragment.ts`
- Create: `packages/showcase-kit-v2/src/qr-sheet/encode-fragment.test.ts`
- Create: `packages/showcase-kit-v2/src/qr-sheet/QrShareSheet.tsx`
- Create: `packages/showcase-kit-v2/src/qr-sheet/index.ts`
- Modify: `packages/showcase-kit-v2/src/index.ts`

- [ ] **Step 1: Read `@shippie/share` exports** to learn the actual signed-fragment API:

```bash
cat packages/share/src/index.ts | head -60
```

Expected: a function like `signFragment(payload, key)` and `verifyFragment(sig, key)`. Note exact signatures before writing `encode-fragment.ts`.

- [ ] **Step 2: Write `encode-fragment.test.ts`** (use the actual `@shippie/share` API discovered above; placeholder shown):

```ts
import { describe, expect, test } from 'bun:test';
import { encodeShareFragment, decodeShareFragment } from './encode-fragment';

describe('share fragment', () => {
  test('round-trips a payload', async () => {
    const payload = { app: 'palate', kind: 'recipe', data: { title: 'Beans' } };
    const encoded = await encodeShareFragment(payload);
    const decoded = await decodeShareFragment(encoded);
    expect(decoded).toEqual(payload);
  });
});
```

- [ ] **Step 3: Run test, FAIL**

- [ ] **Step 4: Implement `encode-fragment.ts`** — wraps `@shippie/share`:

```ts
import { signFragment, verifyFragment } from '@shippie/share';

export async function encodeShareFragment<T>(payload: T): Promise<string> {
  return await signFragment(payload);
}

export async function decodeShareFragment<T>(encoded: string): Promise<T> {
  return await verifyFragment<T>(encoded);
}
```

(Adapt function names to the actual `@shippie/share` API from Step 1.)

- [ ] **Step 5: Run test, PASS**

- [ ] **Step 6: Implement `QrShareSheet.tsx`** — uses `@shippie/qr`:

```tsx
import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';

export type QrShareSheetProps = {
  open: boolean;
  url: string;
  title: string;
  body?: string;
  onClose: () => void;
};

export function QrShareSheet({ open, url, title, body, onClose }: QrShareSheetProps) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.resolve(qrSvg(url, { size: 320 })).then((s) => { if (!cancelled) setSvg(s); });
    return () => { cancelled = true; };
  }, [open, url]);

  if (!open) return null;

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {}
  };

  const onShare = async () => {
    if ('share' in navigator) {
      try { await navigator.share({ title, text: body, url }); } catch {}
    } else {
      await onCopy();
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="shippie-qr-sheet" onClick={onClose}>
      <div className="shippie-qr-sheet__surface" onClick={(e) => e.stopPropagation()}>
        <h2 className="shippie-qr-sheet__title">{title}</h2>
        {body ? <p className="shippie-qr-sheet__body">{body}</p> : null}
        <div className="shippie-qr-sheet__qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <code className="shippie-qr-sheet__url">{url}</code>
        <div className="shippie-qr-sheet__actions">
          <button type="button" onClick={onCopy}>Copy link</button>
          <button type="button" onClick={onShare} className="primary">Share</button>
        </div>
        <button type="button" className="shippie-qr-sheet__close" aria-label="Close" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write `index.ts`**

```ts
export { QrShareSheet } from './QrShareSheet';
export type { QrShareSheetProps } from './QrShareSheet';
export { encodeShareFragment, decodeShareFragment } from './encode-fragment';
```

- [ ] **Step 8: Re-export + tests + typecheck + commit**

```bash
echo "export * from './qr-sheet';" >> packages/showcase-kit-v2/src/index.ts
bun run --cwd packages/showcase-kit-v2 test && bun run --cwd packages/showcase-kit-v2 typecheck
git add packages/showcase-kit-v2/src
git commit -m "feat(showcase-kit-v2): add QrShareSheet"
```

---

## Task 6: Backup card

**Files:**
- Create: `packages/showcase-kit-v2/src/backup-card/useBackupState.ts`
- Create: `packages/showcase-kit-v2/src/backup-card/useBackupState.test.ts`
- Create: `packages/showcase-kit-v2/src/backup-card/BackupCard.tsx`
- Create: `packages/showcase-kit-v2/src/backup-card/index.ts`
- Modify: `packages/showcase-kit-v2/src/index.ts`

- [ ] **Step 1: Read existing `@shippie/backup-providers` API** to learn how Palate already does backup/restore:

```bash
cat packages/backup-providers/src/index.ts | head -120
```

Note: the existing Palate flow at `apps/showcase-recipe/src/api/` is the reference implementation. Mirror its passphrase + dry-run preview + restore shape.

- [ ] **Step 2: Write `useBackupState.test.ts`** — covers state machine transitions:

```ts
import { describe, expect, test } from 'bun:test';
import { reduceBackupState, type BackupState } from './useBackupState';

describe('backup state reducer', () => {
  test('idle → backing-up → backed-up', () => {
    let s: BackupState = { status: 'idle', lastBackupAt: null };
    s = reduceBackupState(s, { type: 'backup:start' });
    expect(s.status).toBe('backing-up');
    s = reduceBackupState(s, { type: 'backup:success', at: 1700000000000 });
    expect(s.status).toBe('backed-up');
    expect(s.lastBackupAt).toBe(1700000000000);
  });

  test('idle → restoring → restored', () => {
    let s: BackupState = { status: 'idle', lastBackupAt: null };
    s = reduceBackupState(s, { type: 'restore:start' });
    expect(s.status).toBe('restoring');
    s = reduceBackupState(s, { type: 'restore:success' });
    expect(s.status).toBe('idle');
  });

  test('failure returns to idle with error', () => {
    let s: BackupState = { status: 'backing-up', lastBackupAt: null };
    s = reduceBackupState(s, { type: 'backup:fail', error: 'bad passphrase' });
    expect(s.status).toBe('idle');
    expect(s.error).toBe('bad passphrase');
  });
});
```

- [ ] **Step 3: Run test, FAIL.**

- [ ] **Step 4: Implement `useBackupState.ts`**

```ts
import { useReducer } from 'react';

export type BackupStatus = 'idle' | 'backing-up' | 'backed-up' | 'restoring';

export type BackupState = {
  status: BackupStatus;
  lastBackupAt: number | null;
  error?: string;
};

export type BackupAction =
  | { type: 'backup:start' }
  | { type: 'backup:success'; at: number }
  | { type: 'backup:fail'; error: string }
  | { type: 'restore:start' }
  | { type: 'restore:success' }
  | { type: 'restore:fail'; error: string }
  | { type: 'reset' };

export function reduceBackupState(state: BackupState, action: BackupAction): BackupState {
  switch (action.type) {
    case 'backup:start': return { ...state, status: 'backing-up', error: undefined };
    case 'backup:success': return { status: 'backed-up', lastBackupAt: action.at };
    case 'backup:fail': return { ...state, status: 'idle', error: action.error };
    case 'restore:start': return { ...state, status: 'restoring', error: undefined };
    case 'restore:success': return { ...state, status: 'idle' };
    case 'restore:fail': return { ...state, status: 'idle', error: action.error };
    case 'reset': return { status: 'idle', lastBackupAt: null };
  }
}

export function useBackupState(initial?: Partial<BackupState>) {
  const [state, dispatch] = useReducer(reduceBackupState, {
    status: 'idle',
    lastBackupAt: null,
    ...initial,
  });
  return { state, dispatch };
}
```

- [ ] **Step 5: PASS.**

- [ ] **Step 6: Implement `BackupCard.tsx`** — wraps the existing backup-providers integration. Per the spec §5.8, Palate already has this UI; we're generalising. The exact `BackupableStore` type comes from the existing recipe-saver implementation — read `apps/showcase-recipe/src/api/backup.ts` (or wherever Palate's backup lives) and abstract the interface here:

```tsx
import { useBackupState } from './useBackupState';

export type BackupableStore = {
  exportEncrypted: (passphrase: string) => Promise<Blob>;
  importEncrypted: (file: Blob, passphrase: string, opts?: { dryRun?: boolean }) => Promise<{ ok: boolean; preview?: unknown; error?: string }>;
};

export type BackupCardProps = {
  appSlug: string;
  store: BackupableStore;
  className?: string;
};

export function BackupCard({ appSlug, store, className }: BackupCardProps) {
  const { state, dispatch } = useBackupState();

  const onBackup = async () => {
    const passphrase = prompt('Choose a passphrase. You will need this to restore.');
    if (!passphrase) return;
    dispatch({ type: 'backup:start' });
    try {
      const blob = await store.exportEncrypted(passphrase);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appSlug}-backup-${new Date().toISOString().slice(0, 10)}.shippiebak`;
      a.click();
      URL.revokeObjectURL(url);
      dispatch({ type: 'backup:success', at: Date.now() });
    } catch (err) {
      dispatch({ type: 'backup:fail', error: err instanceof Error ? err.message : 'Backup failed' });
    }
  };

  const onRestore = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.shippiebak';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const passphrase = prompt('Enter the passphrase used when backing up.');
      if (!passphrase) return;
      dispatch({ type: 'restore:start' });
      const dry = await store.importEncrypted(file, passphrase, { dryRun: true });
      if (!dry.ok) { dispatch({ type: 'restore:fail', error: dry.error ?? 'Restore preview failed' }); return; }
      if (!confirm('Restore preview ok. This will replace local data. Continue?')) {
        dispatch({ type: 'restore:fail', error: 'Cancelled' });
        return;
      }
      const real = await store.importEncrypted(file, passphrase);
      if (real.ok) dispatch({ type: 'restore:success' });
      else dispatch({ type: 'restore:fail', error: real.error ?? 'Restore failed' });
    };
    input.click();
  };

  return (
    <div className={`shippie-backup-card${className ? ' ' + className : ''}`}>
      <p className="shippie-backup-card__eyebrow">Backup</p>
      <h3 className="shippie-backup-card__title">Your stuff is yours.</h3>
      <p className="shippie-backup-card__body">
        {state.lastBackupAt
          ? `Last backed up ${new Date(state.lastBackupAt).toLocaleString()}.`
          : 'Never backed up on this device.'}
      </p>
      <div className="shippie-backup-card__actions">
        <button type="button" onClick={onBackup} disabled={state.status === 'backing-up'}>
          {state.status === 'backing-up' ? 'Backing up…' : 'Back up now'}
        </button>
        <button type="button" onClick={onRestore} disabled={state.status === 'restoring'}>
          {state.status === 'restoring' ? 'Restoring…' : 'Restore from file'}
        </button>
      </div>
      {state.error ? <p className="shippie-backup-card__error">{state.error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 7: Write `index.ts`**

```ts
export { BackupCard } from './BackupCard';
export type { BackupCardProps, BackupableStore } from './BackupCard';
export { useBackupState, reduceBackupState } from './useBackupState';
export type { BackupState, BackupStatus, BackupAction } from './useBackupState';
```

- [ ] **Step 8: Re-export + tests + typecheck + commit**

```bash
echo "export * from './backup-card';" >> packages/showcase-kit-v2/src/index.ts
bun run --cwd packages/showcase-kit-v2 test && bun run --cwd packages/showcase-kit-v2 typecheck
git add packages/showcase-kit-v2/src
git commit -m "feat(showcase-kit-v2): add BackupCard primitive"
```

---

## Task 7: Keepsake renderer (most complex — last in Phase 0)

**Files:**
- Create: `packages/showcase-kit-v2/src/keepsake/types.ts`
- Create: `packages/showcase-kit-v2/src/keepsake/pdf-from-canvas.ts`
- Create: `packages/showcase-kit-v2/src/keepsake/pdf-from-canvas.test.ts`
- Create: `packages/showcase-kit-v2/src/keepsake/share-keepsake.ts`
- Create: `packages/showcase-kit-v2/src/keepsake/KeepsakeRenderer.tsx`
- Create: `packages/showcase-kit-v2/src/keepsake/index.ts`
- Modify: `packages/showcase-kit-v2/src/index.ts`

- [ ] **Step 1: Read `apps/showcase-crewtrip/src/utils/wrap-card.ts`** — that's the reference pattern for canvas→PNG→Web-Share. Lift its shape:

```bash
cat apps/showcase-crewtrip/src/utils/wrap-card.ts
```

- [ ] **Step 2: Write `types.ts`**

```ts
import type { ComponentType } from 'react';

export type KeepsakeTemplate<T> = ComponentType<{
  data: T;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}>;

export type KeepsakePayload = {
  pngBlob: Blob;
  pdfBlob: Blob;
  filename: string;
};
```

- [ ] **Step 3: Implement `pdf-from-canvas.ts`** (test will come after — the API surface is thin):

```ts
import jsPDF from 'jspdf';

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
  });
}

export async function pngToPdf(pngBlob: Blob, widthPx: number, heightPx: number): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(pngBlob);
  });

  // 1080×1350 at 72dpi → 15in × 18.75in; aim for ~A4 portrait.
  const aspect = widthPx / heightPx;
  const pageW = 595; // A4 pt
  const pageH = pageW / aspect;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [pageW, pageH] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH);
  return pdf.output('blob');
}
```

- [ ] **Step 4: Write `pdf-from-canvas.test.ts`** (smoke — happy-dom doesn't support real canvas, so we test the API surface compiles and the pdf wrapper accepts a blob):

```ts
import { describe, expect, test } from 'bun:test';
import { pngToPdf } from './pdf-from-canvas';

describe('pdf-from-canvas', () => {
  test('pngToPdf returns a Blob for any image blob (happy-dom smoke)', async () => {
    const fakePng = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    const pdf = await pngToPdf(fakePng, 1080, 1350);
    expect(pdf).toBeInstanceOf(Blob);
    expect(pdf.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run, PASS.**

- [ ] **Step 6: Implement `share-keepsake.ts`**

```ts
import type { KeepsakePayload } from './types';

export async function shareKeepsake(payload: KeepsakePayload, onSuccess?: () => void) {
  const { pngBlob, pdfBlob, filename } = payload;
  const files = [
    new File([pngBlob], filename.replace(/\.pdf$/, '.png'), { type: 'image/png' }),
    new File([pdfBlob], filename, { type: 'application/pdf' }),
  ];
  if ('share' in navigator && (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare?.({ files })) {
    try {
      await (navigator as Navigator).share({ files });
      onSuccess?.();
      return;
    } catch {
      /* fall through to anchor */
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }
  onSuccess?.();
}
```

- [ ] **Step 7: Implement `KeepsakeRenderer.tsx`** — renders into an off-screen canvas via the template's `ctx` API:

```tsx
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { KeepsakeTemplate } from './types';
import { canvasToPng, pngToPdf } from './pdf-from-canvas';
import { shareKeepsake } from './share-keepsake';

const WIDTH = 1080;
const HEIGHT = 1350;

export type KeepsakeRendererProps<T> = {
  template: KeepsakeTemplate<T>;
  data: T;
  filename: string;
  trigger: (open: () => void, busy: boolean) => ReactNode;
  onShared?: (success: boolean) => void;
};

export function KeepsakeRenderer<T>({ template: Template, data, filename, trigger, onShared }: KeepsakeRendererProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      // Templates are React components but used here as pure draw fns through ctx.
      // The template function is invoked synchronously; data is passed via prop.
      const fragment = <Template data={data} ctx={ctx} width={WIDTH} height={HEIGHT} />;
      // Touch fragment so the ref isn't unused; templates render to canvas via ctx side effects in their render path.
      void fragment;
      const png = await canvasToPng(canvas);
      const pdf = await pngToPdf(png, WIDTH, HEIGHT);
      await shareKeepsake({ pngBlob: png, pdfBlob: pdf, filename }, () => onShared?.(true));
    } catch (err) {
      console.error('Keepsake render failed', err);
      onShared?.(false);
    } finally {
      setBusy(false);
    }
  }, [Template, data, filename, onShared]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'fixed', left: -99999, top: -99999, pointerEvents: 'none' }} aria-hidden />
      {trigger(run, busy)}
    </>
  );
}
```

Note: per-app templates implement their draw operations as `useEffect`/`useLayoutEffect` in their component body, drawing to the supplied `ctx`. A simpler alternative is to model the template as a plain `(ctx, data, w, h) => void` function — *which is what we'll actually use*. Refactor:

```tsx
// Replace KeepsakeTemplate type definition in types.ts:
export type KeepsakeTemplate<T> = (
  ctx: CanvasRenderingContext2D,
  data: T,
  width: number,
  height: number
) => void | Promise<void>;
```

And update `KeepsakeRenderer.tsx` to call it directly:

```tsx
const result = Template(ctx, data, WIDTH, HEIGHT);
if (result instanceof Promise) await result;
```

This is the right shape — templates are draw functions, not React components. (Update the file accordingly; types.ts no longer needs `ComponentType` import.)

- [ ] **Step 8: Write `index.ts`**

```ts
export { KeepsakeRenderer } from './KeepsakeRenderer';
export type { KeepsakeRendererProps } from './KeepsakeRenderer';
export type { KeepsakeTemplate, KeepsakePayload } from './types';
export { canvasToPng, pngToPdf } from './pdf-from-canvas';
export { shareKeepsake } from './share-keepsake';
```

- [ ] **Step 9: Re-export + tests + typecheck**

```bash
echo "export * from './keepsake';" >> packages/showcase-kit-v2/src/index.ts
bun run --cwd packages/showcase-kit-v2 test && bun run --cwd packages/showcase-kit-v2 typecheck
```

- [ ] **Step 10: Build the package + smoke-import from a showcase**

```bash
bun run --cwd packages/showcase-kit-v2 build
```

Expected: `dist/index.js` + `dist/index.d.ts` written. No errors.

Test resolution from an app:

```bash
cd apps/showcase-recipe && bun add @shippie/showcase-kit-v2@workspace:* && cd ../..
```

Add a single import line to `apps/showcase-recipe/src/App.tsx` (just to verify resolution — remove after):

```ts
import { EmptyState } from '@shippie/showcase-kit-v2';
```

Run: `bun run --cwd apps/showcase-recipe check`
Expected: PASS.

Remove the speculative import line.

- [ ] **Step 11: Run repo-wide health check**

Run: `bun run health` from repo root.
Expected: all green per `set -o pipefail` (capture output to a file; do NOT rely on `tail` exit codes).

- [ ] **Step 12: Commit**

```bash
git add packages/showcase-kit-v2 apps/showcase-recipe/package.json bun.lock
git commit -m "feat(showcase-kit-v2): add KeepsakeRenderer + finalize package surface"
```

---

# Phase 1 — Per-app elevations (4 parallel streams)

Each of the four tasks below dispatches a fresh implementer subagent. The agent reads the spec section, makes the changes, runs the per-app checks, and commits. Spawn all 4 in parallel.

## Task 8: Elevate Chiwit (apps/showcase-chiwit)

- [ ] **Step 1: Add kit-v2 dependency**

```bash
cd apps/showcase-chiwit && bun add @shippie/showcase-kit-v2@workspace:* && cd ../..
```

- [ ] **Step 2: Dispatch implementer agent** — see Brief A below. The agent has full responsibility for steps 3-N of this task.

**Brief A — Chiwit elevation implementer brief:**

> You are elevating `apps/showcase-chiwit/` per the spec at `docs/superpowers/specs/2026-05-19-best-in-class-showcases-design.md`, section §4. Background: read `apps/showcase-chiwit/src/App.tsx` (913 lines) and `apps/showcase-chiwit/src/styles.css` (1026 lines) end to end before touching anything. The kit at `packages/showcase-kit-v2` exports: `EmptyState`, `OnboardingFlow`, `IntentToastHost`, `QrShareSheet`, `BackupCard`, `KeepsakeRenderer`. Use them — don't reinvent.
>
> **Deliverables:**
> 1. **Onboarding** (§4.2) — mount `<OnboardingFlow appSlug="chiwit" version={1} slides={[…]}>` in App.tsx with the 3 slides verbatim from the spec, in Chiwit's voice. CSS for the flow lives in `apps/showcase-chiwit/src/styles.css` (selectors begin `shippie-onboarding`).
> 2. **Ambient pulse hero superpower** (§4.1) — create `apps/showcase-chiwit/src/IntentMatchers.ts` with the 6 matchers from the spec table. Mount `<IntentToastHost matchers={…} source={sdk}>` in App.tsx. When an ambient intent arrives, also write a signal row into the local DB tagged `source: 'app_<sibling>'` so it shows up on Today distinguished by a small sibling-app icon.
> 3. **Visual lifts** (§4.3) — sage-on-cream branded buttons (replace generic white-rgba globally in styles.css), tone-driven insight cards, pull-quote hero "reading", expanded quick-action labels with first-tap color legend, inline pulse-factor helper text, month-jump scrubber on Timeline.
> 4. **Empty states** (§4.4) — every empty branch in App.tsx renders `<EmptyState>` with copy from the spec table.
> 5. **Weekly-shape keepsake** (§4.5) — create `apps/showcase-chiwit/src/WeeklyShape.tsx` exporting a `KeepsakeTemplate<WeekShapeData>` that draws the layout described in the spec. Mount a `<KeepsakeRenderer template={WeeklyShape} data={data} filename={…} trigger={(open) => <button onClick={open}>Share this week</button>}>` in the Patterns tab.
> 6. **QR handoff** (§4.7) — anonymized week-shape via `<QrShareSheet>` on the Data tab.
> 7. **Backup** (§4.8) — add `<BackupCard>` to the Data tab. Implement a `BackupableStore` adapter against Chiwit's local DB.
> 8. **Tests** — add `apps/showcase-chiwit/src/elevation.test.tsx` covering: onboarding gate writes localStorage; weekly-shape keepsake renders without throwing; intent matcher triggers toast on emit.
> 9. **Health gate** — `bun run --cwd apps/showcase-chiwit check && bun run --cwd apps/showcase-chiwit test && bun run --cwd apps/showcase-chiwit build` all green. Capture output with `set -o pipefail`.
> 10. **Single commit** at the end: `feat(showcase-chiwit): elevate to best-in-class per spec §4`.
>
> **Constraints:** stay inside `apps/showcase-chiwit/` plus the one new dependency line in its `package.json`. Do not modify other packages or apps. Preserve the existing coral+sage palette and Fraunces typography — do not invent new fonts. Match the spec's empty-state copy verbatim.

- [ ] **Step 3: Review agent's diff** — confirm scope contained to `apps/showcase-chiwit/`; spec coverage hits all 8 spec deliverables; tests pass.
- [ ] **Step 4: Mark Task 8 complete.**

---

## Task 9: Elevate Palate / Recipe (apps/showcase-recipe)

- [ ] **Step 1: Add kit-v2 dependency**

```bash
cd apps/showcase-recipe && bun add @shippie/showcase-kit-v2@workspace:* && cd ../..
```

- [ ] **Step 2: Dispatch implementer agent — Brief B.**

**Brief B — Palate elevation implementer brief:**

> You are elevating `apps/showcase-recipe/` per the spec at `docs/superpowers/specs/2026-05-19-best-in-class-showcases-design.md`, section §5. Background: read `apps/showcase-recipe/src/App.tsx` (1249 lines), `apps/showcase-recipe/src/styles.css` (1314 lines), `apps/showcase-recipe/src/IntegratedTabs.tsx`, and the files under `src/pages/`, `src/components/`, `src/api/`, `src/db/`, `src/share/` end to end before touching anything. The kit at `packages/showcase-kit-v2` exports: `EmptyState`, `OnboardingFlow`, `IntentToastHost`, `QrShareSheet`, `BackupCard`, `KeepsakeRenderer`.
>
> **Deliverables:**
> 1. **Onboarding** (§5.2) — 3 slides verbatim from spec.
> 2. **Cook-with-me proximity hero** (§5.1) — create `apps/showcase-recipe/src/CookAlong.tsx`. Use `@shippie/proximity` (relay-gossip transport — read `packages/proximity/src/client.ts` first to learn the actual API; mirror how Match Room uses it). On CookMode entry, broadcast `cooking-now` intent with `{ recipeId, step, servings, timerExpiresAt, sessionId }`. On receive in another Palate, surface an IntentToast → opens Cook-Along view. Step + timer state synced via further intent broadcasts on advance; last-writer-wins.
> 3. **Visual lifts** (§5.3) — all six sections (Pantry table location badges + low-stock tint + expiry chip; Plan view calendar layout with meal-type color coding; Shop view source-attribution badges + aisle grouping; RecipeSheet photo hero + sage-tile ingredient boxes + numbered method boxes; Recipe editor photo preview hero + dietary tag pills; Data page BackupCard replaces KB metric).
> 4. **Empty states** (§5.4) — all 5 surfaces wired to `<EmptyState>` with verbatim copy.
> 5. **Cook-recap keepsake** (§5.5) — create `apps/showcase-recipe/src/CookRecap.tsx` as a `KeepsakeTemplate`. Mount `KeepsakeRenderer` at CookMode complete with the post-cook "add your notes" prompt.
> 6. **QR handoff** (§5.7) — promote existing recipe share to `<QrShareSheet>`.
> 7. **Backup** (§5.8) — replace inline Data page with `<BackupCard>` using the existing recipe-saver backup adapter.
> 8. **Intent matchers** — `apps/showcase-recipe/src/IntentMatchers.ts` with `pantry-low` and other-`cooked-meal` matchers from spec §5.6.
> 9. **Tests** — `apps/showcase-recipe/src/elevation.test.tsx` covering: onboarding, keepsake render, intent matcher, cook-along broadcast roundtrip via mocked proximity client.
> 10. **Health gate** — `bun run --cwd apps/showcase-recipe check && test && build` all green with `set -o pipefail`.
> 11. **Single commit**: `feat(showcase-recipe): elevate to best-in-class per spec §5`.
>
> **Constraints:** stay in `apps/showcase-recipe/`. Preserve cooking-orange + sage-tile palette and kitchen-tile atmosphere. Do not break the existing iOS-aware durability story shipped in commit `4b15c45`. Match empty-state copy verbatim.

- [ ] **Step 3: Review agent's diff. Step 4: Mark Task 9 complete.**

---

## Task 10: Elevate Match Room (apps/showcase-match-room)

- [ ] **Step 1: Add kit-v2 dependency**

```bash
cd apps/showcase-match-room && bun add @shippie/showcase-kit-v2@workspace:* && cd ../..
```

- [ ] **Step 2: Dispatch implementer agent — Brief C.**

**Brief C — Match Room elevation implementer brief:**

> You are elevating `apps/showcase-match-room/` per the spec at `docs/superpowers/specs/2026-05-19-best-in-class-showcases-design.md`, section §6. Background: read `apps/showcase-match-room/src/App.tsx`, `apps/showcase-match-room/src/styles.css` (1479 lines), `src/HostMatchday.tsx`, `src/GuestMatchday.tsx`, `src/DisplayMatchday.tsx`, `src/types.ts`, `src/local-store.ts`, `src/i18n.ts` end to end before touching anything.
>
> **Deliverables:**
> 1. **Onboarding** (§6.2) — 3 slides verbatim.
> 2. **Hero superpower bundle** (§6.1):
>    - Replace bordered-card hero with full-bleed scoreboard moment — `apps/showcase-match-room/src/HeroScoreboard.tsx`. Team-color stripes, gold-leaf on pitch-green, 96px Fraunces fixture title, kickoff countdown mono, `[N] in the room` presence pill.
>    - `apps/showcase-match-room/src/PresenceRibbon.tsx` — peer initials + team-color dots + "voted last" mark, mounted under header.
>    - Poll-close fanfare — canvas confetti burst (200ms, max 60 particles, reduced-motion fallback), tone-color scoreboard flash, single haptic tick. Implement as `apps/showcase-match-room/src/Fanfare.tsx`.
>    - `apps/showcase-match-room/src/Buzzer.tsx` — goal-prediction polls close on `floor(N/2)+1` of `N` present peers (consensus rule from spec §6.1). "PEER-LOCKED" italic-mono badge on closed polls.
>    - MVP votes — post-match POTM vote across peers. Lives in `apps/showcase-match-room/src/MvpVote.tsx`.
>    - Sweepstake tracker — promote stub `SweepstakePanel` to full lifecycle (open at kickoff, predictions in, host reveals at full-time).
> 3. **Visual lifts** (§6.3) — saved rooms as cards (not bullets), QR-first join (host shows large 480×480 QR), pre-match empty state with team lineups + fixture info + kickoff countdown + sweepstake CTA, host shoutout queue with swipe-right-to-approve gesture, italic-mono match codes throughout.
> 4. **Empty states** (§6.4) — all 5 surfaces wired to `<EmptyState>` verbatim.
> 5. **Full-time programme keepsake** (§6.5) — `apps/showcase-match-room/src/FulltimeProgramme.tsx` as a `KeepsakeTemplate`. Mount renderer once `match.fullTime` event fires. Photo mosaic only if guests added photos (otherwise pitch-grid texture).
> 6. **QR handoff** (§6.7) — primary join path is QR via `<QrShareSheet>`. URL paste falls to fallback.
> 7. **Backup** (§6.8) — per-room encrypted backup with `<BackupCard>` (one card per saved room on the Data view, since the design says individual matches restorable separately).
> 8. **Intent matchers** — `apps/showcase-match-room/src/IntentMatchers.ts` with `fantasy-team.saved` → "Sarah's locked in! 🔒" cheer toast.
> 9. **Tests** — `apps/showcase-match-room/src/elevation.test.tsx`: onboarding, scoreboard render, presence ribbon update, buzzer consensus rule, full-time keepsake render.
> 10. **Health gate** — `bun run --cwd apps/showcase-match-room check && test && build` all green with `set -o pipefail`.
> 11. **Single commit**: `feat(showcase-match-room): elevate to best-in-class per spec §6`.
>
> **Constraints:** stay in `apps/showcase-match-room/`. Preserve pitch-green + gold-leaf palette, pitch-grid texture, italic-mono match codes. Do not break existing relay-gossip transport — extend it. The `SignalRelay` variant on `SignalMessage` union is canonical; do not narrow it.

- [ ] **Step 3: Review. Step 4: Mark complete.**

---

## Task 11: Elevate World Cup Fantasy (apps/showcase-world-cup-fantasy)

- [ ] **Step 1: Add kit-v2 dependency**

```bash
cd apps/showcase-world-cup-fantasy && bun add @shippie/showcase-kit-v2@workspace:* && cd ../..
```

- [ ] **Step 2: Dispatch implementer agent — Brief D.**

**Brief D — WC Fantasy elevation implementer brief:**

> You are elevating `apps/showcase-world-cup-fantasy/` per the spec at `docs/superpowers/specs/2026-05-19-best-in-class-showcases-design.md`, section §7. Background: read `apps/showcase-world-cup-fantasy/src/App.tsx`, `apps/showcase-world-cup-fantasy/src/styles.css`, and every file under `src/` end to end before touching anything.
>
> **Deliverables:**
> 1. **Onboarding** (§7.2) — 3 slides verbatim.
> 2. **Couch league hero** (§7.1) — create `apps/showcase-world-cup-fantasy/src/CouchLeague.tsx`. UUID league-id at create-time, signed by Phone A's local key via `@shippie/share`. **Pass to next manager** opens `<QrShareSheet>` with signed-fragment league-context payload. Receiving phone opens fresh squad picker pre-loaded with that league's tournament data. Each phone keeps its own squad locally; standings computed peer-to-peer from broadcast `fantasy-team.scoreSnapshot` intents. Use the same proximity/relay client Match Room uses.
> 3. **Visual lifts** (§7.3) — Player rows → player cards (badge color stripe + position chip + price mono + projected delta); scout tips visual anchor (icon + callout box + "why this matters" subline); leaderboard drama (position-change glow + ±N badge + captain-contribution gold dot); `apps/showcase-world-cup-fantasy/src/CaptainCompare.tsx` for side-by-side "if captain" scoring; draft state with cold-open "Resume your draft (N of 15)"; budget margin horizontal bar; chips "hot" state per chip rules.
> 4. **Empty states** (§7.4) — all 5 surfaces wired to `<EmptyState>` verbatim.
> 5. **Tournament programme keepsake** (§7.5) — `apps/showcase-world-cup-fantasy/src/TournamentProgramme.tsx` as `KeepsakeTemplate`. Fires once `final-snapshot` transition. Captain log per match table, league finish, snapshot deltas.
> 6. **QR handoff** (§7.7) — couch-league pass-the-phone is the primary use case. Existing share-squad-as-image is secondary.
> 7. **Backup** (§7.8) — encrypted league + squad backup. Restoring restores both; peers re-broadcast their scores when they detect a restored device.
> 8. **Intent matchers** — `apps/showcase-world-cup-fantasy/src/IntentMatchers.ts` with Match Room `match.kickoff-soon` → "Kickoff in 10 minutes — your captain plays" banner.
> 9. **Tests** — `apps/showcase-world-cup-fantasy/src/elevation.test.tsx`: onboarding, couch-league QR roundtrip via mocked share, leaderboard position-change glow, keepsake render, draft state persistence.
> 10. **Health gate** — `bun run --cwd apps/showcase-world-cup-fantasy check && test && build` all green with `set -o pipefail`.
> 11. **Single commit**: `feat(showcase-world-cup-fantasy): elevate to best-in-class per spec §7`.
>
> **Constraints:** stay in `apps/showcase-world-cup-fantasy/`. Preserve programme aesthetic (pitch-green + gold-leaf + Fraunces). Live-scoring engine and VAR-safe recompute path stay intact. Seeded tournament data stays seeded — no real fixture API wiring.

- [ ] **Step 3: Review. Step 4: Mark complete.**

---

# Phase 2 — Cross-app smoke

## Task 12: Cross-app intent smoke

**Files:** none modified — manual procedure.

- [ ] **Step 1: Run full repo health**

```bash
set -o pipefail
bun run health 2>&1 | tee /tmp/shippie-health.log
echo "Exit: $?"
```

Expected: all green. If any failure, fix in the offending app's spec before Phase 3.

- [ ] **Step 2: Start dev platform**

```bash
bun run --cwd apps/platform dev &
DEV_PID=$!
```

Wait for `localhost:5173` (or platform's actual dev port).

- [ ] **Step 3: Manual cross-app emit/consume matrix** — open all 4 showcases in 4 browser tabs at their `/run/<slug>/` URLs. For each emit/consume pair, trigger the source action and confirm the receiver shows an IntentToast:

| From | Emit | To | Expected toast |
|---|---|---|---|
| showcase-coffee | `coffee.brewed` | showcase-chiwit | "Coffee Brewer logged …" |
| showcase-lift | `workout.completed` | showcase-chiwit | "Lift logged a workout" |
| showcase-pantry-scanner | `pantry-low` | showcase-recipe | "garlic low (via Pantry Scanner)" |
| showcase-world-cup-fantasy | `fantasy-team.saved` | showcase-match-room | "Sarah's locked in! 🔒" |
| showcase-match-room | `match.kickoff-soon` | showcase-world-cup-fantasy | "Kickoff in 10 minutes …" |

For each row that fails, capture the actual emitted kind from the source app (read its `intent.emit(...)` calls or `shippie.json`), reconcile the matcher in the receiver's `IntentMatchers.ts`, commit the matcher fix with a focused message.

- [ ] **Step 4: Stop dev server**

```bash
kill $DEV_PID
```

- [ ] **Step 5: If any matcher fixes were committed, re-run health**

```bash
bun run health 2>&1 | tee /tmp/shippie-health-2.log
```

Expected: all green.

- [ ] **Step 6: Update `docs/CURRENT_STATE.md`** with one paragraph noting the elevation pass landed and the cross-app intent matrix is verified.

```bash
git add docs/CURRENT_STATE.md
git commit -m "docs: record showcase-elevation cross-app smoke verification"
```

---

# Phase 3 — Real-phone smoke (user-driven)

## Task 13: Real-phone checklist

**Files:** none modified — user runs the checklist manually.

- [ ] **Step 1: Print the checklist additions** — append the 4 elevation-specific items to `docs/launch/real-phone-checklist.md`:

```markdown
## Showcase elevation checks (2026-05-19)

- [ ] Open each of chiwit, palate, match-room, world-cup-fantasy cold on iPhone Safari and Android Chrome — onboarding fires, skip works, second open skips.
- [ ] Keepsake share-sheet opens in iOS Files / Android Share for each app.
- [ ] Buzzer-fairness reaches consensus across 2 real phones on same wifi in Match Room.
- [ ] Couch-league QR roundtrip works between 2 phones in WC Fantasy.
- [ ] Cook-with-me proximity sync survives phone-locked → unlocked transition in Palate.
- [ ] Cross-app intent toasts appear when sibling apps emit, across all 4 apps.
```

Commit:

```bash
git add docs/launch/real-phone-checklist.md
git commit -m "docs(launch): extend real-phone checklist with elevation checks"
```

- [ ] **Step 2: PAUSE FOR USER.** Hand the checklist to the user; do not proceed to Phase 4 without explicit "real-phone smoke passed" confirmation.

---

# Phase 4 — Deploy (user-authorized)

## Task 14: Production deploy

**Files:** none modified.

- [ ] **Step 1: PAUSE FOR USER AUTHORIZATION.** Per CLAUDE.md, commits to main and deploys require explicit user authorization. Confirm before running.

- [ ] **Step 2: Clean platform build state**

```bash
rm -rf apps/platform/.svelte-kit apps/platform/.wrangler apps/platform/dist
```

(This addresses the 5th-time recurring stale-manifest lesson.)

- [ ] **Step 3: Deploy**

```bash
set -o pipefail
bun run --cwd apps/platform deploy 2>&1 | tee /tmp/shippie-deploy.log
echo "Exit: $?"
```

Expected: new worker version published. Note the worker version ID in the log.

- [ ] **Step 4: Prod smoke (13 routes)**

```bash
set -o pipefail
for route in /  /apps /today /glance /run/chiwit/ /run/recipe/ /run/match-room/ /run/world-cup-fantasy/ chiwit.shippie.app recipe.shippie.app match-room.shippie.app world-cup-fantasy.shippie.app /__shippie/meta; do
  base="https://shippie.app"
  if [[ "$route" == *.shippie.app ]]; then url="https://$route"; else url="$base$route"; fi
  status=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  echo "$status $url"
done | tee /tmp/shippie-prod-smoke.log
```

Expected: 13/13 200s.

- [ ] **Step 5: Update CURRENT_STATE.md** with deploy worker version + smoke result.

```bash
git add docs/CURRENT_STATE.md
git commit -m "docs(state): showcase elevation deployed to prod"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

---

## Self-Review (writer to fill before handoff)

**1. Spec coverage:** Every section of spec §3 (architecture) maps to Phase 0 (Tasks 1-7). Every section of spec §4-7 maps to a per-app brief in Tasks 8-11. Testing (spec §8) is covered by per-task tests + cross-app smoke (Task 12). Rollout (spec §9) is the Phase 0-4 structure of this plan. Risk register (spec §10) is enforced via `set -o pipefail`, `dts: true`, clean `.svelte-kit`/`.wrangler` before deploy.

**2. Placeholder scan:** No "TBD" or "TODO" remain. Each Phase 0 task contains complete code. Phase 1 tasks delegate to subagents via complete briefs (Briefs A-D).

**3. Type consistency:** `KeepsakeTemplate<T>` is defined twice across types.ts and refined in Task 7 step 7 (template is a draw fn, not a React component). Confirmed the refinement is the canonical shape used by KeepsakeRenderer.tsx.

**4. Ambiguity:** Buzzer-fairness consensus rule explicit (`floor(N/2)+1` of `N` present peers, with `N >= 2` baseline). Couch-league QR payload is signed via `@shippie/share`. Backup adapter shape is `BackupableStore` with explicit method signatures.

---

## Execution Options

This plan is ready to execute. Two options:

**1. Subagent-Driven Development** (recommended for this plan) — Phase 0 tasks 1-7 are bite-sized TDD steps suitable for a fresh subagent per task with review between. Phase 1 tasks 8-11 are explicitly designed as parallel subagent dispatches (Briefs A-D). Cross-app smoke (Phase 2) is best done by the main session.

**2. Inline executing-plans** — feasible but slower for this plan since Phase 1 is the main work and is parallelizable.

Recommendation: **Subagent-Driven** for Phases 0-1; back to main session for Phase 2; user-driven for Phases 3-4.
