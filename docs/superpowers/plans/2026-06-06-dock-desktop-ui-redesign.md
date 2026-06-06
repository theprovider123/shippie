# Dock Desktop UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Dock desktop landing page as a launchpad grid with a collapsing icon rail and a sharp, collision-proof, cross-platform icon system.

**Architecture:** A pure `tool-icon.ts` algorithm in `@shippie/design-tokens` (monogram + accent + seed), re-exported from the package index, is the single source of truth — consumed by both a new `ToolGlyph` Svelte atom (live DOM) and the build-time SVG generator (baked PWA/app/mobile icons). The Dock home switches to a launchpad grid built from **`ToolRow` in a new `variant="tile"`** (ToolRow is the contract-designated Dock launch/manage primitive and already carries `onClose/onRemove/onReview` — so no third primitive and no erosion of ToolCard's browse-only boundary). The left rail is extracted into a collapsible `DockRail.svelte`. Terminal-style tiles, hybrid square corners, floating depth, a single shared ambient WebGL layer, and a rocket badge on running tools.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, `@shippie/design-tokens` (bun:test), `apps/platform` tests on **vitest only** (CLAUDE.md invariant — never `bun:test` under `apps/platform`), JetBrains Mono (already a brand font), lucide icons, WebGL2.

**Spec:** `docs/superpowers/specs/2026-06-06-dock-desktop-ui-redesign-design.md`

### Testing approach (read first)

This repo has **no component-render tests** and does **not** depend on `@testing-library/svelte`; adding it would also require a DOM env that the vitest config does not currently provide. Established style (see `tool-surface/labels.test.ts`, `tool-surface/primitives-guardrail.test.ts`):
- **Logic** → pure unit tests (`tool-icon.ts` gets the heavy coverage here).
- **Components** → **source-text guardrail** tests that read the `.svelte` file and assert structural invariants (import wiring, render-priority order, gating conditions, required a11y attributes).

Every component task below uses this guardrail style — no `render()`, no new dependency. (If true render tests are wanted later, that's a separate, scoped decision to add `@testing-library/svelte` + a jsdom env; not in this plan.)

---

## File Structure

**Sprint 1 — icon foundation (`@shippie/design-tokens`, bun:test)**
- Create: `packages/design-tokens/src/tool-icon.ts` — pure monogram/accent/seed algorithm. No deps.
- Create: `packages/design-tokens/src/tool-icon.test.ts` — bun:test unit tests + package-index re-export test.
- Modify: `packages/design-tokens/src/index.ts` — **re-export** `tool-icon` + add token names to `CANONICAL_TOKENS`.
- Modify: `packages/design-tokens/src/tokens.css` — hybrid icon radius + terminal surface tokens.

**Sprint 2 — `ToolGlyph` atom (`apps/platform`, vitest guardrail)**
- Create: `apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte` — the icon atom.
- Create: `apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts` — source-text guardrail.
- Modify: `apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte` — thin wrapper delegating to `ToolGlyph` (keeps ~10 call sites compiling).
- Create: `apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts` — guardrail: asserts delegation.

**Sprint 3 — build parity (clean-tree gated)**
- Modify: `scripts/generate-monogram-icons.mjs` — import shared algorithm; export `buildMonogramSvg`; emit terminal-style SVG.
- Create: `scripts/generate-monogram-icons.test.mjs` — parity test (bun:test; script lives outside `apps/platform`).

**Sprint 4 — launchpad grid (ToolRow tile variant)**
- Modify: `apps/platform/src/lib/components/tool-surface/ToolRow.svelte` — add `variant: 'row' | 'tile'`; tile uses `ToolGlyph` + running state.
- Create: `apps/platform/src/lib/components/tool-surface/ToolRow.test.ts` — guardrail: variant union + tile branch (or extend existing tool-surface tests).
- Modify: `apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts` — assert ToolCard stays browse-only; ToolRow variant union is closed; no third primitive.
- Create: `apps/platform/src/lib/container/DockSection.svelte` — shared section header (collapses when empty).
- Create: `apps/platform/src/lib/container/DockSection.test.ts` — guardrail: empty-collapse conditional.
- Modify: `apps/platform/src/lib/container/DashboardHome.svelte` — launchpad grid, unified sections, header, Manage toggle.

**Sprint 5 — rail**
- Create: `apps/platform/src/lib/container/DockRail.svelte` — collapsible icon rail (hover + pin + keyboard-focus + coarse-pointer fallback).
- Create: `apps/platform/src/lib/container/DockRail.test.ts` — guardrail: a11y names, coarse-pointer query, no stray-positioned header (M-bug regression).
- Modify: `apps/platform/src/routes/dock/+page.svelte` — replace inline rail markup with `<DockRail/>`.

**Sprint 6 — ambient shader (enhancement, flag-gated)**
- Create: `apps/platform/src/lib/components/tool-surface/AmbientGrid.svelte` — single WebGL layer + reduced-motion/static fallback.
- Create: `apps/platform/src/lib/components/tool-surface/AmbientGrid.test.ts` — guardrail: single getContext, reduced-motion branch, fallback markup.

---

## Sprint 1 — Icon Foundation

### Task 1: Pure icon algorithm + package re-export

**Files:**
- Create: `packages/design-tokens/src/tool-icon.ts`
- Create: `packages/design-tokens/src/tool-icon.test.ts`
- Modify: `packages/design-tokens/src/index.ts`

- [ ] **Step 1: Write the failing test (logic + the P0 re-export)**

```ts
// packages/design-tokens/src/tool-icon.test.ts
import { describe, expect, test } from 'bun:test';
import { monogram, accentColor, surfaceSeed } from './tool-icon';
// P0 regression: the package root MUST re-export these (consumers import
// from '@shippie/design-tokens', which resolves to ./index.ts).
import * as pkg from './index';

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

describe('package index re-export (P0)', () => {
  test('monogram/accentColor/surfaceSeed are exported from ./index', () => {
    expect(typeof pkg.monogram).toBe('function');
    expect(typeof pkg.accentColor).toBe('function');
    expect(typeof pkg.surfaceSeed).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/design-tokens && bun test src/tool-icon.test.ts`
Expected: FAIL — `Cannot find module './tool-icon'` and the index re-export assertions fail.

- [ ] **Step 3: Write the implementation**

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

Then add the re-export to `packages/design-tokens/src/index.ts` (append after the existing exports):

```ts
// Programmatic icon algorithm — shared by ToolGlyph (DOM) and the
// build-time SVG generator so live + baked icons match.
export { monogram, accentColor, surfaceSeed } from './tool-icon';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/design-tokens && bun test src/tool-icon.test.ts`
Expected: PASS — all assertions green, including the index re-export block.

- [ ] **Step 5: Commit**

```bash
git add packages/design-tokens/src/tool-icon.ts packages/design-tokens/src/tool-icon.test.ts packages/design-tokens/src/index.ts
git commit -m "feat(design-tokens): pure tool-icon algorithm, re-exported from index"
```

### Task 2: Terminal icon tokens in tokens.css

**Files:**
- Modify: `packages/design-tokens/src/index.ts` (CANONICAL_TOKENS list)
- Modify: `packages/design-tokens/src/tokens.css`
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

### Task 3: ToolGlyph component (guardrail-tested)

**Files:**
- Create: `apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte`
- Test: `apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts`

- [ ] **Step 1: Write the failing guardrail test**

```ts
// apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./ToolGlyph.svelte', import.meta.url), 'utf8');

describe('ToolGlyph structure (guardrail)', () => {
  test('uses the shared algorithm from the package root', () => {
    expect(src).toContain("from '@shippie/design-tokens'");
    expect(src).toMatch(/import\s*{[^}]*monogram[^}]*accentColor[^}]*}/);
  });
  test('render priority is iconUrl → glyph → monogram', () => {
    const iImg = src.indexOf('iconUrl}');
    const iGlyph = src.indexOf(':else if glyph');
    const iMono = src.indexOf('class="monogram"');
    expect(iImg).toBeGreaterThan(-1);
    expect(iGlyph).toBeGreaterThan(iImg);
    expect(iMono).toBeGreaterThan(iGlyph);
  });
  test('rocket badge is gated on running + a size threshold', () => {
    expect(src).toContain('showRocket');
    expect(src).toMatch(/running\s*&&\s*size\s*>=\s*28/);
    expect(src).toContain('class="rocket"');
  });
  test('uses the brand mono font and hybrid-radius token', () => {
    expect(src).toContain("--font-mono");
    expect(src).toContain('var(--tool-icon-radius)');
  });
  test('respects prefers-reduced-motion for the pulse', () => {
    expect(src).toContain('prefers-reduced-motion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolGlyph.test.ts`
Expected: FAIL — cannot read `./ToolGlyph.svelte`.

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
  .tool-glyph.float { box-shadow: var(--tool-icon-float); }
  .tool-glyph img { border-radius: inherit; object-fit: cover; }
  .monogram {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--c);
  }
  .emoji { line-height: 1; }
  .dot {
    position: absolute; left: 9px; top: 9px;
    width: 4px; height: 4px; border-radius: 1px;
    background: var(--c); opacity: 0.65;
  }
  .tool-glyph.running {
    box-shadow:
      var(--tool-icon-float),
      0 0 0 1.5px color-mix(in srgb, var(--c) 70%, transparent),
      0 0 16px -3px color-mix(in srgb, var(--c) 55%, transparent);
  }
  .rocket {
    position: absolute; right: -6px; top: -6px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--tool-icon-tile);
    border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .rocket svg { width: 10px; height: 10px; }
  .pulse {
    position: absolute; inset: 0; border-radius: inherit;
    border: 1.5px solid var(--c); opacity: 0;
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
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/components/tool-surface/ToolGlyph.svelte apps/platform/src/lib/components/tool-surface/ToolGlyph.test.ts
git commit -m "feat(tool-surface): ToolGlyph icon atom (terminal style, running rocket)"
```

### Task 4: Delegate IconOrMonogram to ToolGlyph

**Files:**
- Modify: `apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte`
- Test: `apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts`

- [ ] **Step 1: Write the failing guardrail test**

```ts
// apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./IconOrMonogram.svelte', import.meta.url), 'utf8');

describe('IconOrMonogram delegates to ToolGlyph (guardrail)', () => {
  test('imports and renders ToolGlyph', () => {
    expect(src).toContain('ToolGlyph');
    expect(src).toMatch(/<ToolGlyph[\s\S]*\/>/);
  });
  test('no longer contains its own monogram/letter logic', () => {
    expect(src).not.toContain('.monogram');
    expect(src).not.toMatch(/name\?\.trim\(\)\?\.\[0\]/);
  });
  test('forwards the identifying props', () => {
    for (const p of ['name', 'slug', 'iconUrl', 'themeColor', 'size']) {
      expect(src).toContain(p);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/marketplace/IconOrMonogram.test.ts`
Expected: FAIL — current component still has `.monogram` + letter logic and no `ToolGlyph`.

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
Expected: PASS.
Then typecheck the consumers (10 call sites): `cd apps/platform && bun run typecheck`
Expected: no new errors. (If `typecheck` is slow, scope with the project's svelte-check script.)

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/components/marketplace/IconOrMonogram.svelte apps/platform/src/lib/components/marketplace/IconOrMonogram.test.ts
git commit -m "refactor(marketplace): IconOrMonogram delegates to ToolGlyph"
```

---

## Sprint 3 — Build Parity

> **PREFLIGHT (required — P1c).** The generator is idempotent (writes only *missing* `icon.svg`s) but `git add apps/showcase-*/public/icon.svg` can sweep up unrelated dirty showcase/generated work that is already in the tree. Before starting this sprint:
> 1. `git status --short` — if any `apps/showcase-*` or generated files are dirty/untracked from other work, STOP. Either land/stash that work first, or run this sprint in an isolated worktree (`superpowers:using-git-worktrees`).
> 2. After regenerating, stage **only files the generator actually wrote** — diff and add explicitly, never `git add -A`.
> Note: because the generator only fills *missing* icons, existing baked icons keep their old look. Restyling already-baked showcase icons onto the terminal style is a **separate, deliberate force-regen pass** (broader churn) and is out of scope here.

### Task 5: Generate icons from the shared algorithm

**Files:**
- Modify: `scripts/generate-monogram-icons.mjs`
- Test: `scripts/generate-monogram-icons.test.mjs` (bun:test — script is outside `apps/platform`, so bun:test is correct here)

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

Add the import near the top of `scripts/generate-monogram-icons.mjs` and an exported builder:

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

Then, in the existing showcase-walking code, replace the body that writes `public/icon.svg` so it calls `buildMonogramSvg({ name, slug, themeColor })`. Keep the existing idempotency / file-resolution logic unchanged so it still only writes missing icons.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/generate-monogram-icons.test.mjs`
Expected: PASS.

- [ ] **Step 5: Regenerate, stage ONLY written files, commit**

```bash
git status --short        # confirm clean tree per preflight before running
bun scripts/generate-monogram-icons.mjs
git status --short        # list exactly what the generator wrote
# stage only those paths explicitly, e.g.:
git add scripts/generate-monogram-icons.mjs scripts/generate-monogram-icons.test.mjs
# add each generated icon.svg the run actually produced, individually:
# git add apps/showcase-<slug>/public/icon.svg
git commit -m "feat(icons): generate terminal-style icons from shared algorithm (web/app/mobile parity)"
```

---

## Sprint 4 — Launchpad Grid (ToolRow tile variant)

### Task 6: ToolRow `variant="tile"`

**Files:**
- Modify: `apps/platform/src/lib/components/tool-surface/ToolRow.svelte`
- Test: `apps/platform/src/lib/components/tool-surface/ToolRow.test.ts`
- Modify: `apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts`

> **Why ToolRow, not ToolCard:** the frozen harmonization contract designates **ToolRow** as the Dock launch/manage primitive, and it already carries `onClose/onRemove/onReview`. ToolCard is deliberately browse-only (its header comment: *"close / remove / review are Dock concepts and never appear on browse"*). Adding a tile presentation to ToolRow keeps the Dock on its contract primitive, gets management handlers for free, and adds no third primitive.

- [ ] **Step 1: Write the failing guardrail test**

```ts
// apps/platform/src/lib/components/tool-surface/ToolRow.test.ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./ToolRow.svelte', import.meta.url), 'utf8');

describe('ToolRow tile variant (guardrail)', () => {
  test('declares a closed variant union', () => {
    expect(src).toContain("variant?: 'row' | 'tile'");
  });
  test('tile branch renders ToolGlyph with running state', () => {
    expect(src).toContain('ToolGlyph');
    expect(src).toMatch(/running=\{state\.relationship === 'running'\}/);
    expect(src).toContain("variant === 'tile'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolRow.test.ts`
Expected: FAIL — no `variant` prop / no tile branch.

- [ ] **Step 3: Add the tile variant to ToolRow**

In `apps/platform/src/lib/components/tool-surface/ToolRow.svelte`:
1. Add to the `Props` interface: `variant?: 'row' | 'tile';`
2. Destructure with default `variant = 'row'`.
3. Import `ToolGlyph` (`import ToolGlyph from './ToolGlyph.svelte';`).
4. Add a `{#snippet tileInner()}` that renders the icon-forward column, reusing the existing derived flags (`safeName`, `showClose`, `showRemove`, etc.):

```svelte
{#snippet tileInner()}
  <ToolGlyph
    slug={app.slug}
    name={app.name}
    iconUrl={app.iconUrl ?? null}
    glyph={app.glyph ?? null}
    themeColor={app.themeColor}
    size={56}
    running={state.relationship === 'running'}
    float={true}
  />
  <span class="tile-name">{safeName}</span>
{/snippet}
```

5. Branch the outer markup on `variant`. The existing `row` markup stays exactly as-is under `{#if variant === 'row'}`; add the tile branch:

```svelte
{#if variant === 'tile'}
  <div class="tile" class:current>
    {#if href}
      <a class="tile-open" href={launchHref} onclick={launch.launchAndRemember}
         data-sveltekit-preload-data="hover" aria-label={`Open ${safeName}`}>
        {@render tileInner()}
      </a>
    {:else}
      <button class="tile-open" type="button" onclick={launch.launchAndRemember} aria-label={`Open ${safeName}`}>
        {@render tileInner()}
      </button>
    {/if}
    <div class="tile-actions">
      {#if showClose}<button class="manage" type="button" onclick={() => onClose?.(app)} aria-label={`Close ${safeName}`}>×</button>{/if}
      {#if showRemove}<button class="manage" type="button" onclick={() => onRemove?.(app)} aria-label={`Remove ${safeName}`}>−</button>{/if}
    </div>
  </div>
{:else}
  <!-- existing row markup unchanged -->
{/if}
```

6. Add tile CSS (height stays internally owned; external override still impossible):

```css
.tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 14px 8px; text-align: center; }
.tile-open { display: flex; flex-direction: column; align-items: center; gap: 9px; background: none; border: 0; cursor: pointer; color: inherit; }
.tile-name { font-size: 13px; color: var(--text); }
.tile-actions .manage { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity 0.12s; background: none; border: 0; color: var(--text-dim, #8c8170); cursor: pointer; }
.tile:hover .manage, .tile:focus-within .manage { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .tile-actions .manage { transition: none; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/ToolRow.test.ts`
Expected: PASS.

- [ ] **Step 5: Reinforce the contract in the guardrail test**

In `apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts`, add:

```ts
import { readFileSync } from 'node:fs';

test('ToolCard stays browse-only (no Dock management handlers)', () => {
  const card = readFileSync(new URL('./ToolCard.svelte', import.meta.url), 'utf8');
  expect(card).not.toContain('onClose');
  expect(card).not.toContain('onRemove');
  expect(card).not.toContain('onReview');
});

test('ToolRow variant union stays closed (row | tile)', () => {
  const row = readFileSync(new URL('./ToolRow.svelte', import.meta.url), 'utf8');
  expect(row).toContain("variant?: 'row' | 'tile'");
});
```

- [ ] **Step 6: Run the guardrail + commit**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/primitives-guardrail.test.ts`
Expected: PASS.

```bash
git add apps/platform/src/lib/components/tool-surface/ToolRow.svelte apps/platform/src/lib/components/tool-surface/ToolRow.test.ts apps/platform/src/lib/components/tool-surface/primitives-guardrail.test.ts
git commit -m "feat(tool-surface): ToolRow tile variant (icon-forward Dock grid tile)"
```

### Task 7: DockSection + DashboardHome launchpad grid

**Files:**
- Create: `apps/platform/src/lib/container/DockSection.svelte`
- Test: `apps/platform/src/lib/container/DockSection.test.ts`
- Modify: `apps/platform/src/lib/container/DashboardHome.svelte`

- [ ] **Step 1: Write the failing guardrail test**

```ts
// apps/platform/src/lib/container/DockSection.test.ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./DockSection.svelte', import.meta.url), 'utf8');

describe('DockSection (guardrail)', () => {
  test('collapses (renders nothing) when count is 0', () => {
    expect(src).toContain('{#if count > 0}');
  });
  test('renders label, caption and a grid container', () => {
    expect(src).toContain('{label}');
    expect(src).toContain('{caption}');
    expect(src).toContain('class="grid"');
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
1. Import `DockSection` and `ToolRow`.
2. Add a page header region above the sections: a greeting `<h1>` plus the existing one-liner as `<p class="subtitle">` (move the "Running, recent, and saved tools stay close…" string here; it must no longer be an absolutely-positioned floating paragraph — this removes the stray "M" overlap).
3. Add view state: `let view = $state<'grid' | 'manage'>('grid')` with a toggle button.
4. Render each group via `DockSection`, with each tool as `ToolRow` using `variant={view === 'grid' ? 'tile' : 'row'}`. Keep the existing `toolState` selector for `state` (do not recompute display fields). Wire the management handlers the Dock already uses (`onClose`, `onRemove`, `onInfo`, `onSave`).

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
    <ToolRow {app} state={toolState(app)} variant={view === 'grid' ? 'tile' : 'row'} hideRelationship onClose={handleClose} onInfo={handleInfo} />
  {/each}
</DockSection>
<!-- repeat DockSection for Recent (onSave) and Saved (onRemove), same pattern -->
```

- [ ] **Step 6: Run the section test + typecheck**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockSection.test.ts && bun run typecheck`
Expected: PASS / no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/lib/container/DockSection.svelte apps/platform/src/lib/container/DockSection.test.ts apps/platform/src/lib/container/DashboardHome.svelte
git commit -m "feat(dock): launchpad grid home with unified sections, header, manage toggle"
```

---

## Sprint 5 — Rail

### Task 8: Collapsible DockRail (desktop + tablet + keyboard)

**Files:**
- Create: `apps/platform/src/lib/container/DockRail.svelte`
- Test: `apps/platform/src/lib/container/DockRail.test.ts`
- Modify: `apps/platform/src/routes/dock/+page.svelte`

> **Coordination:** `dock/+page.svelte` is a 5037-line Codex collision zone. Before editing, run `git fetch && git log --oneline -3 origin/feat/dock-harmonization` and re-check HEAD; if Codex has touched the rail region, rebase/coordinate before extracting. Stage only the files listed.

- [ ] **Step 1: Write the failing guardrail test (a11y + P2 coarse-pointer/keyboard)**

```ts
// apps/platform/src/lib/container/DockRail.test.ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./DockRail.svelte', import.meta.url), 'utf8');

describe('DockRail (guardrail)', () => {
  test('every nav item carries an accessible name', () => {
    expect(src).toContain('aria-label');
    expect(src).toContain('title=');
  });
  test('exposes expanded state via aria-expanded', () => {
    expect(src).toContain('aria-expanded');
  });
  test('expands on keyboard focus, not only hover (P2)', () => {
    expect(src).toContain('onfocusin');
    expect(src).toContain('onfocusout');
  });
  test('has a coarse-pointer (touch/tablet) fallback so it is not icon-only mystery meat (P2)', () => {
    expect(src).toContain('(pointer: coarse)');
  });
  test('does not leak a stray single-letter node into the page (M-bug regression)', () => {
    expect(src).not.toMatch(/>\s*M\s*</);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockRail.test.ts`
Expected: FAIL — `./DockRail.svelte` not found.

- [ ] **Step 3: Implement DockRail**

```svelte
<!-- apps/platform/src/lib/container/DockRail.svelte -->
<script lang="ts">
  /**
   * DockRail — collapsible left navigation extracted from dock/+page.svelte.
   * Collapsed 56px (icon-only + tooltips) → expanded 200px (labels).
   * Expands on hover, keyboard focus (focusin), or pin. On coarse pointers
   * (touch/tablet) it defaults to the labeled width so it never becomes
   * mystery-meat. Pin persists to localStorage.
   */
  import { Plus, LayoutGrid, User, KeyRound, PanelLeft } from 'lucide-svelte';

  interface Props { signedIn: boolean; }
  let { signedIn }: Props = $props();

  let pinned = $state(false);
  let hovered = $state(false);
  let focused = $state(false);
  const expanded = $derived(pinned || hovered || focused);

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
  onfocusin={() => (focused = true)}
  onfocusout={() => (focused = false)}
>
  <div class="brand">
    <span class="logo" aria-hidden="true"></span>
    <span class="wordmark">Dock</span>
  </div>

  <button class="pin" aria-label="Expand navigation" title="Expand navigation" onclick={togglePin}>
    <PanelLeft size={18} />
  </button>

  <ul>
    {#each items as item (item.href)}
      <li>
        <a href={item.href} class:primary={item.primary} aria-label={item.label} title={item.label}>
          <item.icon size={18} />
          <span class="label">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>

  <div class="account">
    <a href={signedIn ? '/you' : '/auth/login'}
       aria-label={signedIn ? 'Account' : 'Sign in to ship'}
       title={signedIn ? 'Account' : 'Sign in to ship'}>
      <span class="avatar" aria-hidden="true"></span>
      <span class="label">{signedIn ? 'Account' : 'Sign in to ship'}</span>
    </a>
  </div>
</nav>

<style>
  .dock-rail {
    display: flex; flex-direction: column;
    width: 56px; transition: width 0.15s ease;
    border-right: 1px solid var(--line, #2e2920);
    padding: 12px 8px; gap: 6px; height: 100%;
  }
  .dock-rail.expanded { width: 200px; }
  /* Labels hidden only while collapsed; shown when expanded. */
  .dock-rail:not(.expanded) .label,
  .dock-rail:not(.expanded) .wordmark { display: none; }
  /* P2: touch/tablet has no hover — default to the labeled width. */
  @media (pointer: coarse) {
    .dock-rail { width: 200px; }
    .dock-rail .label, .dock-rail .wordmark { display: inline; }
  }
  .brand { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 4px; }
  .logo { width: 22px; height: 22px; border-radius: 4px; background: var(--sunset, #c98a4b); }
  .wordmark { font-weight: 700; color: var(--text); }
  .pin { background: none; border: 0; color: var(--text-dim, #8c8170); cursor: pointer; padding: 6px; align-self: flex-start; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  a { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; color: var(--text-dim, #8c8170); text-decoration: none; white-space: nowrap; }
  a:hover, a:focus-visible { background: var(--panel, #211d17); color: var(--text); }
  a.primary { color: var(--text); }
  .account { margin-top: auto; border-top: 1px solid var(--line, #2e2920); padding-top: 8px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--sage-moss, #7fa06a); flex: none; }
  @media (prefers-reduced-motion: reduce) { .dock-rail { transition: none; } }
</style>
```

> If `lucide-svelte` is not already a dependency, add it first: `cd apps/platform && bun add lucide-svelte`, and include `bun.lock` in this task's commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/container/DockRail.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the inline rail in dock/+page.svelte**

In `apps/platform/src/routes/dock/+page.svelte`: import `DockRail`, delete the inline rail markup (the cramped icon cluster + the flat `Browse tools / You / Access / Create / Sign in to ship` list around line 3672), and render `<DockRail signedIn={…} />` in its place, passing the existing signed-in value from page data. Remove now-dead rail CSS. The deleted cluster is the source of the stray "M" overlap.

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

- [ ] **Step 1: Write the failing guardrail test**

```ts
// apps/platform/src/lib/components/tool-surface/AmbientGrid.test.ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./AmbientGrid.svelte', import.meta.url), 'utf8');

describe('AmbientGrid (guardrail)', () => {
  test('creates exactly one GL context (never per-tile)', () => {
    expect(src.match(/getContext\(/g)?.length).toBe(1);
  });
  test('honors prefers-reduced-motion and has a static fallback', () => {
    expect(src).toContain('prefers-reduced-motion');
    expect(src).toContain('ambient-static');
  });
  test('pauses animation when the tab is hidden', () => {
    expect(src).toContain('document.hidden');
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
  .ambient, .ambient-static { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .ambient-static {
    background: radial-gradient(120% 80% at 30% 10%, color-mix(in srgb, var(--a) 10%, transparent), transparent 60%);
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/platform && bunx vitest run src/lib/components/tool-surface/AmbientGrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount behind the grid in DashboardHome, flag-gated**

In `DashboardHome.svelte`, wrap the sections in a `position: relative` container and place `<AmbientGrid accents={visibleAccents} />` as the first child when the Dock ambient flag is enabled. Use the project's existing feature-flag mechanism (confirm the name at implementation time — e.g. a `PUBLIC_` env flag or the existing flags store). Tiles already `float`, so they read above it.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/components/tool-surface/AmbientGrid.svelte apps/platform/src/lib/components/tool-surface/AmbientGrid.test.ts apps/platform/src/lib/container/DashboardHome.svelte
git commit -m "feat(dock): flag-gated ambient WebGL layer with reduced-motion fallback"
```

---

## Final verification

- [ ] **Green-light gate:** `bun run health` (typecheck && test && build) from repo root — Expected: PASS. Per CLAUDE.md Bash gotcha, do NOT pipe to `tail` for the pass/fail check; capture output to a file and grep for failure markers, or use `set -o pipefail`.
- [ ] **design-tokens suite:** `cd packages/design-tokens && bun test` — Expected: PASS.
- [ ] **Capture desktop visual shots** via the existing `_shotkit` harness (Dock grid, hover manage action, running rocket, rail expanded); pngquant before committing per `urthly-apps-screenshot-pipeline` convention.
- [ ] **Manual check at 1440px and 2560px:** grid fills the canvas, no dead rail space, no stray "M", running tools show the rocket; tablet/touch shows the labeled rail; same icon appears on the installed PWA.

---

## Self-Review notes (author)

- **Spec coverage:** launchpad grid (Task 6–7) ✓; collapsible rail + tablet/keyboard (Task 8) ✓; ToolGlyph + algorithm + re-export (Tasks 1,3) ✓; cross-platform parity + clean-tree gate (Task 5) ✓; terminal style + hybrid radius + float + rocket (Tasks 2,3) ✓; ambient shader scoped to one context (Task 9) ✓; unified sections + affordances + header + M-bug fix (Tasks 7,8) ✓; no third primitive / ToolCard stays browse-only (Task 6 guardrail) ✓; accessibility (focus-within actions, aria-labels — Tasks 6,8) ✓; reduced-motion (Tasks 3,8,9) ✓.
- **Review fixes applied:** P0 index re-export + package-index test (Task 1); P1a all component tests are vitest source-text guardrails, no `@testing-library/svelte`, no new dep (Testing approach + every component task); P1b launchpad uses **ToolRow `variant="tile"`** not ToolCard, with a guardrail asserting ToolCard stays browse-only (Task 6); P1c Sprint 3 clean-tree/worktree preflight + explicit per-file staging (Sprint 3 header, Task 5 Step 5); P2 rail expands on keyboard focus + coarse-pointer labeled fallback (Task 8).
- **Type/name consistency:** `monogram(name, slug)`, `accentColor(slug, themeColor)`, `surfaceSeed(slug)` identical in Tasks 1, 3, 5. `ToolGlyph` props match consumption in Tasks 4 and 6. `variant: 'row' | 'tile'` consistent across Tasks 6–7 and the guardrail.
- **Test-runner invariant:** `apps/platform` tests are all vitest; only `design-tokens` and the `scripts/` parity test use `bun:test` (both outside `apps/platform`) — complies with CLAUDE.md.
- **Verify-at-runtime items:** default `themeColor` sentinel set (confirm in `adapters.ts` during Task 1; adjust `DEFAULT_THEME_COLORS`); whether `lucide-svelte` is already a dependency (Task 8); the project's feature-flag mechanism name (Task 9).
