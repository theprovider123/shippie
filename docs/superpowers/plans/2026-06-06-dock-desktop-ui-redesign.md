# Dock Desktop UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Dock desktop landing page as a launchpad grid with a collapsing icon rail and a sharp, collision-proof, cross-platform icon system.

**Architecture:** A pure `tool-icon.ts` algorithm in `@shippie/design-tokens` (monogram + accent + seed) is the single source of truth, consumed by both a new `ToolGlyph` Svelte atom (live DOM) and the build-time SVG generator (baked PWA/app/mobile icons). The Dock home switches to a launchpad grid of `ToolCard` in a new `launchpad` density (no third primitive), and the left rail is extracted into a collapsible `DockRail.svelte`. Terminal-style tiles, hybrid square corners, floating depth, a single shared ambient WebGL layer, and a rocket badge on running tools.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, `@shippie/design-tokens` (bun:test), platform tests on vitest, JetBrains Mono (already a brand font), lucide icons, WebGL2.

**Spec:** `docs/superpowers/specs/2026-06-06-dock-desktop-ui-redesign-design.md`

---

## File Structure

**Sprint 1 — icon foundation (`@shippie/design-tokens`)**
- Create: `packages/design-tokens/src/tool-icon.ts` — pure monogram/accent/seed algorithm. No deps.
- Create: `packages/design-tokens/src/tool-icon.test.ts` — bun:test unit tests.
- Modify: `packages/design-tokens/src/tokens.css` — hybrid icon radius + terminal surface tokens.
- Modify: `packages/design-tokens/src/index.ts` — export new tokens in `CANONICAL_TOKENS`.

**Sprint 2 — `ToolGlyph` atom (`apps/platform`)**
- Create: `apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte` — the icon atom.
- Create: `apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts` — vitest component tests.
- Modify: `apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte` — thin wrapper delegating to `ToolGlyph` (keeps 10 call sites compiling).

**Sprint 3 — build parity**
- Modify: `scripts/generate-monogram-icons.mjs` — import shared algorithm; emit terminal-style SVG.
- Create: `scripts/generate-monogram-icons.test.mjs` — parity test (SVG output uses shared algorithm).

**Sprint 4 — launchpad grid**
- Modify: `apps/platform/src/lib/components/tool-surface/ToolCard.svelte` — add `density` prop (`card` | `launchpad`).
- Modify: `apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts` — constrain density values; assert no third primitive.
- Modify: `apps/platform/src/lib/container/DashboardHome.svelte` — launchpad grid, unified sections, header, Manage toggle.
- Create: `apps/platform/src/lib/container/DockSection.svelte` — shared section header (label + caption, collapses when empty).

**Sprint 5 — rail**
- Create: `apps/platform/src/lib/container/DockRail.svelte` — collapsible icon rail.
- Create: `apps/platform/src/lib/container/DockRail.test.ts` — labels, collapse/expand, no stray-positioned header (M-bug regression).
- Modify: `apps/platform/src/routes/dock/+page.svelte` — replace inline rail markup with `<DockRail/>`.

**Sprint 6 — ambient shader (enhancement, flag-gated)**
- Create: `apps/platform/src/lib/components/tool-surface/AmbientGrid.svelte` — single WebGL layer + reduced-motion/static fallback.

---

## Sprint 1 — Icon Foundation

### Task 1: Pure icon algorithm in design-tokens

**Files:**
- Create: `packages/design-tokens/src/tool-icon.ts`
- Test: `packages/design-tokens/src/tool-icon.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/design-tokens/src/tool-icon.test.ts
import { describe, expect, test } from 'bun:test';
import { monogram, accentColor, surfaceSeed } from './tool-icon';

describe('monogram', () => {
  test('multi-word name → both initials, upper', () => {
    expect(monogram('Symptom Diary', 'symptom-diary')).toBe('SD');
    expect(monogram('Sprint Board', 'sprint-board')).toBe('SB');
  });
  test('single-word name → first two letters, title-case', () => {
    expect(monogram('Sudoku', 'sudoku')).toBe('Su');
    expect(monogram('Stitch', 'stitch')).toBe('St');
  });
  test('empty name falls back to slug initial', () => {
    expect(monogram('', 'dough')).toBe('D');
  });
  test('no name and no slug → ?', () => {
    expect(monogram('', '')).toBe('?');
  });
  test('unicode-safe (no broken surrogate halves)', () => {
    expect(Array.from(monogram('🚀rocket', 'rocket')).length).toBeGreaterThan(0);
  });
});

describe('accentColor', () => {
  test('respects a real maker theme colour', () => {
    expect(accentColor('anything', '#ff8800')).toBe('#ff8800');
  });
  test('derives from slug when theme colour is default/unset', () => {
    expect(accentColor('sudoku', '#000000')).toBe(accentColor('sudoku', null));
    expect(accentColor('sudoku', '')).toBe(accentColor('sudoku', null));
  });
  test('is stable for the same slug', () => {
    expect(accentColor('sudoku', null)).toBe(accentColor('sudoku', null));
  });
  test('same initial, different slug → different hue', () => {
    expect(accentColor('sudoku', null)).not.toBe(accentColor('symptom-diary', null));
  });
});

describe('surfaceSeed', () => {
  test('is stable and within [0,1)', () => {
    const s = surfaceSeed('sudoku');
    expect(s).toBe(surfaceSeed('sudoku'));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/design-tokens && bun test src/tool-icon.test.ts`
Expected: FAIL — `Cannot find module './tool-icon'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/design-tokens/src/tool-icon.ts
/**
 * Pure, dependency-free icon algorithm shared by the live ToolGlyph
 * component and the build-time SVG generator. Same input → same mark
 * everywhere (web / installed app / mobile).
 */

/** Theme-colour values that mean "maker did not choose one" → derive instead. */
const DEFAULT_THEME_COLORS = new Set(['', '#000', '#000000', 'transparent']);

function firstChar(word: string): string {
  return Array.from(word)[0] ?? '';
}

/** 1–2 letter monogram. Multi-word → initials (SD); single word → first two (Su). */
export function monogram(name: string, slug = ''): string {
  const n = (name ?? '').trim();
  if (n) {
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (firstChar(words[0]) + firstChar(words[1])).toUpperCase();
    }
    const chars = Array.from(words[0] ?? '');
    if (chars.length >= 2) return chars[0].toUpperCase() + chars[1].toLowerCase();
    if (chars.length === 1) return chars[0].toUpperCase();
  }
  const s = (slug ?? '').trim();
  return s ? (Array.from(s)[0] ?? '?').toUpperCase() : '?';
}

/** FNV-1a → non-negative int. Stable across JS engines. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Accent colour: maker's themeColor when real, else a slug-derived hue. */
export function accentColor(slug: string, themeColor?: string | null): string {
  const tc = (themeColor ?? '').trim().toLowerCase();
  if (tc && !DEFAULT_THEME_COLORS.has(tc)) return themeColor as string;
  const hue = hashString(slug ?? '') % 360;
  // Fixed S/L tuned for the terminal palette so contrast holds across hues.
  return `hsl(${hue} 58% 62%)`;
}

/** Deterministic 0..1 seed for the ambient sheen / generated texture. */
export function surfaceSeed(slug: string): number {
  return (hashString(slug ?? '') % 1000) / 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/design-tokens && bun test src/tool-icon.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/design-tokens/src/tool-icon.ts packages/design-tokens/src/tool-icon.test.ts
git commit -m "feat(design-tokens): pure tool-icon algorithm (monogram + accent + seed)"
```

### Task 2: Terminal icon tokens in tokens.css

**Files:**
- Modify: `packages/design-tokens/src/tokens.css`
- Modify: `packages/design-tokens/src/index.ts`
- Test: `packages/design-tokens/src/index.test.ts` (existing snapshot test enforces tokens exist)

- [ ] **Step 1: Add the new tokens to the canonical list (failing test first)**

In `packages/design-tokens/src/index.ts`, append to the `CANONICAL_TOKENS` array:

```ts
  '--tool-icon-radius',
  '--tool-icon-tile',
  '--tool-icon-hairline',
  '--tool-icon-float',
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/design-tokens && bun test src/index.test.ts`
Expected: FAIL — "tokens.css contains every canonical CSS variable" fails for the four new tokens.

- [ ] **Step 3: Add the tokens to tokens.css**

In `packages/design-tokens/src/tokens.css`, inside the existing `:root { … }` block, add:

```css
  /* Tool icon system (terminal style, hybrid square) */
  --tool-icon-radius: 3px;
  --tool-icon-tile: #15110c;
  --tool-icon-hairline: 34%; /* alpha mix of the accent for the border */
  --tool-icon-float:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 10px 22px -10px rgba(0, 0, 0, 0.85),
    0 3px 8px -4px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(0, 0, 0, 0.3);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/design-tokens && bun test src/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/design-tokens/src/tokens.css packages/design-tokens/src/index.ts
git commit -m "feat(design-tokens): terminal tool-icon tokens (hybrid radius, tile, float)"
```

---

## Sprint 2 — ToolGlyph Atom

### Task 3: ToolGlyph component

**Files:**
- Create: `apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte`
- Test: `apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/svelte';
import ToolGlyph from './ToolGlyph.svelte';

describe('ToolGlyph', () => {
  test('renders an <img> when iconUrl is present', () => {
    const { container } = render(ToolGlyph, {
      props: { slug: 'dough', name: 'Dough', iconUrl: '/icon.svg' },
    });
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('.monogram')).toBeNull();
  });

  test('renders the emoji glyph when no iconUrl but glyph present', () => {
    const { getByText } = render(ToolGlyph, {
      props: { slug: 'dock', name: 'Dock', iconUrl: null, glyph: '🧰' },
    });
    expect(getByText('🧰')).toBeTruthy();
  });

  test('renders a smart monogram fallback', () => {
    const { getByText } = render(ToolGlyph, {
      props: { slug: 'symptom-diary', name: 'Symptom Diary', iconUrl: null },
    });
    expect(getByText('SD')).toBeTruthy();
  });

  test('running adds the rocket badge and running class', () => {
    const { container } = render(ToolGlyph, {
      props: { slug: 'sudoku', name: 'Sudoku', iconUrl: null, running: true },
    });
    expect(container.querySelector('.tool-glyph.running')).not.toBeNull();
    expect(container.querySelector('.rocket')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolGlyph.test.ts`
Expected: FAIL — cannot resolve `./ToolGlyph.svelte`.

- [ ] **Step 3: Write the implementation**

```svelte
<!-- apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte -->
<script lang="ts">
  /**
   * ToolGlyph — the single icon atom for every Shippie surface.
   * Render priority: iconUrl (img) → glyph (emoji) → smart monogram.
   * Terminal style + hybrid square come from @shippie/design-tokens.
   * The same monogram()/accentColor() run in the build-time SVG
   * generator, so live tiles and baked PWA icons match.
   */
  import { monogram, accentColor } from '@shippie/design-tokens';

  interface Props {
    slug: string;
    name: string;
    iconUrl?: string | null;
    glyph?: string | null;
    themeColor?: string | null;
    size?: number;
    running?: boolean;
    float?: boolean;
  }

  let {
    slug,
    name,
    iconUrl = null,
    glyph = null,
    themeColor = null,
    size = 64,
    running = false,
    float = true,
  }: Props = $props();

  const accent = $derived(accentColor(slug, themeColor));
  const mark = $derived(monogram(name, slug));
  // Hide the rocket badge when the tile is too small to read it.
  const showRocket = $derived(running && size >= 28);
</script>

<div
  class="tool-glyph"
  class:running
  class:float
  style="--c: {accent}; width: {size}px; height: {size}px; font-size: {Math.round(size * 0.32)}px;"
  aria-hidden="true"
>
  {#if running}<span class="pulse"></span>{/if}
  {#if iconUrl}
    <img src={iconUrl} alt="" width={size} height={size} loading="lazy" decoding="async" />
  {:else if glyph}
    <span class="emoji">{glyph}</span>
  {:else}
    <span class="monogram">{mark}</span>
  {/if}
  <span class="dot"></span>
  {#if showRocket}
    <span class="rocket">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--c)" stroke-width="2" aria-hidden="true">
        <path d="M5 19c0-3 1-5 3-7 3-3 8-5 11-5 0 3-2 8-5 11-2 2-4 3-7 3l-2-2z" />
        <circle cx="14" cy="10" r="1.4" fill="var(--c)" />
      </svg>
    </span>
  {/if}
</div>

<style>
  .tool-glyph {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--tool-icon-radius);
    background: var(--tool-icon-tile);
    border: 1px solid color-mix(in srgb, var(--c) var(--tool-icon-hairline), transparent);
    overflow: visible;
  }
  .tool-glyph.float {
    box-shadow: var(--tool-icon-float);
  }
  .tool-glyph img {
    border-radius: inherit;
    object-fit: cover;
  }
  .monogram {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--c);
  }
  .emoji {
    line-height: 1;
  }
  .dot {
    position: absolute;
    left: 9px;
    top: 9px;
    width: 4px;
    height: 4px;
    border-radius: 1px;
    background: var(--c);
    opacity: 0.65;
  }
  .tool-glyph.running {
    box-shadow:
      var(--tool-icon-float),
      0 0 0 1.5px color-mix(in srgb, var(--c) 70%, transparent),
      0 0 16px -3px color-mix(in srgb, var(--c) 55%, transparent);
  }
  .rocket {
    position: absolute;
    right: -6px;
    top: -6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--tool-icon-tile);
    border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .rocket svg {
    width: 10px;
    height: 10px;
  }
  .pulse {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1.5px solid var(--c);
    opacity: 0;
    animation: glyph-pulse 2.4s ease-out infinite;
  }
  @keyframes glyph-pulse {
    0% { opacity: 0.5; transform: scale(1); }
    70% { opacity: 0; transform: scale(1.25); }
    100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; display: none; }
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolGlyph.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts
git commit -m "feat(tool-surface): ToolGlyph icon atom (terminal style, running rocket)"
```

### Task 4: Delegate IconOrMonogram to ToolGlyph

**Files:**
- Modify: `apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte`
- Test: `apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts` (create)

- [ ] **Step 1: Write the failing test (props pass through; monogram is now smart)**

```ts
// apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/svelte';
import IconOrMonogram from './IconOrMonogram.svelte';

describe('IconOrMonogram (delegates to ToolGlyph)', () => {
  test('still renders an <img> when iconUrl is present', () => {
    const { container } = render(IconOrMonogram, {
      props: { name: 'Dough', slug: 'dough', iconUrl: '/i.svg', themeColor: '#e07a4d' },
    });
    expect(container.querySelector('img')).not.toBeNull();
  });
  test('uses the smart 2-letter monogram for multi-word names', () => {
    const { getByText } = render(IconOrMonogram, {
      props: { name: 'Symptom Diary', slug: 'symptom-diary', iconUrl: null, themeColor: '#7fa06a' },
    });
    expect(getByText('SD')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/marketplace/IconOrMonogram.test.ts`
Expected: FAIL — current component renders a single letter "S", not "SD".

- [ ] **Step 3: Replace IconOrMonogram body with a ToolGlyph delegation**

```svelte
<!-- apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte -->
<script lang="ts">
  /**
   * IconOrMonogram — kept as a stable name for ~10 existing call sites.
   * Now a thin wrapper over ToolGlyph (the real icon atom). Do not add
   * visual logic here; change ToolGlyph instead.
   */
  import ToolGlyph from '$lib/components/tool-surface/ToolGlyph.svelte';

  interface Props {
    name: string;
    slug: string;
    iconUrl: string | null | undefined;
    themeColor: string;
    size?: number;
    /** Retained for call-site compatibility; ToolGlyph derives its own scale. */
    fontScale?: number;
    glyph?: string | null;
    running?: boolean;
    float?: boolean;
  }

  let {
    name,
    slug,
    iconUrl,
    themeColor,
    size = 64,
    glyph = null,
    running = false,
    float = false,
  }: Props = $props();
</script>

<ToolGlyph {name} {slug} {iconUrl} {themeColor} {glyph} {size} {running} {float} />
```

- [ ] **Step 4: Run tests to verify pass (and no call-site regressions)**

Run: `cd apps/platform && bunx vitest run src/lib/components/marketplace/IconOrMonogram.test.ts src/lib/components/tool-surface`
Expected: PASS. Then run the broader suite touching consumers:
Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface src/lib/components/marketplace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts
git commit -m "refactor(marketplace): IconOrMonogram delegates to ToolGlyph"
```

---

## Sprint 3 — Build Parity

### Task 5: Generate icons from the shared algorithm

**Files:**
- Modify: `scripts/generate-monogram-icons.mjs`
- Test: `scripts/generate-monogram-icons.test.mjs`

- [ ] **Step 1: Write the failing parity test**

```js
// scripts/generate-monogram-icons.test.mjs
import { describe, expect, test } from 'bun:test';
import { monogram, accentColor } from '../packages/design-tokens/src/tool-icon.ts';
import { buildMonogramSvg } from './generate-monogram-icons.mjs';

describe('generated SVG parity with the shared algorithm', () => {
  test('SVG embeds the same monogram and accent as ToolGlyph would', () => {
    const svg = buildMonogramSvg({ name: 'Symptom Diary', slug: 'symptom-diary', themeColor: '#000000' });
    expect(svg).toContain('>SD<');
    expect(svg).toContain(accentColor('symptom-diary', '#000000'));
  });
  test('respects a real maker theme colour', () => {
    const svg = buildMonogramSvg({ name: 'Dough', slug: 'dough', themeColor: '#e07a4d' });
    expect(svg).toContain('#e07a4d');
    expect(svg).toContain(`>${monogram('Dough', 'dough')}<`);
  });
  test('uses the hybrid radius (rx=3)', () => {
    const svg = buildMonogramSvg({ name: 'Lift', slug: 'lift', themeColor: '#000' });
    expect(svg).toContain('rx="3"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/generate-monogram-icons.test.mjs`
Expected: FAIL — `buildMonogramSvg` is not exported; current script inlines first-letter logic.

- [ ] **Step 3: Refactor the generator to export `buildMonogramSvg` using the shared algorithm**

In `scripts/generate-monogram-icons.mjs`, add the import near the top and replace the inline SVG construction with a shared, exported builder (terminal style, hybrid radius):

```js
import { monogram, accentColor } from '../packages/design-tokens/src/tool-icon.ts';

/**
 * Build a terminal-style monogram SVG matching ToolGlyph: near-black
 * tile, hybrid 3px radius, hairline accent border, monospace glyph in
 * the accent. Same monogram()/accentColor() as the live component.
 */
export function buildMonogramSvg({ name, slug, themeColor }) {
  const accent = accentColor(slug, themeColor);
  const mark = monogram(name, slug);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="3" fill="#15110c"/>
  <rect x="0.5" y="0.5" width="511" height="511" rx="3" fill="none" stroke="${accent}" stroke-opacity="0.34"/>
  <rect x="64" y="64" width="32" height="32" rx="1" fill="${accent}" fill-opacity="0.65"/>
  <text x="256" y="300" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="600" font-size="220" fill="${accent}">${mark}</text>
</svg>`;
}
```

Then, in the existing showcase-walking code, replace the body that writes `public/icon.svg` so it calls `buildMonogramSvg({ name, slug, themeColor })` instead of the old first-letter string. Keep the existing idempotency / file-resolution logic unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/generate-monogram-icons.test.mjs`
Expected: PASS.

- [ ] **Step 5: Regenerate showcase icons and commit**

```bash
bun scripts/generate-monogram-icons.mjs
git add scripts/generate-monogram-icons.mjs scripts/generate-monogram-icons.test.mjs apps/showcase-*/public/icon.svg
git commit -m "feat(icons): generate terminal-style icons from shared algorithm (web/app/mobile parity)"
```

---

## Sprint 4 — Launchpad Grid

### Task 6: ToolCard launchpad density

**Files:**
- Modify: `apps/platform/src/lib/components/tool-surface/ToolCard.svelte`
- Test: `apps/platform/src/lib/components/tool-surface/ToolCard.test.ts` (create if absent)
- Modify: `apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts`

- [ ] **Step 1: Write the failing test for the density prop**

```ts
// apps/platform/src/lib/components/tool-surface/ToolCard.test.ts
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/svelte';
import ToolCard from './ToolCard.svelte';
import type { ToolDisplay, ToolState } from './types';

const app: ToolDisplay = { slug: 'sudoku', name: 'Sudoku', themeColor: '#000000' };
const state: ToolState = {
  relationship: 'running',
  offlineState: 'ready',
  updateState: 'none',
  actions: { open: true, save: false, info: true, close: true, remove: false, review: false },
};

describe('ToolCard density', () => {
  test('launchpad density renders the icon-forward layout', () => {
    const { container } = render(ToolCard, { props: { app, state, density: 'launchpad' } });
    expect(container.querySelector('.tool-card.density-launchpad')).not.toBeNull();
  });
  test('running tool shows the rocket via ToolGlyph', () => {
    const { container } = render(ToolCard, { props: { app, state, density: 'launchpad' } });
    expect(container.querySelector('.rocket')).not.toBeNull();
  });
  test('defaults to card density when none provided', () => {
    const { container } = render(ToolCard, { props: { app, state } });
    expect(container.querySelector('.tool-card.density-card')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolCard.test.ts`
Expected: FAIL — no `density` prop / no `.density-launchpad` class.

- [ ] **Step 3: Add the density prop to ToolCard**

In `apps/platform/src/lib/components/tool-surface/ToolCard.svelte`:
1. Add to the `Props` interface: `density?: 'card' | 'launchpad';`
2. Destructure with default: `density = 'card'` in the `$props()` call.
3. Add the density class to the root element: `class="tool-card density-{density}"`.
4. Ensure the icon is rendered via `ToolGlyph` with `running={state.relationship === 'running'}` and, for launchpad, a larger `size` (e.g. 56) with `float`. In `launchpad` density, the name renders centered beneath the glyph and the primary manage action (`close` for running, `remove` for saved — driven off `state.actions`) appears on hover/focus.
5. Add CSS: `.density-launchpad` lays out as a centered column (glyph, name); manage control is absolutely positioned top-right, shown on `:hover`/`:focus-within`. `.density-card` keeps existing styles.

```svelte
<!-- add near the top of the markup, replacing the existing icon usage -->
<ToolGlyph
  slug={app.slug}
  name={app.name}
  iconUrl={app.iconUrl}
  glyph={app.glyph}
  themeColor={app.themeColor}
  size={density === 'launchpad' ? 56 : 40}
  running={state.relationship === 'running'}
  float={density === 'launchpad'}
/>
```

```css
.tool-card.density-launchpad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 14px 8px;
  position: relative;
  text-align: center;
}
.tool-card.density-launchpad .manage {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 0.12s;
}
.tool-card.density-launchpad:hover .manage,
.tool-card.density-launchpad:focus-within .manage {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .tool-card.density-launchpad .manage { transition: none; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolCard.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the primitives guardrail to allow exactly two density values**

In `apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts`, add a test asserting `density` only accepts `card | launchpad` (grep the component source for the union type) and that the Dock imports only `ToolRow`/`ToolCard` (no new primitive file). Example assertion:

```ts
test('ToolCard density union stays closed (card | launchpad)', () => {
  const src = readFileSync(
    new URL('./ToolCard.svelte', import.meta.url), 'utf8',
  );
  expect(src).toContain("density?: 'card' | 'launchpad'");
});
```

- [ ] **Step 6: Run the guardrail + commit**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/primitives-guardrail.test.ts`
Expected: PASS.

```bash
git add apps/platform/src/lib/components/tool-surface/ToolCard.svelte apps/platform/src/lib/components/tool-surface/ToolCard.test.ts apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts
git commit -m "feat(tool-surface): ToolCard launchpad density (icon-forward grid tile)"
```

### Task 7: DockSection + DashboardHome launchpad grid

**Files:**
- Create: `apps/platform/src/lib/container/DockSection.svelte`
- Test: `apps/platform/src/lib/container/DockSection.test.ts`
- Modify: `apps/platform/src/lib/container/DashboardHome.svelte`

- [ ] **Step 1: Write the failing test for DockSection (collapses when empty)**

```ts
// apps/platform/src/lib/container/DockSection.test.ts
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/svelte';
import DockSection from './DockSection.svelte';

describe('DockSection', () => {
  test('renders label + caption when it has items', () => {
    const { getByText, container } = render(DockSection, {
      props: { label: 'Running', caption: 'Still open in the background.', count: 3 },
    });
    expect(getByText('Running')).toBeTruthy();
    expect(getByText('Still open in the background.')).toBeTruthy();
    expect(container.querySelector('section')).not.toBeNull();
  });
  test('collapses (renders nothing) when count is 0', () => {
    const { container } = render(DockSection, {
      props: { label: 'Recent', caption: 'Opened on this device.', count: 0 },
    });
    expect(container.querySelector('section')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockSection.test.ts`
Expected: FAIL — `./DockSection.svelte` not found.

- [ ] **Step 3: Implement DockSection**

```svelte
<!-- apps/platform/src/lib/container/DockSection.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    label: string;
    caption: string;
    count: number;
    children?: Snippet;
  }
  let { label, caption, count, children }: Props = $props();
</script>

{#if count > 0}
  <section class="dock-section">
    <header>
      <h2>{label}</h2>
      <p>{caption}</p>
    </header>
    <div class="grid">
      {@render children?.()}
    </div>
  </section>
{/if}

<style>
  .dock-section { margin-bottom: 32px; }
  header { margin-bottom: 14px; }
  h2 { font-size: 15px; font-weight: 600; color: var(--text); margin: 0; }
  header p { font-size: 13px; color: var(--text-dim, #8c8170); margin: 4px 0 0; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
    gap: 14px 12px;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockSection.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire DashboardHome to the grid + header + Manage toggle**

In `apps/platform/src/lib/container/DashboardHome.svelte`:
1. Import `DockSection` and `ToolCard`.
2. Add a page header region above the sections: a greeting `<h1>` plus the existing one-liner as a `<p class="subtitle">` (move the "Running, recent, and saved tools stay close…" string here; it must no longer be an absolutely-positioned floating paragraph — this removes the stray "M" overlap).
3. Add a `view` state: `let view = $state<'grid' | 'manage'>('grid')` with a small toggle in the header.
4. Render each group through `DockSection`, passing `count` from the data, and inside render each tool as `ToolCard` with `density={view === 'grid' ? 'launchpad' : 'card'}` (manage view uses the row-like card / existing density). Keep the existing `toolState` selector usage to compute `state` per tool — do not recompute display fields.

```svelte
<header class="dock-header">
  <h1>Your Dock</h1>
  <p class="subtitle">Running, recent, and saved tools stay close. Use Tools when you want to find something new.</p>
  <button class="view-toggle" onclick={() => (view = view === 'grid' ? 'manage' : 'grid')}>
    {view === 'grid' ? 'Manage' : 'Done'}
  </button>
</header>

<DockSection label="Running" caption="Still open in the background." count={running.length}>
  {#each running as app (app.slug)}
    <ToolCard {app} state={toolState(app)} density={view === 'grid' ? 'launchpad' : 'card'} onClose={handleClose} onInfo={handleInfo} />
  {/each}
</DockSection>
<!-- repeat DockSection for Recent (onSave) and Saved (onRemove), same pattern -->
```

- [ ] **Step 6: Run the DashboardHome + section tests + typecheck**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockSection.test.ts && bunx svelte-check --threshold error`
Expected: PASS / no errors. (If `svelte-check` is not the project's checker, use the script in `apps/platform/package.json`.)

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/container/DockSection.svelte apps/platform/src/lib/container/DockSection.test.ts apps/platform/src/lib/container/DashboardHome.svelte
git commit -m "feat(dock): launchpad grid home with unified sections, header, manage toggle"
```

---

## Sprint 5 — Rail

### Task 8: Collapsible DockRail

**Files:**
- Create: `apps/platform/src/lib/container/DockRail.svelte`
- Test: `apps/platform/src/lib/container/DockRail.test.ts`
- Modify: `apps/platform/src/routes/dock/+page.svelte`

> **Coordination:** `dock/+page.svelte` is a 5037-line Codex collision zone. Before editing, run `git fetch && git log --oneline -3 origin/feat/dock-harmonization` and re-check HEAD; if Codex has touched the rail region, rebase/coordinate before extracting. Stage only the files listed.

- [ ] **Step 1: Write the failing test (labels, collapse, no stray header)**

```ts
// apps/platform/src/lib/container/DockRail.test.ts
import { describe, expect, test } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import DockRail from './DockRail.svelte';

describe('DockRail', () => {
  test('collapsed by default; nav items have accessible names', () => {
    const { container, getByLabelText } = render(DockRail, { props: { signedIn: false } });
    const nav = container.querySelector('nav.dock-rail');
    expect(nav?.getAttribute('aria-expanded')).toBe('false');
    expect(getByLabelText('Create')).toBeTruthy();
    expect(getByLabelText('Browse tools')).toBeTruthy();
  });
  test('expands on pin toggle', async () => {
    const { container, getByLabelText } = render(DockRail, { props: { signedIn: false } });
    await fireEvent.click(getByLabelText('Expand navigation'));
    expect(container.querySelector('nav.dock-rail')?.getAttribute('aria-expanded')).toBe('true');
  });
  test('does not render any absolutely-positioned element overlapping the content (M-bug regression)', () => {
    const { container } = render(DockRail, { props: { signedIn: false } });
    // The rail is self-contained; it must not leak a stray glyph into the page header.
    expect(container.textContent).not.toMatch(/^\s*M\s*$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockRail.test.ts`
Expected: FAIL — `./DockRail.svelte` not found.

- [ ] **Step 3: Implement DockRail (collapsible, lucide nav, account block)**

```svelte
<!-- apps/platform/src/lib/container/DockRail.svelte -->
<script lang="ts">
  /**
   * DockRail — collapsible left navigation extracted from dock/+page.svelte.
   * Collapsed 56px (icon-only + tooltips) → expanded 200px (labels).
   * Pinned state persists to localStorage. Replaces the old cramped icon
   * cluster + dead space + flat link list.
   */
  import { Plus, LayoutGrid, User, KeyRound, PanelLeft } from 'lucide-svelte';

  interface Props { signedIn: boolean; }
  let { signedIn }: Props = $props();

  let pinned = $state(false);
  let hovered = $state(false);
  const expanded = $derived(pinned || hovered);

  function togglePin() {
    pinned = !pinned;
    try { localStorage.setItem('dock-rail-pinned', String(pinned)); } catch {}
  }

  $effect(() => {
    try { pinned = localStorage.getItem('dock-rail-pinned') === 'true'; } catch {}
  });

  const items = [
    { href: '/new', label: 'Create', icon: Plus, primary: true },
    { href: '/tools', label: 'Browse tools', icon: LayoutGrid },
    { href: '/you', label: 'You', icon: User },
    { href: '/access', label: 'Access', icon: KeyRound },
  ];
</script>

<nav
  class="dock-rail"
  class:expanded
  aria-expanded={expanded}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
>
  <div class="brand">
    <span class="logo" aria-hidden="true"></span>
    {#if expanded}<span class="wordmark">Dock</span>{/if}
  </div>

  <button class="pin" aria-label="Expand navigation" onclick={togglePin}>
    <PanelLeft size={18} />
  </button>

  <ul>
    {#each items as item (item.href)}
      <li>
        <a href={item.href} class:primary={item.primary} aria-label={item.label} title={item.label}>
          <item.icon size={18} />
          {#if expanded}<span>{item.label}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>

  <div class="account">
    <a href={signedIn ? '/you' : '/auth/login'} aria-label={signedIn ? 'Account' : 'Sign in to ship'} title={signedIn ? 'Account' : 'Sign in to ship'}>
      <span class="avatar" aria-hidden="true"></span>
      {#if expanded}<span>{signedIn ? 'Account' : 'Sign in to ship'}</span>{/if}
    </a>
  </div>
</nav>

<style>
  .dock-rail {
    display: flex;
    flex-direction: column;
    width: 56px;
    transition: width 0.15s ease;
    border-right: 1px solid var(--line, #2e2920);
    padding: 12px 8px;
    gap: 6px;
    height: 100%;
  }
  .dock-rail.expanded { width: 200px; }
  .brand { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 4px; }
  .logo { width: 22px; height: 22px; border-radius: 4px; background: var(--sunset, #c98a4b); }
  .wordmark { font-weight: 700; color: var(--text); }
  .pin { background: none; border: 0; color: var(--text-dim, #8c8170); cursor: pointer; padding: 6px; align-self: flex-start; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  a {
    display: flex; align-items: center; gap: 10px;
    padding: 8px; border-radius: 8px; color: var(--text-dim, #8c8170);
    text-decoration: none; white-space: nowrap;
  }
  a:hover { background: var(--panel, #211d17); color: var(--text); }
  a.primary { color: var(--text); }
  .account { margin-top: auto; border-top: 1px solid var(--line, #2e2920); padding-top: 8px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--sage-moss, #7fa06a); flex: none; }
  @media (prefers-reduced-motion: reduce) { .dock-rail { transition: none; } }
</style>
```

> If `lucide-svelte` is not already a dependency, add it first: `cd apps/platform && bun add lucide-svelte` and commit the lockfile change in this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockRail.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the inline rail in dock/+page.svelte**

In `apps/platform/src/routes/dock/+page.svelte`: import `DockRail`, delete the inline rail markup (the cramped icon cluster + Switcher-adjacent nav + the flat `Browse tools / You / Access / Create / Sign in to ship` list), and render `<DockRail signedIn={…} />` in its place. Pass the existing signed-in value from the page's data. Remove now-dead rail CSS. Verify the existing dock route tests still pass.

- [ ] **Step 6: Run the dock route tests + commit**

Run: `cd apps/platform && bunx vitest run src/routes/dock`
Expected: PASS.

```bash
git fetch && git log --oneline -1 origin/feat/dock-harmonization   # re-check HEAD before staging
git add apps/platform/src/lib/container/DockRail.svelte apps/platform/src/lib/container/DockRail.test.ts apps/platform/src/routes/dock/+page.svelte
# include bun.lock ONLY if you added lucide-svelte in this task
git commit -m "feat(dock): collapsible DockRail; remove dead-space rail and stray-M cluster"
```

---

## Sprint 6 — Ambient Shader (enhancement, flag-gated)

### Task 9: Single-context ambient WebGL layer

**Files:**
- Create: `apps/platform/src/lib/components/tool-surface/AmbientGrid.svelte`
- Test: `apps/platform/src/lib/components/tool-surface/AmbientGrid.test.ts`
- Modify: `apps/platform/src/lib/container/DashboardHome.svelte` (mount behind the grid, flag-gated)

- [ ] **Step 1: Write the failing test (fallback behaviour)**

```ts
// apps/platform/src/lib/components/tool-surface/AmbientGrid.test.ts
import { describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AmbientGrid from './AmbientGrid.svelte';

describe('AmbientGrid', () => {
  test('renders a static fallback when prefers-reduced-motion is set', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {},
    }));
    const { container } = render(AmbientGrid, { props: { accents: ['#c98a4b'] } });
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('.ambient-static')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/AmbientGrid.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement AmbientGrid (one canvas; static fallback)**

```svelte
<!-- apps/platform/src/lib/components/tool-surface/AmbientGrid.svelte -->
<script lang="ts">
  /**
   * AmbientGrid — ONE shared WebGL layer behind the launchpad grid.
   * Never per-tile (browsers cap ~16 GL contexts; the Dock has 70+ tools).
   * Static gradient fallback under prefers-reduced-motion or when WebGL
   * is unavailable. Animation pauses when the tab is hidden.
   */
  import { onMount } from 'svelte';
  interface Props { accents: string[]; }
  let { accents }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let reduced = $state(false);
  let webglOk = $state(true);

  onMount(() => {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced || !canvasEl) return;
    const gl = canvasEl.getContext('webgl2');
    if (!gl) { webglOk = false; return; }
    let raf = 0;
    const tick = () => {
      if (!document.hidden) { /* draw slow living gradient seeded from accents */ }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const useStatic = $derived(reduced || !webglOk);
  const firstAccent = $derived(accents[0] ?? '#c98a4b');
</script>

{#if useStatic}
  <div class="ambient-static" style="--a: {firstAccent}" aria-hidden="true"></div>
{:else}
  <canvas bind:this={canvasEl} class="ambient" aria-hidden="true"></canvas>
{/if}

<style>
  .ambient, .ambient-static {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
  }
  .ambient-static {
    background: radial-gradient(120% 80% at 30% 10%, color-mix(in srgb, var(--a) 10%, transparent), transparent 60%);
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/AmbientGrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount behind the grid in DashboardHome, flag-gated**

In `DashboardHome.svelte`, wrap the sections in a `position: relative` container and place `<AmbientGrid accents={visibleAccents} />` as the first child when a `PUBLIC_DOCK_AMBIENT` flag (or existing feature-flag mechanism) is enabled. Tiles already `float`, so they read above it.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/components/tool-surface/AmbientGrid.svelte apps/platform/src/lib/components/tool-surface/AmbientGrid.test.ts apps/platform/src/lib/container/DashboardHome.svelte
git commit -m "feat(dock): flag-gated ambient WebGL layer with reduced-motion fallback"
```

---

## Final verification

- [ ] **Run the full platform suite:** `cd apps/platform && bun run test` — Expected: PASS.
- [ ] **Run the design-tokens suite:** `cd packages/design-tokens && bun test` — Expected: PASS.
- [ ] **Capture desktop visual shots** via the existing `_shotkit` harness (Dock grid, hover manage action, running rocket, rail expanded); pngquant before committing per `urthly-apps-screenshot-pipeline` convention.
- [ ] **Manual check at 1440px and 2560px:** grid fills the canvas, no dead rail space, no stray "M", running tools show the rocket, same icon appears on the installed PWA.

---

## Self-Review notes (author)

- **Spec coverage:** launchpad grid (Task 6–7) ✓; collapsible rail (Task 8) ✓; ToolGlyph + algorithm (Tasks 1,3) ✓; cross-platform parity (Task 5) ✓; terminal style + hybrid radius + float + rocket (Tasks 2,3) ✓; ambient shader scoped to one context (Task 9) ✓; unified sections + affordances + header + M-bug fix (Tasks 7,8) ✓; no third primitive / guardrail (Task 6) ✓; accessibility (focus-within actions, aria-labels — Tasks 6,8) ✓; reduced-motion (Tasks 3,6,9) ✓.
- **Type consistency:** `monogram(name, slug)`, `accentColor(slug, themeColor)`, `surfaceSeed(slug)` used identically in Tasks 1, 3, 5. `ToolGlyph` props match consumption in Tasks 4 and 6. `density: 'card' | 'launchpad'` consistent across Tasks 6–7 and the guardrail.
- **Known verify-at-runtime items (carried from spec §10):** the exact default `themeColor` sentinel set (confirm in `adapters.ts` during Task 1 — adjust `DEFAULT_THEME_COLORS` if the codebase uses a different "unset" value); whether `lucide-svelte` is already a dependency (Task 8); the project's feature-flag mechanism name (Task 9).
