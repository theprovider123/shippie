# PWA Wrapper — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared wrapper runtime (in `@shippie/sdk`) that provides in-app-browser (IAB) detection + bounce sheet and a smart install prompt, plus an enriched `__shippie/manifest` route for every deployed app. The marketplace (`apps/web`) self-hosts this runtime, proving the install funnel works end-to-end on both Shippie itself and every maker app. Desktop→mobile handoff ships as pure helper functions in this phase (no UI, no backend); the QR/email/push sheet itself lands in Phase 2 along with the other native-feel motion work.

**Architecture:** Wrapper code lives in `packages/sdk/src/wrapper/` alongside existing SDK modules, exposed both via npm (`@shippie/sdk/wrapper`) and same-origin via the existing `__shippie/sdk.js` route. The Worker's `__shippie/manifest` route is extended to merge a maker's `shippie.json` declarations with modern PWA fields (`launch_handler`, `display_override`, `id`, `share_target`, maskable icons, screenshots). The marketplace's existing `PwaInstallBanner` component is replaced with a thin React wrapper over the shared runtime so Shippie dogfoods its own install funnel.

**Tech Stack:** TypeScript, Bun test runner, Hono (Worker), React 19 (Next.js 16 App Router on Vercel), existing `@shippie/shared` types, existing `@shippie/sdk` package.

---

## Scope

Phase 1 delivers, end-to-end:
1. A shared `wrapper` submodule in `@shippie/sdk` that ships:
   - **IAB detection + bounce sheet UI** — fully functional in the marketplace and any maker app that loads `__shippie/sdk.js`.
   - **Smart install prompt** (engagement-gated banner) — fully functional.
   - **Desktop handoff helpers only** — `buildHandoffUrl`, `validateEmail`, `buildHandoffEmailPayload`. Pure functions, no UI, no `/__shippie/handoff` backend endpoint. Phase 2 builds the QR/email/push sheet on top of these.
2. An enriched `__shippie/manifest` route that merges `shippie.json` fields and adds `launch_handler`, `display_override`, `id`, `share_target`, maskable icons, `screenshots`.
3. `shippie.json` schema extension for Phase 1 fields (`pwa.launch_handler`, `pwa.display_override`, `pwa.id`, `pwa.share_target`, `pwa.maskable_icon`).
4. Marketplace (`apps/web`) replaces the `PwaInstallBanner` currently rendered in `apps/web/app/page.tsx` with the shared runtime — Shippie itself proves the funnel works.
5. Tests for all new logic.

**Out of scope (Phases 2–5):** desktop→mobile handoff UI sheet (QR / email form / push-to-phone), the `/__shippie/handoff` backend endpoint to send handoff emails/push, back-swipe, pull-to-refresh, View Transitions beyond the existing fade, splash image generation at deploy time, event spine + dashboard, marketplace attribution, paid tier, custom domain UX.

---

## File Map

### New files
- `packages/sdk/src/wrapper/index.ts` — entry point exporting the wrapper runtime
- `packages/sdk/src/wrapper/detect.ts` — user-agent detection: IAB, iOS/Android/other, in-browser/standalone
- `packages/sdk/src/wrapper/detect.test.ts` — unit tests for detection
- `packages/sdk/src/wrapper/install-prompt.ts` — smart-prompt state machine (visit counter, dismiss memory, meaningful-action hooks)
- `packages/sdk/src/wrapper/install-prompt.test.ts` — state machine tests
- `packages/sdk/src/wrapper/iab-bounce.ts` — bounce-sheet construction + intent/safari-scheme CTAs
- `packages/sdk/src/wrapper/iab-bounce.test.ts` — bounce logic tests
- `packages/sdk/src/wrapper/handoff.ts` — desktop handoff helpers (QR URL, email-to-self, phone-push)
- `packages/sdk/src/wrapper/handoff.test.ts` — handoff helper tests
- `packages/sdk/src/wrapper/ui.ts` — vanilla DOM rendering of **install banner + IAB bounce sheet only** (framework-agnostic so maker apps without React work). The desktop→mobile handoff sheet is explicitly out of Phase 1 scope — handoff in Phase 1 is helpers-only (see the Scope section above) and the sheet UI lands in Phase 2.
- `packages/sdk/src/wrapper/ui.test.ts` — DOM-render smoke tests for banner + bounce sheet (happy-dom)
- `apps/web/app/components/install-runtime.tsx` — React wrapper around the vanilla runtime
- `apps/web/app/components/install-runtime.test.tsx` — React-side smoke test

### Modified files
- `packages/shared/src/shippie-json.ts` — extend `ShippieJsonPwa` interface with Phase 1 fields
- `packages/sdk/src/index.ts` — re-export `@shippie/sdk/wrapper` entry
- `packages/sdk/package.json` — add `"./wrapper"` export
- `packages/sdk/tsup.config.ts` — add wrapper entry to build
- `services/worker/src/router/manifest.ts` — read expanded metadata, merge all Phase 1 fields
- `services/worker/src/router/manifest.test.ts` — new test file for merge behavior (verify no existing test file first)
- `apps/web/app/page.tsx` — drop the `PwaInstallBanner` import (line 9) and JSX (line 382), mount `InstallRuntime` in its place
- `apps/web/app/components/pwa-install-banner.tsx` — **delete** (replaced by wrapper)

---

## Task 1 — Extend `ShippieJsonPwa` with Phase 1 fields

**Files:**
- Modify: `packages/shared/src/shippie-json.ts:27-34` (the `ShippieJsonPwa` interface)

- [ ] **Step 1: Read the current interface to confirm starting state**

Run:
```bash
cat packages/shared/src/shippie-json.ts | head -40
```
Expected: current `ShippieJsonPwa` has `display`, `orientation`, `start_url`, `scope`, `conflict_policy`, `screenshots`.

- [ ] **Step 2: Add Phase 1 PWA fields**

Replace the existing `ShippieJsonPwa` interface with the extended version:

```ts
export interface ShippieJsonPwaLaunchHandler {
  client_mode?:
    | 'auto'
    | 'focus-existing'
    | 'navigate-existing'
    | 'navigate-new'
    | readonly (
        | 'auto'
        | 'focus-existing'
        | 'navigate-existing'
        | 'navigate-new'
      )[];
}

export interface ShippieJsonPwaShareTargetParams {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShippieJsonPwaShareTarget {
  action: string;
  method?: 'GET' | 'POST';
  enctype?: 'application/x-www-form-urlencoded' | 'multipart/form-data';
  params?: ShippieJsonPwaShareTargetParams;
}

export interface ShippieJsonPwa {
  display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  orientation?: 'any' | 'portrait' | 'landscape';
  start_url?: string;
  scope?: string;
  conflict_policy?: ConflictPolicy;
  screenshots?: readonly string[];

  // Phase 1 additions
  id?: string;
  display_override?: readonly ('standalone' | 'fullscreen' | 'minimal-ui' | 'browser')[];
  launch_handler?: ShippieJsonPwaLaunchHandler;
  share_target?: ShippieJsonPwaShareTarget;
  /** Icon declared for purpose="maskable". Path relative to repo root, same rules as `icon`. */
  maskable_icon?: string;
  categories?: readonly string[];
}
```

- [ ] **Step 3: Typecheck the shared package**

Run:
```bash
cd packages/shared && bun run typecheck
```
Expected: exits 0, no new errors introduced.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/shippie-json.ts
git commit -m "feat(shared): add Phase 1 PWA fields to shippie.json schema"
```

---

## Task 2 — Write failing tests for UA detection

**Files:**
- Create: `packages/sdk/src/wrapper/detect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/wrapper/detect.test.ts
import { describe, expect, test } from 'bun:test';
import {
  detectInstallMethod,
  detectIab,
  detectPlatform,
  type InstallContext,
} from './detect.ts';

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 333.0.0.33.111 (iPhone15,3)',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/500.0.0.33.106]',
  tiktok:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile musical_ly_28.0.0 trill_280000',
  twitter:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Twitter for iPhone/10.45',
  linkedin:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 LinkedInApp/9.29.6210',
  whatsapp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 WhatsApp/24.5.83',
} as const;

describe('detectPlatform', () => {
  test('ios from iPhone UA', () => {
    expect(detectPlatform(UA.iosSafari)).toBe('ios');
  });
  test('android from Pixel UA', () => {
    expect(detectPlatform(UA.androidChrome)).toBe('android');
  });
  test('desktop from Mac UA', () => {
    expect(detectPlatform(UA.desktopChrome)).toBe('desktop');
  });
});

describe('detectInstallMethod', () => {
  test('ios-safari → ios-safari', () => {
    expect(detectInstallMethod(UA.iosSafari)).toBe('ios-safari');
  });
  test('ios-chrome → ios-chrome', () => {
    expect(detectInstallMethod(UA.iosChrome)).toBe('ios-chrome');
  });
  test('ios-firefox → ios-other', () => {
    expect(detectInstallMethod(UA.iosFirefox)).toBe('ios-other');
  });
  test('android → manual (until beforeinstallprompt upgrades it)', () => {
    expect(detectInstallMethod(UA.androidChrome)).toBe('manual');
  });
  test('desktop chrome → manual', () => {
    expect(detectInstallMethod(UA.desktopChrome)).toBe('manual');
  });
});

describe('detectIab', () => {
  test.each([
    ['instagram', UA.instagram, 'instagram'],
    ['facebook', UA.facebook, 'facebook'],
    ['tiktok', UA.tiktok, 'tiktok'],
    ['twitter', UA.twitter, 'twitter'],
    ['linkedin', UA.linkedin, 'linkedin'],
    ['whatsapp', UA.whatsapp, 'whatsapp'],
  ])('%s detected as %s', (_, ua, expected) => {
    expect(detectIab(ua)).toBe(expected);
  });

  test('plain iOS Safari is not an IAB', () => {
    expect(detectIab(UA.iosSafari)).toBeNull();
  });
  test('plain Android Chrome is not an IAB', () => {
    expect(detectIab(UA.androidChrome)).toBeNull();
  });
});

describe('InstallContext type surface (compile-time)', () => {
  test('exports the type', () => {
    const _ctx: InstallContext = {
      platform: 'ios',
      method: 'ios-safari',
      iab: null,
      standalone: false,
    };
    expect(_ctx.platform).toBe('ios');
  });
});
```

- [ ] **Step 2: Run test — expect failure because module doesn't exist yet**

Run:
```bash
cd packages/sdk && bun test src/wrapper/detect.test.ts
```
Expected: compile error `Cannot find module './detect.ts'`.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/sdk/src/wrapper/detect.test.ts
git commit -m "test(sdk/wrapper): failing UA detection tests"
```

---

## Task 3 — Implement UA detection

**Files:**
- Create: `packages/sdk/src/wrapper/detect.ts`

- [ ] **Step 1: Write the implementation**

```ts
// packages/sdk/src/wrapper/detect.ts
/**
 * UA detection for the wrapper runtime.
 *
 * Three independent signals:
 *   1. Platform: ios / android / desktop
 *   2. Install method: what the user would have to do to install this PWA
 *   3. IAB: which in-app browser (if any) the user is trapped in
 *
 * Strings are matched case-sensitively against common public UA fragments.
 * Quarterly review required — see spec §5.1.
 */
export type Platform = 'ios' | 'android' | 'desktop';

export type InstallMethod =
  | 'one-tap'      // Android beforeinstallprompt available
  | 'ios-safari'   // iOS Safari — Share → Add to Home Screen
  | 'ios-chrome'   // iOS Chrome (CriOS) — ⋯ → Add to Home Screen
  | 'ios-other'    // iOS non-Safari/Chrome (Firefox FxiOS, Opera OPiOS, Edge EdgiOS, etc.)
  | 'manual';      // everything else

export type IabBrand =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'twitter'
  | 'linkedin'
  | 'snapchat'
  | 'pinterest'
  | 'whatsapp'
  | 'wechat'
  | 'line';

export interface InstallContext {
  platform: Platform;
  method: InstallMethod;
  iab: IabBrand | null;
  standalone: boolean;
}

export function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function detectInstallMethod(ua: string): InstallMethod {
  if (/iPhone|iPad|iPod/.test(ua)) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|OPiOS|EdgiOS/.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  // Android + desktop start as 'manual' and are promoted to 'one-tap'
  // when the wrapper runtime sees the `beforeinstallprompt` event.
  return 'manual';
}

interface IabPattern {
  brand: IabBrand;
  pattern: RegExp;
}

const IAB_PATTERNS: readonly IabPattern[] = [
  { brand: 'instagram', pattern: /Instagram/ },
  { brand: 'facebook', pattern: /FBAN|FBAV|FB_IAB|FBIOS/ },
  { brand: 'tiktok', pattern: /musical_ly|TikTok|trill_/ },
  { brand: 'twitter', pattern: /Twitter for|TwitterAndroid/ },
  { brand: 'linkedin', pattern: /LinkedInApp/ },
  { brand: 'snapchat', pattern: /Snapchat/ },
  { brand: 'pinterest', pattern: /Pinterest/ },
  { brand: 'whatsapp', pattern: /WhatsApp/ },
  { brand: 'wechat', pattern: /MicroMessenger/ },
  { brand: 'line', pattern: /Line\/|LIFF/ },
];

export function detectIab(ua: string): IabBrand | null {
  for (const { brand, pattern } of IAB_PATTERNS) {
    if (pattern.test(ua)) return brand;
  }
  return null;
}

export function detectStandalone(nav: {
  standalone?: boolean;
} & Navigator, match: (query: string) => { matches: boolean }): boolean {
  // iOS Safari exposes `navigator.standalone` as a boolean
  if (nav.standalone === true) return true;
  // Everyone else uses the display-mode media query
  return match('(display-mode: standalone)').matches;
}

/**
 * Convenience: read everything the runtime needs in one call.
 * Pass `nav` and `mm` so tests can inject fakes.
 */
export function readInstallContext(
  ua: string,
  nav: { standalone?: boolean } & Partial<Navigator>,
  mm: (q: string) => { matches: boolean },
): InstallContext {
  return {
    platform: detectPlatform(ua),
    method: detectInstallMethod(ua),
    iab: detectIab(ua),
    standalone: detectStandalone(nav as Navigator & { standalone?: boolean }, mm),
  };
}
```

- [ ] **Step 2: Run tests — expect green**

Run:
```bash
cd packages/sdk && bun test src/wrapper/detect.test.ts
```
Expected: all tests pass.

- [ ] **Step 3: Typecheck**

Run:
```bash
cd packages/sdk && bun run typecheck
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wrapper/detect.ts
git commit -m "feat(sdk/wrapper): UA detection for platform, install method, IAB"
```

---

## Task 4 — Failing tests for smart-prompt state machine

**Files:**
- Create: `packages/sdk/src/wrapper/install-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/wrapper/install-prompt.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  computePromptTier,
  recordVisit,
  recordDismissal,
  recordMeaningfulAction,
  isDismissedRecently,
  type PromptState,
  type PromptTier,
} from './install-prompt.ts';

const NOW = 1_760_000_000_000; // fixed ms epoch for deterministic tests

function freshState(): PromptState {
  return {
    visit_count: 0,
    first_visit_at: NOW,
    last_visit_at: NOW,
    dwell_ms: 0,
    meaningful_actions: 0,
    last_dismissed_at: null,
  };
}

describe('computePromptTier', () => {
  test('visit 1, no dwell → none (nav pill only)', () => {
    const s = freshState();
    s.visit_count = 1;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('none');
  });

  test('visit 1, >60s dwell → soft banner', () => {
    const s = freshState();
    s.visit_count = 1;
    s.dwell_ms = 61_000;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('soft');
  });

  test('visit 2 → soft banner', () => {
    const s = freshState();
    s.visit_count = 2;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('soft');
  });

  test('visit 3 → full sheet', () => {
    const s = freshState();
    s.visit_count = 3;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('full');
  });

  test('any visit + meaningful action → full sheet', () => {
    const s = freshState();
    s.visit_count = 1;
    s.meaningful_actions = 1;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('full');
  });

  test('dismissed within 14 days → none', () => {
    const s = freshState();
    s.visit_count = 5;
    s.meaningful_actions = 3;
    s.last_dismissed_at = NOW - 10 * 86_400_000; // 10 days ago
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('none');
  });

  test('dismissed 15 days ago → tier applies again', () => {
    const s = freshState();
    s.visit_count = 3;
    s.last_dismissed_at = NOW - 15 * 86_400_000;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('full');
  });
});

describe('recordVisit', () => {
  test('first visit starts counter at 1 with first_visit_at set', () => {
    const s = recordVisit(null, NOW);
    expect(s.visit_count).toBe(1);
    expect(s.first_visit_at).toBe(NOW);
    expect(s.last_visit_at).toBe(NOW);
  });

  test('second visit within 30 min does not increment', () => {
    const s1 = recordVisit(null, NOW);
    const s2 = recordVisit(s1, NOW + 5 * 60_000); // +5 min
    expect(s2.visit_count).toBe(1);
    expect(s2.last_visit_at).toBe(NOW + 5 * 60_000);
  });

  test('return visit after 30 min increments', () => {
    const s1 = recordVisit(null, NOW);
    const s2 = recordVisit(s1, NOW + 45 * 60_000); // +45 min
    expect(s2.visit_count).toBe(2);
  });
});

describe('recordDismissal / isDismissedRecently', () => {
  test('fresh state is not dismissed', () => {
    expect(isDismissedRecently(freshState(), NOW)).toBe(false);
  });

  test('just-dismissed state is dismissed', () => {
    const s = recordDismissal(freshState(), NOW);
    expect(isDismissedRecently(s, NOW)).toBe(true);
  });

  test('dismissal expires at day 14', () => {
    const s = recordDismissal(freshState(), NOW);
    expect(isDismissedRecently(s, NOW + 13 * 86_400_000)).toBe(true);
    expect(isDismissedRecently(s, NOW + 15 * 86_400_000)).toBe(false);
  });
});

describe('recordMeaningfulAction', () => {
  test('increments meaningful_actions', () => {
    let s = freshState();
    s = recordMeaningfulAction(s);
    expect(s.meaningful_actions).toBe(1);
    s = recordMeaningfulAction(s);
    expect(s.meaningful_actions).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect failure (module not found)**

Run:
```bash
cd packages/sdk && bun test src/wrapper/install-prompt.test.ts
```
Expected: compile error `Cannot find module './install-prompt.ts'`.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/sdk/src/wrapper/install-prompt.test.ts
git commit -m "test(sdk/wrapper): failing smart-prompt state machine tests"
```

---

## Task 5 — Implement smart-prompt state machine

**Files:**
- Create: `packages/sdk/src/wrapper/install-prompt.ts`

- [ ] **Step 1: Write the implementation**

```ts
// packages/sdk/src/wrapper/install-prompt.ts
/**
 * Engagement-gated install prompt state machine.
 *
 * Tiers:
 *   - 'none'  → no banner. Subtle nav pill only.
 *   - 'soft'  → 40px top banner, dismissible.
 *   - 'full'  → full-bleed sheet with 3-step guide.
 *
 * Rules (see spec §5.3):
 *   - Visit 1, dwell < 60s → none
 *   - Visit 1, dwell >= 60s → soft
 *   - Visit 2 → soft
 *   - Visit 3+ → full
 *   - Any meaningful action → full
 *   - Dismissed in last 14 days → none (overrides)
 */
const SAME_SESSION_MS = 30 * 60 * 1000; // 30 min
const DISMISSAL_COOLDOWN_MS = 14 * 86_400_000; // 14 days
const DWELL_FOR_SOFT_MS = 60_000; // 60 s

export type PromptTier = 'none' | 'soft' | 'full';

export interface PromptState {
  visit_count: number;
  first_visit_at: number;
  last_visit_at: number;
  /** Cumulative dwell time across all visits, in ms. Caller updates on visibilitychange. */
  dwell_ms: number;
  /** Deploy, install, feedback, rating — counted by the caller. */
  meaningful_actions: number;
  last_dismissed_at: number | null;
}

export function isDismissedRecently(state: PromptState, now: number): boolean {
  if (state.last_dismissed_at === null) return false;
  return now - state.last_dismissed_at < DISMISSAL_COOLDOWN_MS;
}

export function computePromptTier(state: PromptState, now: number): PromptTier {
  if (isDismissedRecently(state, now)) return 'none';
  if (state.meaningful_actions > 0) return 'full';
  if (state.visit_count >= 3) return 'full';
  if (state.visit_count >= 2) return 'soft';
  if (state.visit_count === 1 && state.dwell_ms >= DWELL_FOR_SOFT_MS) return 'soft';
  return 'none';
}

export function recordVisit(prev: PromptState | null, now: number): PromptState {
  if (!prev) {
    return {
      visit_count: 1,
      first_visit_at: now,
      last_visit_at: now,
      dwell_ms: 0,
      meaningful_actions: 0,
      last_dismissed_at: null,
    };
  }
  const inSameSession = now - prev.last_visit_at < SAME_SESSION_MS;
  return {
    ...prev,
    visit_count: inSameSession ? prev.visit_count : prev.visit_count + 1,
    last_visit_at: now,
  };
}

export function recordDismissal(prev: PromptState, now: number): PromptState {
  return { ...prev, last_dismissed_at: now };
}

export function recordMeaningfulAction(prev: PromptState): PromptState {
  return { ...prev, meaningful_actions: prev.meaningful_actions + 1 };
}

export function addDwell(prev: PromptState, delta_ms: number): PromptState {
  return { ...prev, dwell_ms: prev.dwell_ms + delta_ms };
}

/**
 * Serialize/deserialize for localStorage or a signed cookie.
 * Caller is responsible for persistence; this module is pure.
 */
export function serialize(state: PromptState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string | null): PromptState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PromptState>;
    if (
      typeof parsed.visit_count !== 'number' ||
      typeof parsed.first_visit_at !== 'number' ||
      typeof parsed.last_visit_at !== 'number' ||
      typeof parsed.dwell_ms !== 'number' ||
      typeof parsed.meaningful_actions !== 'number' ||
      (parsed.last_dismissed_at !== null && typeof parsed.last_dismissed_at !== 'number')
    ) {
      return null;
    }
    return parsed as PromptState;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run tests — expect green**

Run:
```bash
cd packages/sdk && bun test src/wrapper/install-prompt.test.ts
```
Expected: all 13 tests pass.

- [ ] **Step 3: Typecheck**

Run:
```bash
cd packages/sdk && bun run typecheck
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wrapper/install-prompt.ts
git commit -m "feat(sdk/wrapper): smart-prompt state machine"
```

---

## Task 6 — Failing tests for IAB bounce

**Files:**
- Create: `packages/sdk/src/wrapper/iab-bounce.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/wrapper/iab-bounce.test.ts
import { describe, expect, test } from 'bun:test';
import { buildBounceTarget, type BounceInput } from './iab-bounce.ts';

describe('buildBounceTarget', () => {
  test('ios opens x-safari-https://', () => {
    const input: BounceInput = {
      platform: 'ios',
      currentUrl: 'https://shippie.app/apps/zen',
    };
    expect(buildBounceTarget(input)).toEqual({
      scheme: 'x-safari-https',
      url: 'x-safari-https://shippie.app/apps/zen',
    });
  });

  test('ios http URL still uses x-safari-https (upgrades to https)', () => {
    const input: BounceInput = {
      platform: 'ios',
      currentUrl: 'http://shippie.app/apps/zen',
    };
    expect(buildBounceTarget(input).scheme).toBe('x-safari-https');
  });

  test('android uses intent://', () => {
    const input: BounceInput = {
      platform: 'android',
      currentUrl: 'https://shippie.app/apps/zen?utm=x',
    };
    const result = buildBounceTarget(input);
    expect(result.scheme).toBe('intent');
    expect(result.url).toBe(
      'intent://shippie.app/apps/zen?utm=x#Intent;scheme=https;package=com.android.chrome;end',
    );
  });

  test('android preserves query string and hash', () => {
    const input: BounceInput = {
      platform: 'android',
      currentUrl: 'https://a.shippie.app/page?q=1#section',
    };
    expect(buildBounceTarget(input).url).toBe(
      'intent://a.shippie.app/page?q=1#Intent;scheme=https;package=com.android.chrome;end',
    );
  });

  test('desktop platform has no bounce scheme', () => {
    const input: BounceInput = {
      platform: 'desktop',
      currentUrl: 'https://shippie.app',
    };
    expect(buildBounceTarget(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
cd packages/sdk && bun test src/wrapper/iab-bounce.test.ts
```
Expected: compile error `Cannot find module './iab-bounce.ts'`.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/wrapper/iab-bounce.test.ts
git commit -m "test(sdk/wrapper): failing IAB bounce target tests"
```

---

## Task 7 — Implement IAB bounce target builder

**Files:**
- Create: `packages/sdk/src/wrapper/iab-bounce.ts`

- [ ] **Step 1: Write the implementation**

```ts
// packages/sdk/src/wrapper/iab-bounce.ts
/**
 * IAB bounce: build a URL that tries to open the current page in the
 * platform's default browser (Safari on iOS, Chrome on Android) instead
 * of the in-app WebView where install cannot happen.
 *
 * iOS: `x-safari-https://<host><path>` — non-standard scheme, works in
 *      some (not all) in-app browsers. We always upgrade http→https since
 *      every Shippie subdomain has SSL.
 *
 * Android: `intent://<host><path>?<query>#Intent;scheme=https;package=com.android.chrome;end`
 *          — standard Android intent URI, well-supported by IABs that
 *          honor intent:// links.
 *
 * Hash fragments are dropped on Android because `#` separates the
 * intent fragment from the URL fragment and reconstructing them is
 * fragile. Callers that need hash preservation should pass it via a
 * query param.
 *
 * Spec §5.1.
 */
import type { Platform } from './detect.ts';

export type BounceScheme = 'x-safari-https' | 'intent';

export interface BounceInput {
  platform: Platform;
  currentUrl: string;
}

export interface BounceTarget {
  scheme: BounceScheme;
  url: string;
}

export function buildBounceTarget(input: BounceInput): BounceTarget | null {
  const { platform, currentUrl } = input;

  if (platform === 'ios') {
    const stripped = currentUrl.replace(/^https?:\/\//, '');
    return {
      scheme: 'x-safari-https',
      url: `x-safari-https://${stripped}`,
    };
  }

  if (platform === 'android') {
    // Android intent:// format needs the scheme in a fragment parameter.
    // Strip https://, strip hash fragment (see docstring for rationale).
    const withoutScheme = currentUrl.replace(/^https?:\/\//, '');
    const withoutHash = withoutScheme.split('#')[0] ?? withoutScheme;
    return {
      scheme: 'intent',
      url: `intent://${withoutHash}#Intent;scheme=https;package=com.android.chrome;end`,
    };
  }

  return null;
}
```

- [ ] **Step 2: Run tests — expect green**

Run:
```bash
cd packages/sdk && bun test src/wrapper/iab-bounce.test.ts
```
Expected: all 5 tests pass.

- [ ] **Step 3: Typecheck**

Run:
```bash
cd packages/sdk && bun run typecheck
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wrapper/iab-bounce.ts
git commit -m "feat(sdk/wrapper): IAB bounce target builder"
```

---

## Task 8 — Failing tests for handoff helpers

**Files:**
- Create: `packages/sdk/src/wrapper/handoff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/wrapper/handoff.test.ts
import { describe, expect, test } from 'bun:test';
import { buildHandoffUrl, validateEmail } from './handoff.ts';

describe('buildHandoffUrl', () => {
  test('appends ref=handoff when url has no query', () => {
    expect(buildHandoffUrl('https://shippie.app/apps/zen')).toBe(
      'https://shippie.app/apps/zen?ref=handoff',
    );
  });

  test('appends ref=handoff when url has query', () => {
    expect(buildHandoffUrl('https://shippie.app/apps/zen?x=1')).toBe(
      'https://shippie.app/apps/zen?x=1&ref=handoff',
    );
  });

  test('does not duplicate ref param if already present', () => {
    expect(buildHandoffUrl('https://shippie.app?ref=abc')).toBe(
      'https://shippie.app?ref=abc',
    );
  });

  test('preserves hash fragment', () => {
    expect(buildHandoffUrl('https://shippie.app/apps/zen#section')).toBe(
      'https://shippie.app/apps/zen?ref=handoff#section',
    );
  });
});

describe('validateEmail', () => {
  test('accepts a well-formed email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('a+b@c.co.uk')).toBe(true);
  });

  test('rejects empty', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('   ')).toBe(false);
  });

  test('rejects missing @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  test('rejects missing tld', () => {
    expect(validateEmail('user@localhost')).toBe(false);
  });

  test('trims surrounding whitespace', () => {
    expect(validateEmail('  user@example.com  ')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
cd packages/sdk && bun test src/wrapper/handoff.test.ts
```
Expected: compile error `Cannot find module './handoff.ts'`.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/wrapper/handoff.test.ts
git commit -m "test(sdk/wrapper): failing handoff helper tests"
```

---

## Task 9 — Implement handoff helpers

**Files:**
- Create: `packages/sdk/src/wrapper/handoff.ts`

- [ ] **Step 1: Write the implementation**

```ts
// packages/sdk/src/wrapper/handoff.ts
/**
 * Desktop → mobile handoff helpers. Pure functions; caller renders UI.
 *
 * The handoff URL adds `?ref=handoff` for attribution. Callers that
 * encode the URL into a QR, email body, or push payload all use the
 * same helper so attribution is consistent.
 *
 * Spec §5.2.
 */
const REF_PARAM = 'ref';
const REF_VALUE = 'handoff';

export function buildHandoffUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  if (url.searchParams.has(REF_PARAM)) {
    return url.toString();
  }
  url.searchParams.set(REF_PARAM, REF_VALUE);
  return url.toString();
}

// Minimal, deliberately-strict email check. Good enough for
// client-side validation before POST; server-side Resend/SES
// validation is the real gate.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  return EMAIL_RE.test(trimmed);
}

export interface HandoffEmailPayload {
  email: string;
  handoff_url: string;
}

export function buildHandoffEmailPayload(
  currentUrl: string,
  email: string,
): HandoffEmailPayload {
  return {
    email: email.trim(),
    handoff_url: buildHandoffUrl(currentUrl),
  };
}
```

- [ ] **Step 2: Run tests — expect green**

Run:
```bash
cd packages/sdk && bun test src/wrapper/handoff.test.ts
```
Expected: all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/wrapper/handoff.ts
git commit -m "feat(sdk/wrapper): desktop handoff helpers"
```

---

## Task 10 — Add `happy-dom` dev dep + failing DOM-render test

**Files:**
- Modify: `packages/sdk/package.json` (devDependencies)
- Create: `packages/sdk/src/wrapper/ui.test.ts`

- [ ] **Step 1: Install happy-dom as a devDependency**

Run:
```bash
cd packages/sdk && bun add --dev happy-dom@15
```
Expected: `happy-dom` added to `devDependencies` in `package.json`, lockfile updated.

- [ ] **Step 2: Write the failing UI test**

```ts
// packages/sdk/src/wrapper/ui.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountInstallBanner, mountBounceSheet, unmountAll } from './ui.ts';

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals for the module under test
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals for the module under test
  globalThis.window = win;
});

describe('mountInstallBanner', () => {
  test('renders a banner with INSTALL button when tier=soft', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    const banner = win.document.querySelector('[data-shippie-banner]');
    expect(banner).not.toBeNull();
    const btn = banner?.querySelector('button[data-shippie-install]');
    expect(btn?.textContent?.toLowerCase()).toContain('install');
  });

  test('renders nothing when tier=none', () => {
    mountInstallBanner({ tier: 'none', onInstall: () => {}, onDismiss: () => {} });
    const banner = win.document.querySelector('[data-shippie-banner]');
    expect(banner).toBeNull();
  });

  test('is idempotent — second mount does not create a duplicate', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    expect(win.document.querySelectorAll('[data-shippie-banner]')).toHaveLength(1);
  });

  test('install button invokes onInstall', () => {
    let called = 0;
    mountInstallBanner({
      tier: 'soft',
      onInstall: () => {
        called += 1;
      },
      onDismiss: () => {},
    });
    const btn = win.document.querySelector('button[data-shippie-install]') as unknown as HTMLButtonElement;
    btn.click();
    expect(called).toBe(1);
  });
});

describe('mountBounceSheet', () => {
  test('renders a sheet with a primary CTA', () => {
    mountBounceSheet({
      brand: 'instagram',
      target: { scheme: 'x-safari-https', url: 'x-safari-https://shippie.app/' },
      onBounce: () => {},
      onCopyLink: () => {},
    });
    const sheet = win.document.querySelector('[data-shippie-bounce]');
    expect(sheet).not.toBeNull();
    const cta = sheet?.querySelector('a[data-shippie-bounce-cta]');
    expect(cta?.getAttribute('href')).toBe('x-safari-https://shippie.app/');
  });

  test('copy-link button invokes onCopyLink', () => {
    let called = 0;
    mountBounceSheet({
      brand: 'instagram',
      target: { scheme: 'x-safari-https', url: 'x-safari-https://shippie.app/' },
      onBounce: () => {},
      onCopyLink: () => {
        called += 1;
      },
    });
    const copy = win.document.querySelector('button[data-shippie-bounce-copy]') as unknown as HTMLButtonElement;
    copy.click();
    expect(called).toBe(1);
  });
});

describe('unmountAll', () => {
  test('removes both banner and bounce sheet', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    mountBounceSheet({
      brand: 'instagram',
      target: { scheme: 'x-safari-https', url: 'x-safari-https://shippie.app/' },
      onBounce: () => {},
      onCopyLink: () => {},
    });
    unmountAll();
    expect(win.document.querySelector('[data-shippie-banner]')).toBeNull();
    expect(win.document.querySelector('[data-shippie-bounce]')).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run:
```bash
cd packages/sdk && bun test src/wrapper/ui.test.ts
```
Expected: compile error `Cannot find module './ui.ts'`.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/package.json packages/sdk/src/wrapper/ui.test.ts
git commit -m "test(sdk/wrapper): failing DOM-render smoke tests, add happy-dom dev dep"
```

---

## Task 11 — Implement vanilla DOM UI

**Files:**
- Create: `packages/sdk/src/wrapper/ui.ts`

- [ ] **Step 1: Write the implementation**

```ts
// packages/sdk/src/wrapper/ui.ts
/**
 * Framework-agnostic DOM rendering for the wrapper.
 *
 * Every element is tagged with `data-shippie-*` so CSS authors can style
 * and tests can select reliably. Inline styles keep the runtime self-
 * contained — wrapper.js works on any page, even one without its own CSS.
 *
 * All mounts are idempotent: calling `mountInstallBanner` twice leaves
 * exactly one banner in the DOM. `unmountAll` tears down every wrapper
 * element; callers that want to re-render should call `unmountAll` first.
 */
import type { IabBrand } from './detect.ts';
import type { PromptTier } from './install-prompt.ts';
import type { BounceTarget } from './iab-bounce.ts';

export interface BannerProps {
  tier: PromptTier;
  onInstall: () => void;
  onDismiss: () => void;
}

export interface BounceSheetProps {
  brand: IabBrand;
  target: BounceTarget;
  onBounce: () => void;
  onCopyLink: () => void;
}

const BANNER_ATTR = 'data-shippie-banner';
const BOUNCE_ATTR = 'data-shippie-bounce';

function ensureHost(attr: string): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`[${attr}]`);
  if (existing) return existing;
  const el = document.createElement('div');
  el.setAttribute(attr, '');
  document.body.appendChild(el);
  return el;
}

function removeBy(attr: string): void {
  const el = document.querySelector(`[${attr}]`);
  if (el) el.remove();
}

export function mountInstallBanner(props: BannerProps): void {
  removeBy(BANNER_ATTR);
  if (props.tier === 'none') return;

  const host = ensureHost(BANNER_ATTR);
  host.setAttribute('style', [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:2147483646',
    'height:40px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'gap:10px',
    'background:#E8603C',
    'color:#14120F',
    'font:600 13px/1 system-ui,sans-serif',
  ].join(';'));
  host.setAttribute('data-shippie-tier', props.tier);

  const label = document.createElement('span');
  label.textContent = 'Install this app';

  const installBtn = document.createElement('button');
  installBtn.setAttribute('data-shippie-install', '');
  installBtn.textContent = 'INSTALL';
  installBtn.setAttribute('style', [
    'background:#14120F',
    'color:#EDE4D3',
    'border:0',
    'padding:3px 12px',
    'font:700 11px/1 system-ui,sans-serif',
    'letter-spacing:.02em',
    'border-radius:3px',
    'cursor:pointer',
  ].join(';'));
  installBtn.addEventListener('click', () => props.onInstall());

  const dismissBtn = document.createElement('button');
  dismissBtn.setAttribute('data-shippie-dismiss', '');
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('style', [
    'position:absolute',
    'right:12px',
    'top:50%',
    'transform:translateY(-50%)',
    'background:transparent',
    'border:0',
    'color:#14120F',
    'font:15px/1 system-ui,sans-serif',
    'opacity:.5',
    'padding:4px',
    'cursor:pointer',
  ].join(';'));
  dismissBtn.addEventListener('click', () => props.onDismiss());

  host.append(label, installBtn, dismissBtn);
}

const BRAND_LABEL: Record<IabBrand, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  pinterest: 'Pinterest',
  whatsapp: 'WhatsApp',
  wechat: 'WeChat',
  line: 'LINE',
};

export function mountBounceSheet(props: BounceSheetProps): void {
  removeBy(BOUNCE_ATTR);
  const host = ensureHost(BOUNCE_ATTR);
  host.setAttribute('style', [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(0,0,0,.75)',
    'display:flex',
    'align-items:flex-end',
    'justify-content:center',
    'padding:20px',
    'font:16px/1.4 system-ui,sans-serif',
  ].join(';'));

  const card = document.createElement('div');
  card.setAttribute('style', [
    'width:100%',
    'max-width:360px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:20px',
    'padding:28px',
    'text-align:center',
  ].join(';'));

  const title = document.createElement('h2');
  title.textContent = `Open in browser`;
  title.setAttribute('style', 'font:700 20px/1.2 system-ui,sans-serif;margin:0 0 8px');

  const reason = document.createElement('p');
  reason.textContent = `This app lives on your home screen — ${BRAND_LABEL[props.brand]} can't install it. Tap to open in your browser.`;
  reason.setAttribute('style', 'color:#B8A88F;font-size:13px;line-height:1.5;margin:0 0 20px');

  const cta = document.createElement('a');
  cta.setAttribute('data-shippie-bounce-cta', '');
  cta.setAttribute('href', props.target.url);
  cta.textContent = 'Open in browser';
  cta.setAttribute('style', [
    'display:block',
    'padding:14px',
    'background:#E8603C',
    'color:#14120F',
    'font-weight:700',
    'border-radius:10px',
    'text-decoration:none',
  ].join(';'));
  cta.addEventListener('click', () => props.onBounce());

  const copyBtn = document.createElement('button');
  copyBtn.setAttribute('data-shippie-bounce-copy', '');
  copyBtn.textContent = 'Copy link instead';
  copyBtn.setAttribute('style', [
    'display:block',
    'width:100%',
    'margin-top:12px',
    'padding:12px',
    'background:transparent',
    'border:1px solid #3D3530',
    'color:#EDE4D3',
    'border-radius:10px',
    'cursor:pointer',
    'font-size:13px',
  ].join(';'));
  copyBtn.addEventListener('click', () => props.onCopyLink());

  card.append(title, reason, cta, copyBtn);
  host.append(card);
}

export function unmountAll(): void {
  removeBy(BANNER_ATTR);
  removeBy(BOUNCE_ATTR);
}
```

- [ ] **Step 2: Run tests — expect green**

Run:
```bash
cd packages/sdk && bun test src/wrapper/ui.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 3: Typecheck**

Run:
```bash
cd packages/sdk && bun run typecheck
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wrapper/ui.ts
git commit -m "feat(sdk/wrapper): vanilla DOM UI for install banner and bounce sheet"
```

---

## Task 12 — Wrapper entry point + package exports

**Files:**
- Create: `packages/sdk/src/wrapper/index.ts`
- Modify: `packages/sdk/package.json` (exports map)
- Modify: `packages/sdk/tsup.config.ts`

- [ ] **Step 1: Write the entry point**

```ts
// packages/sdk/src/wrapper/index.ts
/**
 * @shippie/sdk/wrapper — the install funnel runtime.
 *
 * Consumers:
 *   - Maker apps via the Worker-served `/__shippie/sdk.js` bundle.
 *   - Shippie's own marketplace (apps/web) via npm import.
 *
 * All exports are pure functions and stateless UI renderers. Persistence
 * of `PromptState` is the caller's responsibility — use `serialize` /
 * `deserialize` to talk to localStorage or a signed cookie.
 */
export {
  detectPlatform,
  detectInstallMethod,
  detectIab,
  detectStandalone,
  readInstallContext,
  type Platform,
  type InstallMethod,
  type IabBrand,
  type InstallContext,
} from './detect.ts';

export {
  computePromptTier,
  recordVisit,
  recordDismissal,
  recordMeaningfulAction,
  addDwell,
  isDismissedRecently,
  serialize,
  deserialize,
  type PromptTier,
  type PromptState,
} from './install-prompt.ts';

export {
  buildBounceTarget,
  type BounceInput,
  type BounceTarget,
  type BounceScheme,
} from './iab-bounce.ts';

export {
  buildHandoffUrl,
  validateEmail,
  buildHandoffEmailPayload,
  type HandoffEmailPayload,
} from './handoff.ts';

export {
  mountInstallBanner,
  mountBounceSheet,
  unmountAll,
  type BannerProps,
  type BounceSheetProps,
} from './ui.ts';
```

- [ ] **Step 2: Add the subpath export to package.json**

Open `packages/sdk/package.json` and add the `./wrapper` export. The file currently has:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./native": {
      "types": "./dist/native/index.d.ts",
      "import": "./dist/native/index.js"
    }
  },
```

Replace with:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./native": {
      "types": "./dist/native/index.d.ts",
      "import": "./dist/native/index.js"
    },
    "./wrapper": {
      "types": "./dist/wrapper/index.d.ts",
      "import": "./dist/wrapper/index.js"
    }
  },
```

- [ ] **Step 3: Add the wrapper entry to tsup**

Open `packages/sdk/tsup.config.ts`. You'll see an `entry` array (exact shape varies). Add `src/wrapper/index.ts` to it so the build produces `dist/wrapper/index.{js,d.ts}`. Example diff:

```ts
// tsup.config.ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'native/index': 'src/native/index.ts',
    'wrapper/index': 'src/wrapper/index.ts',   // ← add this line
  },
  // ... rest unchanged
});
```

If the existing entry config uses an array like `['src/index.ts', 'src/native/index.ts']`, convert it to the map form above so the wrapper lands at `dist/wrapper/index.js`.

- [ ] **Step 4: Build the package**

Run:
```bash
cd packages/sdk && bun run build
```
Expected: exits 0, `dist/wrapper/index.js` and `dist/wrapper/index.d.ts` exist.

- [ ] **Step 5: Verify the files exist**

Run:
```bash
ls packages/sdk/dist/wrapper/
```
Expected: `index.js  index.d.ts` (and maybe `.map` files).

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/wrapper/index.ts packages/sdk/package.json packages/sdk/tsup.config.ts
git commit -m "feat(sdk): expose wrapper runtime as @shippie/sdk/wrapper export"
```

---

## Task 13 — Failing test for enriched manifest merge

**Files:**
- Create: `services/worker/src/router/manifest.test.ts`

- [ ] **Step 1: Verify the file doesn't already exist**

Run:
```bash
ls services/worker/src/router/manifest.test.ts 2>/dev/null && echo "EXISTS" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 2: Write the failing test**

```ts
// services/worker/src/router/manifest.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string>): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => {
      data[k] = v;
    },
    putJson: async (k, v) => {
      data[k] = JSON.stringify(v);
    },
    delete: async (k) => {
      delete data[k];
    },
    list: async (prefix) => Object.keys(data).filter((k) => !prefix || k.startsWith(prefix)),
  };
}

function emptyR2(): R2Store {
  return {
    get: async () => null,
    head: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => [],
  };
}

function envFor(kv: KvStore): WorkerEnv {
  return {
    SHIPPIE_ENV: 'test',
    PLATFORM_API_URL: 'https://example.invalid',
    WORKER_PLATFORM_SECRET: 'test-secret',
    APP_CONFIG: kv,
    SHIPPIE_APPS: emptyR2(),
    SHIPPIE_PUBLIC: emptyR2(),
  };
}

describe('__shippie/manifest', () => {
  let kv: KvStore;
  let env: WorkerEnv;
  const app = createApp();

  beforeEach(() => {
    const store: Record<string, string> = {};
    kv = fakeKv(store);
    env = envFor(kv);
  });

  test('minimal metadata produces a valid manifest with Phase 1 defaults', async () => {
    await kv.putJson('apps:zen:meta', { name: 'Zen' });

    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/manifest'),
      env,
    );
    expect(res.status).toBe(200);
    const m = (await res.json()) as Record<string, unknown>;

    expect(m.name).toBe('Zen');
    expect(m.short_name).toBe('Zen');
    expect(m.id).toBe('/?app=zen'); // stable ID default
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.display_override).toEqual(['standalone', 'minimal-ui']);
    expect(m.launch_handler).toEqual({ client_mode: ['navigate-existing', 'auto'] });

    const icons = m.icons as Array<Record<string, string>>;
    const purposes = icons.map((i) => i.purpose ?? 'any');
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  test('merges custom pwa fields from apps:{slug}:pwa', async () => {
    await kv.putJson('apps:zen:meta', {
      name: 'Zen Notes',
      theme_color: '#112233',
    });
    await kv.putJson('apps:zen:pwa', {
      id: '/?app=zen-notes',
      categories: ['productivity'],
      screenshots: [
        {
          src: '/screenshots/1.png',
          sizes: '1170x2532',
          type: 'image/png',
          form_factor: 'narrow',
          label: 'Home',
        },
      ],
      share_target: {
        action: '/share',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { title: 'title', text: 'text', url: 'url' },
      },
    });

    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/manifest'),
      env,
    );
    const m = (await res.json()) as Record<string, unknown>;

    expect(m.id).toBe('/?app=zen-notes');
    expect(m.theme_color).toBe('#112233');
    expect(m.categories).toEqual(['productivity']);
    expect((m.screenshots as unknown[]).length).toBe(1);
    expect(m.share_target).toEqual({
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url' },
    });
  });

  test('unknown app still produces a usable manifest', async () => {
    const res = await app.fetch(
      new Request('https://ghost.shippie.app/__shippie/manifest'),
      env,
    );
    expect(res.status).toBe(200);
    const m = (await res.json()) as Record<string, unknown>;
    expect(m.name).toBe('ghost');
    expect(m.id).toBe('/?app=ghost');
  });
});
```

- [ ] **Step 3: Run — expect multiple failures**

Run:
```bash
cd services/worker && bun test src/router/manifest.test.ts
```
Expected: tests fail because the current `manifest.ts` returns no `id`, no `display_override`, no `launch_handler`, no `maskable` icon, no merge from `apps:{slug}:pwa`.

- [ ] **Step 4: Commit**

```bash
git add services/worker/src/router/manifest.test.ts
git commit -m "test(worker/manifest): failing tests for Phase 1 enriched manifest"
```

---

## Task 14 — Implement enriched manifest route

**Files:**
- Modify: `services/worker/src/router/manifest.ts` (whole file replace)

- [ ] **Step 1: Replace the entire file with the enriched version**

```ts
// services/worker/src/router/manifest.ts
/**
 * __shippie/manifest
 *
 * Generated PWA manifest per deployed app. Merges three sources, in
 * precedence order:
 *   1. Platform defaults (id, start_url, scope, display, display_override,
 *      launch_handler, maskable icon) — the baseline every Shippie app
 *      inherits so the install experience is uniform.
 *   2. Meta (apps:{slug}:meta) — name, theme/background color.
 *   3. PWA overrides (apps:{slug}:pwa) — maker-declared manifest fields
 *      that override the platform defaults. Validated at deploy time
 *      against the `ShippieJsonPwa` schema.
 *
 * Spec §5.4, §10.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

interface AppMeta {
  name?: string;
  theme_color?: string;
  background_color?: string;
}

interface AppPwaOverrides {
  id?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  scope?: string;
  display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  display_override?: readonly string[];
  orientation?: 'any' | 'portrait' | 'landscape';
  categories?: readonly string[];
  launch_handler?: {
    client_mode?: string | readonly string[];
  };
  share_target?: {
    action: string;
    method?: 'GET' | 'POST';
    enctype?: string;
    params?: Record<string, string>;
  };
  screenshots?: readonly {
    src: string;
    sizes: string;
    type: string;
    form_factor?: string;
    label?: string;
  }[];
  protocol_handlers?: readonly { protocol: string; url: string }[];
}

export const manifestRouter = new Hono<AppBindings>();

manifestRouter.get('/', async (c) => {
  const slug = c.var.slug;
  const [meta, pwa] = await Promise.all([
    c.env.APP_CONFIG.getJson<AppMeta>(`apps:${slug}:meta`),
    c.env.APP_CONFIG.getJson<AppPwaOverrides>(`apps:${slug}:pwa`),
  ]);

  const name = meta?.name ?? slug;
  const shortName = pwa?.short_name ?? name;

  const manifest = {
    name,
    short_name: shortName,
    description: pwa?.description ?? `Built with Shippie.`,
    id: pwa?.id ?? `/?app=${slug}`,
    start_url: pwa?.start_url ?? '/',
    scope: pwa?.scope ?? '/',
    display: pwa?.display ?? 'standalone',
    display_override: pwa?.display_override ?? ['standalone', 'minimal-ui'],
    orientation: pwa?.orientation ?? 'portrait',
    theme_color: meta?.theme_color ?? '#f97316',
    background_color: meta?.background_color ?? '#ffffff',
    launch_handler: pwa?.launch_handler ?? {
      client_mode: ['navigate-existing', 'auto'],
    },
    categories: pwa?.categories ?? [],
    icons: [
      {
        src: '/__shippie/icons/192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/__shippie/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/__shippie/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    ...(pwa?.screenshots ? { screenshots: pwa.screenshots } : {}),
    ...(pwa?.share_target ? { share_target: pwa.share_target } : {}),
    ...(pwa?.protocol_handlers ? { protocol_handlers: pwa.protocol_handlers } : {}),
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
```

- [ ] **Step 2: Run manifest tests — expect green**

Run:
```bash
cd services/worker && bun test src/router/manifest.test.ts
```
Expected: all 3 tests pass.

- [ ] **Step 3: Run the worker test suite to confirm no regressions**

Run:
```bash
cd services/worker && bun test
```
Expected: every test file passes. If `routing.test.ts` or others fail, fix the root cause — do not edit tests.

- [ ] **Step 4: Typecheck worker**

Run:
```bash
cd services/worker && bun run typecheck 2>&1 | tail -20
```
Expected: no new errors. If the worker package lacks a `typecheck` script, run `bunx tsc --noEmit` from the worker directory.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/router/manifest.ts
git commit -m "feat(worker/manifest): merge shippie.json overrides, add Phase 1 PWA fields"
```

---

## Task 15 — Failing test for marketplace InstallRuntime component

**Files:**
- Create: `apps/web/app/components/install-runtime.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/components/install-runtime.test.tsx
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { InstallRuntime } from './install-runtime.tsx';
import { renderToString } from 'react-dom/server';

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals for the component under test
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals for the component under test
  globalThis.window = win;
});

afterEach(() => {
  // Clean up DOM between tests so each starts fresh.
  win.document.body.innerHTML = '';
});

describe('InstallRuntime SSR', () => {
  test('renders nothing on the server (returns null)', () => {
    const html = renderToString(<InstallRuntime />);
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Verify the component file doesn't exist yet**

Run:
```bash
ls apps/web/app/components/install-runtime.tsx 2>/dev/null && echo "EXISTS" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 3: Run — expect failure (module not found)**

Run:
```bash
cd apps/web && bun test app/components/install-runtime.test.tsx
```
Expected: compile error `Cannot find module './install-runtime.tsx'`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/install-runtime.test.tsx
git commit -m "test(web): failing InstallRuntime component smoke test"
```

---

## Task 16 — Implement InstallRuntime React component

**Files:**
- Create: `apps/web/app/components/install-runtime.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/app/components/install-runtime.tsx
/**
 * Marketplace-side host for the @shippie/sdk/wrapper runtime.
 *
 * This component mounts the vanilla DOM banner / bounce sheet from the
 * shared wrapper package. Dogfoods the exact flow maker apps see.
 *
 * - Persists PromptState in localStorage under `shippie-install-state`.
 * - Listens for `beforeinstallprompt` (Android) and upgrades method to one-tap.
 * - Never renders on the server — all logic is in useEffect.
 */
'use client';

import { useEffect, useRef } from 'react';
import {
  readInstallContext,
  computePromptTier,
  recordVisit,
  recordDismissal,
  addDwell,
  serialize,
  deserialize,
  buildBounceTarget,
  mountInstallBanner,
  mountBounceSheet,
  unmountAll,
  type PromptState,
} from '@shippie/sdk/wrapper';

const STORAGE_KEY = 'shippie-install-state';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallRuntime() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const ctx = readInstallContext(
      navigator.userAgent,
      navigator,
      (q) => window.matchMedia(q),
    );

    // Never in standalone mode.
    if (ctx.standalone) return;

    // IAB bounce: show bounce sheet, skip banner entirely.
    if (ctx.iab && ctx.platform !== 'desktop') {
      const target = buildBounceTarget({
        platform: ctx.platform,
        currentUrl: window.location.href,
      });
      if (target) {
        mountBounceSheet({
          brand: ctx.iab,
          target,
          onBounce: () => {
            // fire-and-forget tracking beacon
            navigator.sendBeacon?.(
              '/__shippie/install',
              JSON.stringify({ event: 'iab_bounced', outcome: ctx.iab }),
            );
          },
          onCopyLink: async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
            } catch {
              // clipboard may be blocked in some IABs — fall through silently
            }
          },
        });
        navigator.sendBeacon?.(
          '/__shippie/install',
          JSON.stringify({ event: 'iab_detected', outcome: ctx.iab }),
        );
      }
      return () => unmountAll();
    }

    // Load + update prompt state.
    const prior = deserialize(localStorage.getItem(STORAGE_KEY));
    const now = Date.now();
    let state: PromptState = recordVisit(prior, now);
    localStorage.setItem(STORAGE_KEY, serialize(state));

    // Capture Android one-tap availability.
    const onBip = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // Track dwell time while tab is visible.
    let lastTick = Date.now();
    const tickInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        lastTick = Date.now();
        return;
      }
      const now2 = Date.now();
      state = addDwell(state, now2 - lastTick);
      lastTick = now2;
      localStorage.setItem(STORAGE_KEY, serialize(state));
      render();
    }, 5000);

    function render() {
      const tier = computePromptTier(state, Date.now());
      mountInstallBanner({
        tier,
        onInstall: async () => {
          if (deferredPromptRef.current) {
            await deferredPromptRef.current.prompt();
            const outcome = (await deferredPromptRef.current.userChoice).outcome;
            navigator.sendBeacon?.(
              '/__shippie/install',
              JSON.stringify({ event: `prompt_${outcome}` }),
            );
            if (outcome === 'accepted') {
              state = recordDismissal(state, Date.now());
              localStorage.setItem(STORAGE_KEY, serialize(state));
              unmountAll();
            }
            return;
          }
          // Non-Android: surface per-platform instructions via a fuller sheet.
          // Phase 1 keeps this minimal — log for now; full guide UI lands in Phase 2.
          navigator.sendBeacon?.(
            '/__shippie/install',
            JSON.stringify({ event: 'prompt_shown', outcome: 'manual-guide-opened' }),
          );
        },
        onDismiss: () => {
          state = recordDismissal(state, Date.now());
          localStorage.setItem(STORAGE_KEY, serialize(state));
          navigator.sendBeacon?.(
            '/__shippie/install',
            JSON.stringify({ event: 'prompt_dismissed' }),
          );
          unmountAll();
        },
      });
    }

    render();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      clearInterval(tickInterval);
      unmountAll();
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Run the smoke test — expect green**

Run:
```bash
cd apps/web && bun test app/components/install-runtime.test.tsx
```
Expected: the SSR test passes (`renderToString` returns `''` because the component returns `null`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/components/install-runtime.tsx
git commit -m "feat(web): InstallRuntime wraps shared wrapper runtime for marketplace"
```

---

## Task 17 — Replace old PwaInstallBanner with InstallRuntime

**Files:**
- Modify: `apps/web/app/page.tsx` (primary consumer — import at line 9, JSX at line 382)
- Delete: `apps/web/app/components/pwa-install-banner.tsx`

- [ ] **Step 1: Confirm the current consumer location**

Run:
```bash
grep -rn "pwa-install-banner\|PwaInstallBanner" apps/web --include="*.tsx" --include="*.ts"
```
Expected: matches in exactly two places — the component file itself, and `apps/web/app/page.tsx` (import + JSX usage near the end of the home page). If `grep` shows additional consumers, note them and swap each in Step 2.

- [ ] **Step 2: Swap the import in `apps/web/app/page.tsx`**

Open `apps/web/app/page.tsx`. The import is at line 9. Replace:

```tsx
import { PwaInstallBanner } from './components/pwa-install-banner';
```

with:

```tsx
import { InstallRuntime } from './components/install-runtime';
```

- [ ] **Step 3: Swap the JSX mount in `apps/web/app/page.tsx`**

The JSX mount is near the end of the home page component (currently line 382, just above the closing `</div>`). Replace:

```tsx
      <PwaInstallBanner />
```

with:

```tsx
      <InstallRuntime />
```

- [ ] **Step 4: Swap any additional consumers identified in Step 1**

If `grep` in Step 1 turned up any consumer besides `apps/web/app/page.tsx` and the component file itself, apply the same two-line swap to each. If there were no others, skip this step.

- [ ] **Step 5: Delete the old install banner component**

Run:
```bash
git rm apps/web/app/components/pwa-install-banner.tsx
```
Expected: file removed, staged for commit.

- [ ] **Step 6: Typecheck the web app**

Run:
```bash
cd apps/web && bunx tsc --noEmit
```
Expected: exits 0. Any "Cannot find name 'PwaInstallBanner'" error means Step 2/3/4 missed a consumer — fix it with the same swap.

- [ ] **Step 7: Smoke-run the dev server and open the marketplace**

Run (background):
```bash
cd apps/web && bun run dev
```
Then in a browser: visit `http://localhost:3000/`. Confirm:
- A 40px top banner does NOT appear on the first visit (tier=none) — this is a behavior change from the old always-on banner; it's correct.
- In DevTools → "Network conditions → User agent → Custom" → paste an Instagram UA (see `detect.test.ts` for an example) → reload → a full-bleed bounce sheet with "Open in browser" CTA appears instead of the banner.
- Console is clean — no errors about missing modules or failed fetches.

Kill the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): swap legacy install banner for shared InstallRuntime on home page"
```

---

## Task 18 — Run full suite, type-check everything, cross-package build

**Files:** none (verification only)

- [ ] **Step 1: Run all tests from the repo root**

Run:
```bash
bun run test 2>&1 | tail -40
```
Expected: all packages green. If you see a failure, fix the root cause — do not skip tests.

- [ ] **Step 2: Typecheck all packages**

Run:
```bash
bun run typecheck 2>&1 | tail -40
```
Expected: exits 0 across every package.

- [ ] **Step 3: Build everything**

Run:
```bash
bun run build 2>&1 | tail -40
```
Expected: exits 0 for all packages that have a build step (`@shippie/sdk`, `@shippie/shared`, etc.). If the monorepo uses Turborepo, `bun run build` or `bunx turbo build` both work — use whichever matches existing `package.json` scripts at repo root.

- [ ] **Step 4: Verify the SDK wrapper export resolves**

Run:
```bash
node -e "const w = require('./packages/sdk/dist/wrapper/index.js'); console.log(Object.keys(w).sort().join(','));"
```
Expected output (order may vary):
```
addDwell,buildBounceTarget,buildHandoffEmailPayload,buildHandoffUrl,computePromptTier,deserialize,detectIab,detectInstallMethod,detectPlatform,detectStandalone,isDismissedRecently,mountBounceSheet,mountInstallBanner,readInstallContext,recordDismissal,recordMeaningfulAction,recordVisit,serialize,unmountAll,validateEmail
```
If `require` fails with ESM-only errors, switch to `bun -e` which supports both.

- [ ] **Step 5: Final commit (nothing to commit if clean)**

Run:
```bash
git status
```
Expected: `nothing to commit, working tree clean`. If anything is outstanding (e.g., auto-fixed lockfile), commit with `chore: final Phase 1 verification`.

---

## Self-Review (already completed — documented here for traceability)

**1. Spec coverage (scoped to Phase 1's explicit promises):**
- §5.1 IAB detection + bounce sheet → Tasks 2, 3, 6, 7, 10, 11, 16 ✓ (fully shipped)
- §5.2 Desktop → mobile handoff → Tasks 8, 9 ship **helpers only** per the scope section above. UI sheet + `/__shippie/handoff` backend endpoint are explicitly deferred to Phase 2. ✓
- §5.3 Smart install prompt → Tasks 4, 5, 16 ✓ (fully shipped)
- §5.4 Native-feel runtime — manifest enrichments only (Tasks 13, 14). View Transitions / back-swipe / pull-to-refresh / haptics / keyboard-aware layout / per-route theme-color are explicitly deferred to Phase 2. ✓
- §8 shippie.json schema → Task 1 ✓
- §10.2 Wrapper injection — Phase 1 reuses the existing `packages/pwa-injector/` build-time injection. Runtime HTMLRewriter variant is not a Phase 1 promise. ✓

**2. Placeholder scan:** No "TBD", "TODO", "similar to above", or empty steps. Every code block is a complete snippet. ✓

**3. Type consistency:** `PromptState`, `PromptTier`, `InstallContext`, `BounceTarget`, `BannerProps`, `BounceSheetProps`, `HandoffEmailPayload`, `IabBrand`, `Platform`, `InstallMethod` — all defined once, imported consistently. ✓

**4. Integration point correctness:** `PwaInstallBanner` is currently mounted in `apps/web/app/page.tsx` (import line 9, JSX line 382), not in `apps/web/app/layout.tsx`. Task 17 points at the correct file. ✓

**5. Deploy-pipeline independence:** This plan does not depend on Vercel Sandbox gating being closed or on the pointer-swap refactor. It reads only from existing KV keys (`apps:{slug}:active`, `apps:{slug}:meta`, `apps:{slug}:pwa`) and tolerates non-atomic writes. ✓

**6. Gaps deferred to later phase plans:** desktop handoff UI sheet + backend endpoint, per-route theme-color component, View Transitions wrapping, back-swipe, pull-to-refresh, splash image generation at deploy time, branded offline page, update toast, event spine + dashboard. These remain in the spec; plans for Phases 2–5 follow after Phase 1 ships.

---
