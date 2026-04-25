# Zero-Config Pipeline + WASM Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Paired milestone:** This plan ships in lockstep with Plan G (Maker Dashboard + Compliance). The pipeline produces an `AppProfile` and writes it to KV; the dashboard reads it and shows the maker what was auto-detected. **B without G is invisible — confusing rather than delightful.** Don't merge B until G is in flight.

**Goal:** A maker uploads a normal web app — no `shippie.json`. The deploy pipeline analyses the HTML/CSS/JS, infers the app's category and capabilities, generates a PWA manifest + enhance-rule config, detects WASM files and sets the right headers, and writes the resulting `AppProfile` to KV alongside the wrap meta. The maker visits the dashboard and sees a list of enhancements Shippie added on their behalf.

**Architecture:** A new `packages/analyse` package exposes `analyseApp(files: ReadonlyMap<string, Uint8Array>)` returning a structured `AppProfile`. The deploy pipeline (`apps/web/lib/deploy/wrap.ts` and the zip-upload sibling path) calls it before files are written to R2; the resulting profile is stored in KV under the app's slug. The PWA injector learns to read `AppProfile` for smart manifest defaults (icon source detection, theme colour from extracted palette). A new `compileEnhanceConfig(profile)` in the observe package turns the recommended capability list into a selector→behaviour map. The Cloudflare Worker checks if the app's deploy contains `.wasm` files; if so, requests for those files get `Content-Type: application/wasm`, `Cross-Origin-Embedder-Policy: require-corp`, and `Cross-Origin-Opener-Policy: same-origin` so SharedArrayBuffer works.

**Tech Stack:** TypeScript, [`linkedom`](https://github.com/WebReflection/linkedom) (lightweight DOM parser, already used by some packages — verify) OR `node-html-parser` for HTML scanning, `postcss` for CSS scanning (already a dep of the wrapper), bun:test, regex-based JS framework detection (no actual JS parsing — too slow for deploy time).

---

## File Structure

**New package: `packages/analyse/`**
- `package.json`
- `tsconfig.json`
- `src/index.ts` — public `analyseApp(files)` entry
- `src/profile.ts` — `AppProfile` types
- `src/html-scanner.ts` — element inventory, `<title>`, `<h1>`, icon hrefs, link rels
- `src/css-scanner.ts` — primary colour, background, font family, animation count
- `src/js-scanner.ts` — framework detection by regex (React, Vue, Svelte, vanilla, WASM)
- `src/semantic-classifier.ts` — category from text content + element patterns (rule-based, no ML)
- `src/capability-recommender.ts` — `AppProfile` → `recommended.enhance` + `recommended.feel` map
- `src/wasm-detector.ts` — find `.wasm` files; produce header recommendations
- `src/index.test.ts` — integration: synthetic input files → expected AppProfile

**Modified packages:**
- `packages/sdk/src/wrapper/observe/compiler.ts` (new) — `compileEnhanceConfig(profile: AppProfile): EnhanceConfig`
- `packages/sdk/src/wrapper/observe/compiler.test.ts` (new)
- `packages/sdk/src/wrapper/observe/index.ts` — export `compileEnhanceConfig`
- `packages/pwa-injector/src/smart-defaults.ts` (new) — `manifestFromProfile(profile, fallback)`
- `packages/pwa-injector/src/smart-defaults.test.ts` (new)
- `packages/pwa-injector/src/generate-manifest.ts` — accept optional `profile` and call `manifestFromProfile`
- `packages/pwa-injector/src/icon-pipeline.ts` — extract icon from AppProfile-collected icon hrefs (preserve fallback chain)

**Deploy pipeline:**
- `apps/web/lib/deploy/wrap.ts` — for URL-wrap mode: skip analyse (we don't have files)
- `apps/web/lib/deploy/zip-upload.ts` (or wherever the zip path lives — locate first) — call `analyseApp` after zip extraction, before R2 upload; store profile in KV
- `apps/web/lib/deploy/kv.ts` — add `writeAppProfile`, `readAppProfile`

**Worker:**
- `services/worker/src/router/asset.ts` (or wherever asset serving lives — locate first) — when serving `.wasm`, set the three required headers

---

## Task 1: `packages/analyse` scaffold + AppProfile type

**Files:**
- Create: `packages/analyse/package.json`
- Create: `packages/analyse/tsconfig.json`
- Create: `packages/analyse/src/profile.ts`
- Create: `packages/analyse/src/index.ts`

- [ ] **Step 1: Scaffold workspace package**

Read `packages/cf-storage/package.json` and `packages/cf-storage/tsconfig.json` as the reference shape (small, recently-added workspace package). Mirror its structure for `packages/analyse`:

```json
{
  "name": "@shippie/analyse",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "bun test src",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist .turbo *.tsbuildinfo"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Write `profile.ts`**

```typescript
// packages/analyse/src/profile.ts
/**
 * Static-analysis output for a single deployed app. Produced once at
 * deploy time, stored in KV alongside the app's wrap meta, consumed by
 * (a) the PWA manifest generator, (b) the observe compiler, and (c) the
 * maker dashboard's "Enhancements" tab.
 *
 * Every field is a guess. Confidence is communicated implicitly by the
 * defaults that flow downstream — for instance, `category.primary` only
 * affects the recommended enhance map; the maker can always override.
 */

export interface AppProfile {
  /** Best-guess display title from the deploy bundle. */
  inferredName: string;

  elements: ElementInventory;
  category: CategoryGuess;
  design: DesignTokens;
  framework: FrameworkGuess;
  wasm: WasmReport;

  /** Suggested enhance rules, expressed as the same selector→behaviours
   *  map the observer consumes from shippie.json. The deploy pipeline
   *  flattens this through `compileEnhanceConfig`. */
  recommended: RecommendedConfig;
}

export interface ElementInventory {
  buttons: number;
  textInputs: { count: number; names: string[] };
  fileInputs: { count: number; accepts: string[] };
  lists: { count: number; itemCounts: number[] };
  images: number;
  videos: number;
  canvases: number;
  forms: number;
  links: number;
}

export interface CategoryGuess {
  primary:
    | 'cooking'
    | 'fitness'
    | 'finance'
    | 'journal'
    | 'tools'
    | 'media'
    | 'social'
    | 'reference'
    | 'unknown';
  confidence: number;
  signals: string[];
}

export interface DesignTokens {
  primaryColor: string | null;
  backgroundColor: string | null;
  fontFamily: string | null;
  hasCustomAnimations: boolean;
  /** Icon hrefs found in `<link rel="icon|apple-touch-icon|...">`. */
  iconHrefs: string[];
}

export interface FrameworkGuess {
  name: 'react' | 'vue' | 'svelte' | 'preact' | 'vanilla' | 'wasm' | null;
  version: string | null;
  hasRouter: boolean;
  hasServiceWorker: boolean;
}

export interface WasmReport {
  detected: boolean;
  files: string[];
  /** Headers the worker must apply when serving these files. */
  headers: Record<string, string>;
}

export interface RecommendedConfig {
  enhance: Record<string, string[]>;
  feel: {
    haptics: boolean;
    transitions: 'spring' | 'css' | 'off';
    scrollBounce: boolean;
    sound: boolean;
  };
  ambient: {
    wakeLock: 'auto' | 'off';
  };
  ai: string[] | false;
}
```

- [ ] **Step 3: Stub `index.ts` so the package compiles**

```typescript
// packages/analyse/src/index.ts
export type * from './profile.ts';

export interface AppFiles {
  /** Maps relative path → file bytes. Path always uses '/' separators
   *  and never starts with '/'. */
  files: ReadonlyMap<string, Uint8Array>;
}

import type { AppProfile } from './profile.ts';

export async function analyseApp(_input: AppFiles): Promise<AppProfile> {
  throw new Error('analyseApp not yet implemented — see Tasks 2–8');
}
```

- [ ] **Step 4: Wire workspace, typecheck, commit**

Run `cd /Users/devante/Documents/Shippie && bun install` to register the new workspace.
Run `cd packages/analyse && bun run typecheck`. Expected: 0 errors.

```bash
git add packages/analyse/ bun.lock
git commit -m "feat(analyse): scaffold + AppProfile type

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: HTML scanner

**Files:**
- Create: `packages/analyse/src/html-scanner.ts`
- Create: `packages/analyse/src/html-scanner.test.ts`

Parse every `.html` file in the bundle. Tally elements, extract `<title>` / largest `<h1>`, collect icon hrefs, detect `<link rel="manifest">` (signal that maker has their own), detect `<script>` import patterns.

Use regex parsing rather than a full DOM library. Reasons: (a) deploy time is latency-sensitive, full HTML parsing is overkill for tallies; (b) zero new deps; (c) the input is post-build HTML which is consistent enough. Edge cases (unclosed tags, comments) are tolerated — counts may be ±5%, which is fine for an inference heuristic.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/analyse/src/html-scanner.test.ts
import { describe, expect, test } from 'bun:test';
import { scanHtml } from './html-scanner.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('scanHtml', () => {
  test('counts buttons across multiple files', () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`<html><body><button>a</button><button>b</button></body></html>`));
    files.set('about.html', enc(`<html><body><button>c</button></body></html>`));
    const result = scanHtml(files);
    expect(result.elements.buttons).toBe(3);
  });

  test('counts inputs and captures their names', () => {
    const files = new Map([['x.html', enc(`
      <input type="text" name="email" />
      <input type="text" name="password" />
      <input type="file" accept="image/*" />
    `)]]);
    const result = scanHtml(files);
    expect(result.elements.textInputs.count).toBe(2);
    expect(result.elements.textInputs.names).toEqual(['email', 'password']);
    expect(result.elements.fileInputs.count).toBe(1);
    expect(result.elements.fileInputs.accepts).toEqual(['image/*']);
  });

  test('extracts <title> as inferredName', () => {
    const files = new Map([['index.html', enc(`<html><head><title>Recipe Saver</title></head></html>`)]]);
    const result = scanHtml(files);
    expect(result.inferredName).toBe('Recipe Saver');
  });

  test('falls back to largest h1 when no title', () => {
    const files = new Map([['index.html', enc(`<h1>My Big App</h1><h1>x</h1>`)]]);
    const result = scanHtml(files);
    expect(result.inferredName).toBe('My Big App');
  });

  test('collects icon hrefs from link tags', () => {
    const files = new Map([['index.html', enc(`
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/apple.png">
    `)]]);
    const result = scanHtml(files);
    expect(result.iconHrefs).toEqual(['/favicon.ico', '/apple.png']);
  });

  test('detects existing manifest link', () => {
    const files = new Map([['index.html', enc(`<link rel="manifest" href="/manifest.json">`)]]);
    const result = scanHtml(files);
    expect(result.hasOwnManifest).toBe(true);
  });

  test('counts list items per <ul>/<ol>', () => {
    const files = new Map([['x.html', enc(`<ul><li>1</li><li>2</li><li>3</li></ul><ol><li>a</li></ol>`)]]);
    const result = scanHtml(files);
    expect(result.elements.lists.count).toBe(2);
    expect(result.elements.lists.itemCounts).toEqual([3, 1]);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd /Users/devante/Documents/Shippie/packages/analyse && bun test src/html-scanner.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `html-scanner.ts`**

```typescript
// packages/analyse/src/html-scanner.ts
/**
 * Regex-based HTML scanner. Trades parser correctness for speed and
 * zero-deps. Counts may be ±5% on adversarial input — acceptable for an
 * inference heuristic. Refine with a real parser if accuracy becomes a
 * problem in production.
 */
import type { ElementInventory } from './profile.ts';

export interface HtmlScanResult {
  elements: ElementInventory;
  inferredName: string;
  iconHrefs: string[];
  hasOwnManifest: boolean;
  /** Concatenated visible text — used downstream by semantic-classifier. */
  visibleText: string;
}

const TAG_RE = (tag: string) => new RegExp(`<${tag}\\b[^>]*>`, 'gi');
const INPUT_RE = /<input\b[^>]*>/gi;
const ATTR_RE = (name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i');
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const H1_RE = /<h1[^>]*>([^<]+)<\/h1>/gi;
const LINK_RE = /<link\b[^>]*>/gi;
const LI_IN_LIST_RE = /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const LI_RE = /<li\b[^>]*>/gi;
const TEXT_RE = />([^<]+)</g;

const decoder = new TextDecoder();

export function scanHtml(files: ReadonlyMap<string, Uint8Array>): HtmlScanResult {
  const elements: ElementInventory = {
    buttons: 0,
    textInputs: { count: 0, names: [] },
    fileInputs: { count: 0, accepts: [] },
    lists: { count: 0, itemCounts: [] },
    images: 0,
    videos: 0,
    canvases: 0,
    forms: 0,
    links: 0,
  };

  let inferredName = '';
  let largestH1 = '';
  const iconHrefs: string[] = [];
  let hasOwnManifest = false;
  const visibleParts: string[] = [];

  for (const [path, bytes] of files) {
    if (!path.endsWith('.html') && !path.endsWith('.htm')) continue;
    const html = decoder.decode(bytes);

    elements.buttons += match(html, TAG_RE('button')).length;
    elements.images += match(html, TAG_RE('img')).length;
    elements.videos += match(html, TAG_RE('video')).length;
    elements.canvases += match(html, TAG_RE('canvas')).length;
    elements.forms += match(html, TAG_RE('form')).length;
    elements.links += match(html, TAG_RE('a')).length;

    for (const m of html.matchAll(INPUT_RE)) {
      const tag = m[0];
      const type = tag.match(ATTR_RE('type'))?.[1]?.toLowerCase() ?? 'text';
      const name = tag.match(ATTR_RE('name'))?.[1];
      if (type === 'file') {
        elements.fileInputs.count += 1;
        const accept = tag.match(ATTR_RE('accept'))?.[1];
        if (accept) elements.fileInputs.accepts.push(accept);
      } else if (
        type === 'text' || type === 'email' || type === 'search' ||
        type === 'tel' || type === 'url' || type === 'password' || type === 'number'
      ) {
        elements.textInputs.count += 1;
        if (name) elements.textInputs.names.push(name);
      }
    }

    for (const m of html.matchAll(LI_IN_LIST_RE)) {
      const inner = m[2] ?? '';
      const items = match(inner, LI_RE).length;
      elements.lists.count += 1;
      elements.lists.itemCounts.push(items);
    }

    if (!inferredName) {
      const t = html.match(TITLE_RE)?.[1]?.trim();
      if (t) inferredName = t;
    }
    for (const m of html.matchAll(H1_RE)) {
      const text = m[1]?.trim() ?? '';
      if (text.length > largestH1.length) largestH1 = text;
    }

    for (const m of html.matchAll(LINK_RE)) {
      const tag = m[0];
      const rel = tag.match(ATTR_RE('rel'))?.[1]?.toLowerCase();
      const href = tag.match(ATTR_RE('href'))?.[1];
      if (!rel || !href) continue;
      if (rel === 'manifest') hasOwnManifest = true;
      if (rel.includes('icon')) iconHrefs.push(href);
    }

    for (const m of html.matchAll(TEXT_RE)) {
      const text = m[1]?.trim();
      if (text && text.length > 1) visibleParts.push(text);
    }
  }

  if (!inferredName) inferredName = largestH1;
  return {
    elements,
    inferredName,
    iconHrefs,
    hasOwnManifest,
    visibleText: visibleParts.join(' '),
  };
}

function match(text: string, re: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(re)];
}
```

- [ ] **Step 4: Run, verify pass**

Run from `packages/analyse`: `bun test src/html-scanner.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/analyse/src/html-scanner.ts packages/analyse/src/html-scanner.test.ts
git commit -m "feat(analyse): regex-based HTML scanner

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: CSS scanner

**Files:**
- Create: `packages/analyse/src/css-scanner.ts`
- Create: `packages/analyse/src/css-scanner.test.ts`

Extract the most-used colour (likely `--accent` or `body { color: ... }`), the body background, the primary font family, and a count of `@keyframes` (used as the "hasCustomAnimations" signal).

Same regex-only approach as Task 2 — postcss is a heavy dep for what amounts to "find hex colours and font-family".

- [ ] **Step 1: Tests** — covering: hex extraction, hsl extraction, frequency-weighted choice (most common wins), font-family extraction (first non-fallback), `@keyframes` count.

```typescript
// packages/analyse/src/css-scanner.test.ts
import { describe, expect, test } from 'bun:test';
import { scanCss } from './css-scanner.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('scanCss', () => {
  test('picks the most common hex colour as primary', () => {
    const css = `
      .a { color: #E8603C; }
      .b { background: #E8603C; }
      .c { border: 1px solid #E8603C; }
      .d { color: #ffffff; }
    `;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.primaryColor?.toLowerCase()).toBe('#e8603c');
  });

  test('extracts body background from selector', () => {
    const css = `body { background: #FAF7EF; color: #14120F; }`;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.backgroundColor?.toLowerCase()).toBe('#faf7ef');
  });

  test('extracts first font-family non-system fallback', () => {
    const css = `body { font-family: 'Inter', -apple-system, sans-serif; }`;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.fontFamily).toBe('Inter');
  });

  test('counts @keyframes', () => {
    const css = `@keyframes a {} @keyframes b {} @-webkit-keyframes c {}`;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.hasCustomAnimations).toBe(true);
  });

  test('returns nulls when no css present', () => {
    const r = scanCss(new Map());
    expect(r.primaryColor).toBeNull();
    expect(r.backgroundColor).toBeNull();
    expect(r.fontFamily).toBeNull();
    expect(r.hasCustomAnimations).toBe(false);
  });
});
```

- [ ] **Step 2: Implementation** — write `css-scanner.ts` exporting `scanCss(files)` returning `{ primaryColor, backgroundColor, fontFamily, hasCustomAnimations }`. Iterate hex/hsl/rgb matches across all `.css` files; maintain frequency map; pick top. Body background via `body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|hsl\([^)]+\)|rgb\([^)]+\))`. Font family via `font-family\s*:\s*['"]?([^'",;]+)`.

- [ ] **Step 3: Run, verify pass; commit.**

---

## Task 4: JS / framework scanner

**Files:**
- Create: `packages/analyse/src/js-scanner.ts`
- Create: `packages/analyse/src/js-scanner.test.ts`

Detect framework by string fingerprint in any `.js`/`.mjs` file:
- `react` substring + `createElement` → React
- `Vue` constructor or `__vue__` → Vue
- `svelte` import marker → Svelte
- `preact` substring → Preact
- presence of `react-router` / `vue-router` / `svelte-routing` → `hasRouter: true`
- service worker registration `navigator.serviceWorker.register` → `hasServiceWorker: true`
- no JS at all but HTML present → `'vanilla'`
- ANY `.wasm` file → `framework.name = 'wasm'` (when no other framework matches)

- [ ] Tests cover each framework + router + sw + vanilla + wasm priority. Implementation is a sequence of `for (const [path, bytes] of files)` loops with `text.includes(...)` checks. Commit when green.

---

## Task 5: Semantic classifier

**Files:**
- Create: `packages/analyse/src/semantic-classifier.ts`
- Create: `packages/analyse/src/semantic-classifier.test.ts`

Rule-based: count keyword hits in the visible text from `scanHtml.visibleText`. Each category has a small keyword bag. Highest hit count wins; confidence = `hits / totalCategoryKeywords`. Below threshold (e.g. 0.05) → `'unknown'`.

```typescript
const CATEGORY_KEYWORDS: Record<CategoryGuess['primary'], string[]> = {
  cooking: ['recipe', 'ingredient', 'cook', 'kitchen', 'meal', 'oven', 'tablespoon'],
  fitness: ['workout', 'exercise', 'reps', 'cardio', 'strength', 'training'],
  finance: ['budget', 'expense', 'income', 'invoice', 'transaction', 'currency'],
  journal: ['entry', 'mood', 'reflection', 'today', 'wrote', 'feeling'],
  tools: ['converter', 'calculator', 'timer', 'utility', 'tool'],
  media: ['video', 'photo', 'album', 'gallery', 'play', 'pause'],
  social: ['friend', 'follow', 'share', 'post', 'comment', 'reply'],
  reference: ['definition', 'glossary', 'wiki', 'article', 'lookup'],
  unknown: [],
};
```

- [ ] Tests: synthetic visible-text input → expected category + confidence > threshold. One test for the unknown fall-through. Commit when green.

---

## Task 6: Capability recommender

**Files:**
- Create: `packages/analyse/src/capability-recommender.ts`
- Create: `packages/analyse/src/capability-recommender.test.ts`

Take an `ElementInventory` + `CategoryGuess` + `FrameworkGuess` and produce `RecommendedConfig`:

```typescript
function recommend(inv, cat, framework): RecommendedConfig {
  const enhance: Record<string, string[]> = {
    'button, [role="button"], input[type="submit"]': ['textures'],
  };
  if (inv.lists.count > 0) {
    enhance['ul > li, ol > li, [role="listitem"]'] = ['textures'];
  }
  if (inv.videos > 0 || inv.canvases > 0) {
    enhance['video, canvas'] = ['wakelock', 'textures'];
  }
  if (inv.forms > 0) {
    enhance['form'] = ['textures'];
  }
  if (inv.images > 1) {
    enhance['img'] = ['textures'];
  }
  if (cat.primary === 'cooking') {
    // Cooking apps: keep screen on aggressively.
    enhance['canvas, [data-shippie-canvas], main'] = ['wakelock'];
  }

  return {
    enhance,
    feel: { haptics: true, transitions: 'spring', scrollBounce: true, sound: false },
    ambient: { wakeLock: 'auto' },
    ai: cat.primary === 'journal' ? ['classify', 'embed', 'sentiment'] : false,
  };
}
```

- [ ] Tests: each input shape → expected enhance map + feel/ambient/ai. Commit when green.

---

## Task 7: WASM detector

**Files:**
- Create: `packages/analyse/src/wasm-detector.ts`
- Create: `packages/analyse/src/wasm-detector.test.ts`

```typescript
export function detectWasm(files: ReadonlyMap<string, Uint8Array>): WasmReport {
  const wasmFiles = [...files.keys()].filter((p) => p.endsWith('.wasm'));
  if (wasmFiles.length === 0) {
    return { detected: false, files: [], headers: {} };
  }
  return {
    detected: true,
    files: wasmFiles,
    headers: {
      'Content-Type': 'application/wasm',
      // Required for SharedArrayBuffer + multi-threaded WASM.
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  };
}
```

- [ ] Tests: empty bundle → not detected, empty headers; bundle with `pkg.wasm` → detected with the three headers; multiple wasm files → all listed. Commit when green.

---

## Task 8: Integration — `analyseApp(files)`

**Files:**
- Modify: `packages/analyse/src/index.ts`
- Create: `packages/analyse/src/index.test.ts`

Wire all five scanners + classifier + recommender + WASM detector into the public entry. Returns `AppProfile`.

```typescript
export async function analyseApp(input: AppFiles): Promise<AppProfile> {
  const html = scanHtml(input.files);
  const css = scanCss(input.files);
  const js = scanJs(input.files);
  const wasm = detectWasm(input.files);
  const category = classifyByText(html.visibleText);
  const recommended = recommend(html.elements, category, js);

  return {
    inferredName: html.inferredName || 'Untitled',
    elements: html.elements,
    category,
    design: {
      primaryColor: css.primaryColor,
      backgroundColor: css.backgroundColor,
      fontFamily: css.fontFamily,
      hasCustomAnimations: css.hasCustomAnimations,
      iconHrefs: html.iconHrefs,
    },
    framework: js,
    wasm,
    recommended,
  };
}
```

- [ ] Integration test: a synthetic "recipe app" bundle (HTML + CSS + JS strings) → expect `category.primary === 'cooking'`, `enhance` includes wakelock for canvas, etc. A synthetic "WASM Rust app" bundle → `framework.name === 'wasm'` and `wasm.detected === true`. Commit when green.

---

## Task 9: Observe compiler

**Files:**
- Create: `packages/sdk/src/wrapper/observe/compiler.ts`
- Create: `packages/sdk/src/wrapper/observe/compiler.test.ts`
- Modify: `packages/sdk/src/wrapper/observe/index.ts` — export `compileEnhanceConfig`

```typescript
// packages/sdk/src/wrapper/observe/compiler.ts
import type { EnhanceConfig } from './types.ts';

/** Subset of @shippie/analyse's RecommendedConfig that we depend on.
 *  Defined locally to keep the observe package free of cross-deps. */
export interface CompilableProfile {
  recommended: { enhance: Record<string, string[]> };
}

/**
 * Compile a recommended-enhance map into the format the observer
 * consumes. Today this is an identity mapping — kept as a function so
 * future logic (rule de-duplication, capability gating, max-rule cap)
 * has a clean home.
 */
export function compileEnhanceConfig(profile: CompilableProfile): EnhanceConfig {
  const out: Record<string, string[]> = {};
  for (const [selector, rules] of Object.entries(profile.recommended.enhance)) {
    if (rules.length === 0) continue;
    out[selector] = [...new Set(rules)];
  }
  return out;
}
```

- [ ] Test: profile with two selectors, one with duplicate rules → de-duplicated. Empty rules dropped. Commit when green.

---

## Task 10: PWA injector smart-defaults

**Files:**
- Create: `packages/pwa-injector/src/smart-defaults.ts`
- Create: `packages/pwa-injector/src/smart-defaults.test.ts`
- Modify: `packages/pwa-injector/src/generate-manifest.ts` — accept `profile?` and pass through `manifestFromProfile`
- Modify: `packages/pwa-injector/src/icon-pipeline.ts` — accept `iconHrefs` from profile and prefer them

```typescript
// packages/pwa-injector/src/smart-defaults.ts
export interface ManifestSmartDefaults {
  name: string;
  short_name: string;
  theme_color: string;
  background_color: string;
  display: 'standalone';
  /** Best-guess icon source (path within the bundle), or null. */
  iconHref: string | null;
}

interface ProfileLike {
  inferredName: string;
  design: { primaryColor: string | null; backgroundColor: string | null; iconHrefs: string[] };
}

export function manifestFromProfile(
  profile: ProfileLike,
  fallback: { themeColor: string; backgroundColor: string; appName: string },
): ManifestSmartDefaults {
  return {
    name: profile.inferredName || fallback.appName,
    short_name: shortName(profile.inferredName || fallback.appName),
    theme_color: profile.design.primaryColor ?? fallback.themeColor,
    background_color: profile.design.backgroundColor ?? fallback.backgroundColor,
    display: 'standalone',
    iconHref: pickBestIcon(profile.design.iconHrefs),
  };
}

function shortName(name: string): string {
  return name.length > 12 ? name.split(/\s+/)[0]!.slice(0, 12) : name;
}

function pickBestIcon(hrefs: string[]): string | null {
  if (hrefs.length === 0) return null;
  // Prefer apple-touch-icon — usually highest-quality artwork.
  const apple = hrefs.find((h) => /apple/i.test(h));
  if (apple) return apple;
  return hrefs[0]!;
}
```

- [ ] Tests: profile with primary colour → manifest theme_color matches; missing → falls back; long name → short_name truncated; apple-touch-icon preferred. Commit when green.

- [ ] **Wire `generate-manifest.ts`**: accept optional `profile` parameter; if present, call `manifestFromProfile(profile, fallback)` and use its values where the maker hasn't explicitly overridden via `shippie.json`.

---

## Task 11: Deploy pipeline wiring

**Files:**
- Modify: deploy zip path (locate first — `apps/web/lib/deploy/zip-upload.ts` or sibling)
- Modify: `apps/web/lib/deploy/kv.ts` — add `writeAppProfile(slug, profile)` + `readAppProfile(slug)`

- [ ] **Step 1: Locate the zip-upload path**

Run: `grep -rn "ZipReader\|JSZip\|extractZip" apps/web/lib/deploy/ apps/web/app/api/ 2>/dev/null | head -5`

Identify the function that ingests a maker's zip and writes files to R2. The integration point is just after extraction, before R2 upload.

- [ ] **Step 2: Add `writeAppProfile` / `readAppProfile`**

In `apps/web/lib/deploy/kv.ts`, alongside the existing `writeWrapMeta` / `writeAppMeta` functions, add:

```typescript
import type { AppProfile } from '@shippie/analyse';

export async function writeAppProfile(slug: string, profile: AppProfile): Promise<void> {
  const kv = await getKv();
  await kv.put(`app:${slug}:profile`, JSON.stringify(profile), {
    metadata: { writtenAt: Date.now() },
  });
}

export async function readAppProfile(slug: string): Promise<AppProfile | null> {
  const kv = await getKv();
  const raw = await kv.get(`app:${slug}:profile`);
  return raw ? (JSON.parse(raw) as AppProfile) : null;
}
```

(Match the existing helper signatures — read the file before writing to copy the pattern.)

- [ ] **Step 3: Call `analyseApp` in the zip-upload path**

After file extraction:

```typescript
import { analyseApp } from '@shippie/analyse';
import { writeAppProfile } from '@/lib/deploy/kv';

// ... after files are in a Map<string, Uint8Array>:
const profile = await analyseApp({ files });
await writeAppProfile(slug, profile);
```

- [ ] **Step 4: Tests**

Add a test in the deploy module covering: zip with HTML containing buttons → `writeAppProfile` called with a profile that has buttons > 0. Skip if the existing deploy tests are PGlite-blocked (per memory) — instead add a unit test in `packages/analyse` that round-trips a profile through `JSON.stringify/parse` to confirm serializability.

- [ ] **Step 5: Commit.**

---

## Task 12: WASM headers in the worker

**Files:**
- Modify: worker asset router (locate first)
- Add a test asserting the headers are set on `.wasm` requests

- [ ] **Step 1: Locate the asset router**

Run: `grep -rn "Content-Type\|application/octet" services/worker/src/ 2>/dev/null | head -10`

Identify the function that serves files from R2 — likely `services/worker/src/router/index.ts` or `asset.ts`.

- [ ] **Step 2: Add WASM-specific headers**

Where the response is built for an R2 object, branch on path:

```typescript
const isWasm = path.endsWith('.wasm');
const headers: Record<string, string> = {
  'Content-Type': isWasm ? 'application/wasm' : inferContentType(path),
};
if (isWasm) {
  headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  headers['Cross-Origin-Opener-Policy'] = 'same-origin';
}
```

- [ ] **Step 3: Test**

Add a worker test (existing pattern in `services/worker/src/router/*.test.ts`) that hits a `/foo.wasm` route, mocks R2 to return bytes, and asserts the three headers are present.

- [ ] **Step 4: Smoke**

Deploy a tiny Rust-→-WASM hello-world (or use an existing demo .wasm in the repo if any) to a preview slug. Open in Chrome devtools → Network → confirm `application/wasm` Content-Type and the COEP/COOP headers are on the response.

- [ ] **Step 5: Commit.**

---

## Done When

- [ ] `packages/analyse` package exists, exports `analyseApp` + `AppProfile` types
- [ ] HTML/CSS/JS scanners + semantic classifier + WASM detector + recommender all tested in isolation
- [ ] Integration test proves analysing a synthetic recipe app yields `category.primary === 'cooking'` and a wakelock rule
- [ ] `compileEnhanceConfig(profile)` produces an `EnhanceConfig` consumable by `startObserve`
- [ ] PWA injector reads `AppProfile` and produces a manifest with primary colour + best icon
- [ ] Zip-upload deploy path writes `AppProfile` to KV under `app:<slug>:profile`
- [ ] Worker serves `.wasm` files with `application/wasm` + COEP/COOP headers
- [ ] Real maker zip (one of the existing showcase apps as a test bundle) → analyse → manifest + enhance config matches what was previously hand-written

## Pairs with Plan G

The dashboard plan reads `app:<slug>:profile` from KV and renders the auto-detected enhancements with an "Edit shippie.json to override" affordance. Without G, this plan has no user-facing surface. Ship them together.

## NOT in this plan (deferred)

- **Wrapper bundle tree-shaking per AppProfile.** Start with the full bundle. Add tree-shaking only if real bundles exceed 50 KB gzipped. YAGNI until measured.
- **Re-analyse on update.** First-deploy only. A subsequent `?force` query param can trigger re-analyse — defer until a maker asks.
- **CSS variable extraction (`--accent` → primary colour).** Today we count raw hex/hsl/rgb appearances. Variable-aware extraction belongs in a follow-up if the heuristic proves unreliable.
- **Multi-page app routing detection.** We detect React Router by import string, not by analysing route definitions.
- **Streaming WASM compilation header tuning beyond COEP/COOP.** Browser defaults handle the rest.
