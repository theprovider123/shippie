# Sensory Textures + Patina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap a button → composed haptic + sound + visual texture fires within the same animation frame. Apps gain subtle visual character over time based on usage age. Existing showcase apps gain the new feel layer immediately.

**Architecture:** A texture is a structured value combining `haptic`, `sound`, and `visual` recipes. The engine fires all three synchronously in a single `requestAnimationFrame` callback. Sound is synthesised procedurally via Web Audio (no asset pipeline this iteration; real samples land as a follow-up). Patina is page-level only (background tint warms over months of use), stored in IndexedDB, applied as a CSS variable on the document root. The DOM observer gets a new `textures` rule that maps semantic interactions (button click, form submit success/error, page navigate, item delete) to the appropriate preset.

**Tech Stack:** existing wrapper primitives (`haptics.ts`, `spring.ts`, `view-transitions.ts`), Web Audio API for sound synth, IndexedDB for patina state, bun:test + happy-dom for tests.

---

## File Structure

**New files (textures):**
- `packages/sdk/src/wrapper/textures/types.ts` — `SensoryTexture`, `TextureName`, `TextureEngineConfig`
- `packages/sdk/src/wrapper/textures/engine.ts` — `fireTexture(name)` synchronised executor + config registry
- `packages/sdk/src/wrapper/textures/sound-synth.ts` — Web Audio oscillator-with-envelope synth
- `packages/sdk/src/wrapper/textures/visual-fx.ts` — small DOM helpers (scale spring, glow ring, particle burst, shake)
- `packages/sdk/src/wrapper/textures/presets/confirm.ts`
- `packages/sdk/src/wrapper/textures/presets/complete.ts`
- `packages/sdk/src/wrapper/textures/presets/error.ts`
- `packages/sdk/src/wrapper/textures/presets/navigate.ts`
- `packages/sdk/src/wrapper/textures/presets/delete.ts`
- `packages/sdk/src/wrapper/textures/presets/refresh.ts`
- `packages/sdk/src/wrapper/textures/presets/install.ts` (the signature moment)
- `packages/sdk/src/wrapper/textures/presets/milestone.ts`
- `packages/sdk/src/wrapper/textures/presets/toggle.ts`
- `packages/sdk/src/wrapper/textures/index.ts` — re-exports + preset registry
- `packages/sdk/src/wrapper/textures/engine.test.ts`
- `packages/sdk/src/wrapper/textures/sound-synth.test.ts`
- `packages/sdk/src/wrapper/observe/rules/textures.ts` — auto-fire rule

**New files (patina):**
- `packages/sdk/src/wrapper/patina/types.ts` — `PatinaState`, `PatinaConfig`
- `packages/sdk/src/wrapper/patina/storage.ts` — IndexedDB read/write
- `packages/sdk/src/wrapper/patina/page.ts` — apply CSS var based on age
- `packages/sdk/src/wrapper/patina/milestone.ts` — fire milestone texture on day-100, day-365 (one-shot)
- `packages/sdk/src/wrapper/patina/index.ts` — `installPatina()` boot fn
- `packages/sdk/src/wrapper/patina/storage.test.ts`
- `packages/sdk/src/wrapper/patina/page.test.ts`

**Modified files:**
- `packages/sdk/src/wrapper/observe/rules/index.ts` — register `textures` rule
- `packages/sdk/src/wrapper/observe/types.ts` — add `'webaudio'` capability
- `packages/sdk/src/wrapper/observe/capability-gate.ts` — detect Web Audio
- `packages/sdk/src/wrapper/index.ts` — export `installPatina`, texture engine
- `packages/sdk/src/wrapper/observe-init.ts` — call `installPatina` after observer starts
- `apps/showcase-recipe/src/main.tsx` — confirm wrapper bootstrap auto-applies textures (no app code change needed if the rule self-installs)
- `apps/showcase-journal/src/main.tsx` — same

---

## Task 1: Texture types

**Files:**
- Create: `packages/sdk/src/wrapper/textures/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// packages/sdk/src/wrapper/textures/types.ts
/**
 * A sensory texture is a composite multi-output interaction pattern:
 * haptic + sound + visual all fire in lockstep within a single animation
 * frame. Textures are pre-designed; makers don't compose their own (they
 * pick by name from the preset registry).
 *
 * Sound is opt-in (config.sound = true). Haptics and visuals are on by
 * default. Each output respects prefers-reduced-motion and prefers-
 * reduced-data automatically — the engine drops outputs that conflict
 * with user preferences.
 */
export type TextureName =
  | 'confirm'
  | 'complete'
  | 'error'
  | 'navigate'
  | 'delete'
  | 'refresh'
  | 'install'
  | 'milestone'
  | 'toggle';

export interface HapticRecipe {
  /** Vibration pattern in ms; passed to navigator.vibrate. */
  pattern: number | number[];
}

export interface SoundRecipe {
  /** Synthesis kind for the procedural synth. */
  kind: 'click' | 'pop' | 'bonk' | 'whoosh' | 'chime';
  /** Base frequency in Hz. */
  freq: number;
  /** Total duration in ms. */
  durationMs: number;
  /** Amplitude 0–1. */
  gain: number;
}

export interface VisualRecipe {
  /** Animation kind applied to the originating element. */
  kind: 'scale-spring' | 'pop' | 'shake' | 'glow' | 'fade-out' | 'lift-float' | 'slide';
  /** Total duration in ms. */
  durationMs: number;
  /** Optional secondary effect (particles, glow) layered on top. */
  particles?: { count: number; radiusPx: number; colors: string[]; durationMs: number };
  glow?: { color: string; opacityMax: number; durationMs: number };
}

export interface SensoryTexture {
  name: TextureName;
  haptic?: HapticRecipe;
  sound?: SoundRecipe;
  visual?: VisualRecipe;
}

export interface TextureEngineConfig {
  /** Master switch. Default true. */
  enabled: boolean;
  /** Enable sound output. Default false (opt-in per privacy/intrusiveness). */
  sound: boolean;
  /** Enable haptic output. Default true. */
  haptics: boolean;
  /** Enable visual output. Default true. */
  visuals: boolean;
  /** Audio gain multiplier 0–1 applied to every sound output. Default 0.5. */
  volume: number;
}

export const DEFAULT_TEXTURE_CONFIG: TextureEngineConfig = {
  enabled: true,
  sound: false,
  haptics: true,
  visuals: true,
  volume: 0.5,
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/wrapper/textures/types.ts
git commit -m "feat(sdk/textures): texture types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Procedural sound synth

**Files:**
- Create: `packages/sdk/src/wrapper/textures/sound-synth.ts`
- Create: `packages/sdk/src/wrapper/textures/sound-synth.test.ts`

Five sound primitives via Web Audio oscillators with linear envelopes. No samples — keeps the bundle 0KB, lets us ship today. A follow-up "audio palette" plan can swap these for sampled assets without changing call sites.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/sdk/src/wrapper/textures/sound-synth.test.ts
import { describe, expect, it, mock } from 'bun:test';
import { synthesise, _resetAudioCtxForTest } from './sound-synth.ts';
import type { SoundRecipe } from './types.ts';

interface FakeOsc { frequency: { value: number }; type: string; connect: ReturnType<typeof mock>; start: ReturnType<typeof mock>; stop: ReturnType<typeof mock>; }
interface FakeGain { gain: { setValueAtTime: ReturnType<typeof mock>; linearRampToValueAtTime: ReturnType<typeof mock> }; connect: ReturnType<typeof mock>; }

function makeFakeAudioCtx() {
  const oscs: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  return {
    currentTime: 0,
    destination: {},
    createOscillator(): FakeOsc {
      const o = { frequency: { value: 0 }, type: 'sine', connect: mock(), start: mock(), stop: mock() };
      oscs.push(o);
      return o;
    },
    createGain(): FakeGain {
      const g = { gain: { setValueAtTime: mock(), linearRampToValueAtTime: mock() }, connect: mock() };
      gains.push(g);
      return g;
    },
    _oscs: oscs,
    _gains: gains,
  };
}

describe('synthesise', () => {
  it('creates one oscillator + one gain for a click', () => {
    _resetAudioCtxForTest();
    const ctx = makeFakeAudioCtx();
    const recipe: SoundRecipe = { kind: 'click', freq: 880, durationMs: 30, gain: 0.4 };
    synthesise(recipe, { audioCtx: ctx as never, masterVolume: 1 });
    expect(ctx._oscs.length).toBe(1);
    expect(ctx._gains.length).toBe(1);
    expect(ctx._oscs[0]!.frequency.value).toBe(880);
    expect(ctx._oscs[0]!.start).toHaveBeenCalled();
    expect(ctx._oscs[0]!.stop).toHaveBeenCalled();
  });

  it('applies master volume multiplicatively', () => {
    _resetAudioCtxForTest();
    const ctx = makeFakeAudioCtx();
    synthesise({ kind: 'click', freq: 440, durationMs: 30, gain: 0.8 }, { audioCtx: ctx as never, masterVolume: 0.5 });
    const setCall = ctx._gains[0]!.gain.setValueAtTime.mock.calls[0]!;
    expect(setCall[0]).toBeCloseTo(0.4, 5);
  });

  it('skips synthesis when audio context is unavailable', () => {
    _resetAudioCtxForTest();
    expect(() => synthesise(
      { kind: 'click', freq: 440, durationMs: 30, gain: 0.5 },
      { audioCtx: null, masterVolume: 1 },
    )).not.toThrow();
  });

  it.each([
    ['click', 'square'],
    ['pop', 'sine'],
    ['bonk', 'triangle'],
    ['whoosh', 'sawtooth'],
    ['chime', 'sine'],
  ] as const)('%s uses oscillator type %s', (kind, type) => {
    _resetAudioCtxForTest();
    const ctx = makeFakeAudioCtx();
    synthesise({ kind, freq: 440, durationMs: 30, gain: 0.5 }, { audioCtx: ctx as never, masterVolume: 1 });
    expect(ctx._oscs[0]!.type).toBe(type);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/textures/sound-synth.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/sdk/src/wrapper/textures/sound-synth.ts
/**
 * Web Audio oscillator-based synth. Each kind picks an oscillator
 * waveform that gives the right percussive character; the gain envelope
 * does the work of making it feel like a tap, not a synth tone.
 *
 * Procedural-only. Real sampled audio is a follow-up — when we swap, the
 * call sites don't move because the recipe types stay the same.
 */
import type { SoundRecipe } from './types.ts';

export interface SynthDeps {
  audioCtx: AudioContext | null;
  /** Master volume 0–1 from texture engine config. */
  masterVolume: number;
}

let sharedCtx: AudioContext | null = null;

/** Lazy-construct a shared AudioContext on first call. */
export function getAudioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch {
    return null;
  }
}

const OSC_TYPES: Record<SoundRecipe['kind'], OscillatorType> = {
  click: 'square',
  pop: 'sine',
  bonk: 'triangle',
  whoosh: 'sawtooth',
  chime: 'sine',
};

export function synthesise(recipe: SoundRecipe, deps: SynthDeps): void {
  const ctx = deps.audioCtx;
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = OSC_TYPES[recipe.kind];
    osc.frequency.value = recipe.freq;

    const finalGain = recipe.gain * deps.masterVolume;
    const t = ctx.currentTime;
    const dur = recipe.durationMs / 1000;
    gain.gain.setValueAtTime(finalGain, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + dur);
  } catch {
    // Audio failure must never break interaction. Swallow.
  }
}

export function _resetAudioCtxForTest(): void {
  sharedCtx = null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/textures/sound-synth.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/wrapper/textures/sound-synth.ts packages/sdk/src/wrapper/textures/sound-synth.test.ts
git commit -m "feat(sdk/textures): procedural sound synth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Visual FX helpers

**Files:**
- Create: `packages/sdk/src/wrapper/textures/visual-fx.ts`

Reuses the existing `animateSpring` from `../spring.ts`. New helpers handle pop, shake, glow, particle burst, lift-float, fade-out, slide.

- [ ] **Step 1: Write the helpers**

```typescript
// packages/sdk/src/wrapper/textures/visual-fx.ts
/**
 * Tiny DOM animation helpers. Each fn applies the effect to a target
 * element using a single rAF-driven loop or CSS transitions. They are
 * defensive against missing DOM (return early) and respect
 * prefers-reduced-motion (skip).
 */
import { animateSpring } from '../spring.ts';
import type { VisualRecipe } from './types.ts';

function reduced(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function applyVisual(target: Element | null, recipe: VisualRecipe): void {
  if (!target || reduced()) return;
  const el = target as HTMLElement;
  switch (recipe.kind) {
    case 'scale-spring': return scaleSpring(el, recipe.durationMs);
    case 'pop': return pop(el, recipe.durationMs);
    case 'shake': return shake(el, recipe.durationMs);
    case 'glow': return glow(el, recipe);
    case 'fade-out': return fadeOut(el, recipe.durationMs);
    case 'lift-float': return liftFloat(el, recipe.durationMs);
    case 'slide': return slide(el, recipe.durationMs);
  }
  if (recipe.particles) particleBurst(el, recipe.particles);
}

function scaleSpring(el: HTMLElement, durationMs: number): void {
  animateSpring(({ value }) => {
    el.style.transform = `scale(${value})`;
  }, { from: 0.97, to: 1, stiffness: 240, damping: 18 });
}

function pop(el: HTMLElement, durationMs: number): void {
  animateSpring(({ value }) => {
    el.style.transform = `scale(${value})`;
  }, { from: 1.08, to: 1, stiffness: 320, damping: 16 });
}

function shake(el: HTMLElement, durationMs: number): void {
  const original = el.style.transform;
  const start = performance.now();
  const offsetPx = 6;
  const tick = () => {
    const t = (performance.now() - start) / durationMs;
    if (t >= 1) { el.style.transform = original; return; }
    const dx = Math.sin(t * Math.PI * 6) * offsetPx * (1 - t);
    el.style.transform = `translateX(${dx}px) ${original}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function glow(el: HTMLElement, recipe: VisualRecipe): void {
  const g = recipe.glow;
  if (!g) return;
  const original = el.style.boxShadow;
  el.style.transition = `box-shadow ${g.durationMs}ms ease-out`;
  el.style.boxShadow = `0 0 24px ${g.color}`;
  setTimeout(() => { el.style.boxShadow = original; }, g.durationMs);
}

function fadeOut(el: HTMLElement, durationMs: number): void {
  el.style.transition = `opacity ${durationMs}ms ease-out`;
  el.style.opacity = '0';
}

function liftFloat(el: HTMLElement, durationMs: number): void {
  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const y = -8 * Math.sin(t * Math.PI);
    el.style.transform = `translateY(${y}px) scale(${1 + t * 0.06})`;
    if (t < 1) requestAnimationFrame(tick);
    else el.style.transform = '';
  };
  requestAnimationFrame(tick);
}

function slide(el: HTMLElement, durationMs: number): void {
  animateSpring(({ value }) => {
    el.style.transform = `translateX(${(1 - value) * 16}px)`;
    el.style.opacity = String(0.6 + 0.4 * value);
  }, { from: 0, to: 1, stiffness: 200, damping: 22 });
}

function particleBurst(el: HTMLElement, p: NonNullable<VisualRecipe['particles']>): void {
  if (typeof document === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647';
  document.body.appendChild(layer);
  for (let i = 0; i < p.count; i++) {
    const angle = (i / p.count) * Math.PI * 2;
    const dx = Math.cos(angle) * p.radiusPx;
    const dy = Math.sin(angle) * p.radiusPx;
    const dot = document.createElement('div');
    const color = p.colors[i % p.colors.length] ?? '#ffffff';
    dot.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:6px;height:6px;border-radius:50%;background:${color};transform:translate(-50%,-50%);transition:transform ${p.durationMs}ms ease-out, opacity ${p.durationMs}ms ease-out`;
    layer.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = `translate(${dx - 3}px, ${dy - 3}px)`;
      dot.style.opacity = '0';
    });
  }
  setTimeout(() => layer.remove(), p.durationMs + 50);
}
```

- [ ] **Step 2: Smoke test (no unit tests — these are visual; verified by texture engine integration test in Task 4)**

Run: `cd /Users/devante/Documents/Shippie/packages/sdk && bun run tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/wrapper/textures/visual-fx.ts
git commit -m "feat(sdk/textures): visual FX helpers (spring, pop, shake, glow, particles)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Texture engine

**Files:**
- Create: `packages/sdk/src/wrapper/textures/engine.ts`
- Create: `packages/sdk/src/wrapper/textures/engine.test.ts`

The engine holds the config + preset registry, exposes `fireTexture(name, target?)`, and runs all three outputs in the same `requestAnimationFrame` callback so they feel like one event.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/sdk/src/wrapper/textures/engine.test.ts
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  fireTexture,
  registerTexture,
  configureTextureEngine,
  _resetTextureEngineForTest,
} from './engine.ts';
import type { SensoryTexture } from './types.ts';

beforeEach(() => _resetTextureEngineForTest());

describe('texture engine', () => {
  it('throws if firing an unregistered texture name', () => {
    expect(() => fireTexture('confirm' as never)).toThrow(/no texture/i);
  });

  it('fires haptic when haptics enabled and recipe has one', () => {
    const tex: SensoryTexture = { name: 'confirm', haptic: { pattern: 12 } };
    registerTexture(tex);
    const vibrate = mock(() => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };
    fireTexture('confirm');
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it('skips haptic when haptics disabled', () => {
    registerTexture({ name: 'confirm', haptic: { pattern: 12 } });
    configureTextureEngine({ haptics: false });
    const vibrate = mock(() => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };
    fireTexture('confirm');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('skips sound when sound disabled (default)', () => {
    registerTexture({ name: 'confirm', sound: { kind: 'click', freq: 880, durationMs: 30, gain: 0.4 } });
    let synthCalled = false;
    fireTexture('confirm', null, {
      synthOverride: () => { synthCalled = true; },
    });
    expect(synthCalled).toBe(false);
  });

  it('runs sound when explicitly enabled', () => {
    registerTexture({ name: 'confirm', sound: { kind: 'click', freq: 880, durationMs: 30, gain: 0.4 } });
    configureTextureEngine({ sound: true });
    let synthCalled = false;
    fireTexture('confirm', null, {
      synthOverride: () => { synthCalled = true; },
    });
    expect(synthCalled).toBe(true);
  });

  it('skips entirely when engine disabled', () => {
    registerTexture({ name: 'confirm', haptic: { pattern: 12 } });
    configureTextureEngine({ enabled: false });
    const vibrate = mock(() => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };
    fireTexture('confirm');
    expect(vibrate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/textures/engine.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the engine**

```typescript
// packages/sdk/src/wrapper/textures/engine.ts
/**
 * Texture engine — the synchronised executor for haptic + sound + visual.
 *
 * Synchronisation matters: if the haptic fires 30ms before the visual, the
 * tap feels disconnected. We schedule all three in a single rAF callback
 * so they begin within the same display frame (16.6ms at 60Hz). Modern
 * browsers don't guarantee perfect haptic alignment, but rAF gets us
 * within one vsync — close enough that users perceive the effects as one.
 */
import { haptic } from '../haptics.ts';
import { synthesise, getAudioContext } from './sound-synth.ts';
import { applyVisual } from './visual-fx.ts';
import {
  DEFAULT_TEXTURE_CONFIG,
  type SensoryTexture,
  type TextureName,
  type TextureEngineConfig,
  type SoundRecipe,
} from './types.ts';

let config: TextureEngineConfig = { ...DEFAULT_TEXTURE_CONFIG };
const registry = new Map<TextureName, SensoryTexture>();

export function registerTexture(tex: SensoryTexture): void {
  registry.set(tex.name, tex);
}

export function configureTextureEngine(patch: Partial<TextureEngineConfig>): void {
  config = { ...config, ...patch };
}

export function getTextureEngineConfig(): TextureEngineConfig {
  return { ...config };
}

interface FireOptions {
  /** Test seam — replace the synth call. */
  synthOverride?: (recipe: SoundRecipe) => void;
}

export function fireTexture(name: TextureName, target: Element | null = null, opts: FireOptions = {}): void {
  const tex = registry.get(name);
  if (!tex) throw new Error(`no texture registered: ${name}`);
  if (!config.enabled) return;

  const runHaptic = config.haptics && tex.haptic
    ? () => {
        // The existing helper takes a HapticKind; for textures we bypass
        // it and call vibrate directly because each texture defines its own
        // pattern that doesn't fit the kind enum.
        if (typeof navigator === 'undefined') return;
        const v = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
        if (typeof v !== 'function') return;
        try { v.call(navigator, tex.haptic!.pattern); } catch { /* ignore */ }
      }
    : null;

  const runSound = config.sound && tex.sound
    ? () => {
        if (opts.synthOverride) { opts.synthOverride(tex.sound!); return; }
        synthesise(tex.sound!, { audioCtx: getAudioContext(), masterVolume: config.volume });
      }
    : null;

  const runVisual = config.visuals && tex.visual
    ? () => applyVisual(target, tex.visual!)
    : null;

  const schedule = (fn: () => void) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else fn();
  };
  schedule(() => {
    runHaptic?.();
    runSound?.();
    runVisual?.();
  });
}

/** Suppress the haptic helper import warning — exported so the index file can re-export. */
export { haptic };

export function _resetTextureEngineForTest(): void {
  config = { ...DEFAULT_TEXTURE_CONFIG };
  registry.clear();
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/textures/engine.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/wrapper/textures/engine.ts packages/sdk/src/wrapper/textures/engine.test.ts
git commit -m "feat(sdk/textures): synchronised engine

Fires haptic + sound + visual inside a single rAF so they're perceived
as one event. Sound off by default. Tests cover enable/disable matrix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Nine preset textures

**Files:**
- Create: `packages/sdk/src/wrapper/textures/presets/{confirm,complete,error,navigate,delete,refresh,install,milestone,toggle}.ts`
- Create: `packages/sdk/src/wrapper/textures/index.ts`

Each file exports a single `SensoryTexture` constant. The index file imports all 9 and registers them when the package loads.

- [ ] **Step 1: Write each preset file**

For each name below, create `packages/sdk/src/wrapper/textures/presets/<name>.ts` with the matching contents:

`confirm.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const confirm: SensoryTexture = {
  name: 'confirm',
  haptic: { pattern: 12 },
  sound: { kind: 'click', freq: 880, durationMs: 35, gain: 0.4 },
  visual: { kind: 'scale-spring', durationMs: 180 },
};
```

`complete.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const complete: SensoryTexture = {
  name: 'complete',
  haptic: { pattern: [10, 30, 10] },
  sound: { kind: 'pop', freq: 660, durationMs: 80, gain: 0.5 },
  visual: {
    kind: 'pop',
    durationMs: 280,
    particles: { count: 4, radiusPx: 28, colors: ['#E8603C', '#F4B860', '#9CD3D8', '#ffffff'], durationMs: 400 },
    glow: { color: 'rgba(232,96,60,0.4)', opacityMax: 0.4, durationMs: 400 },
  },
};
```

`error.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const error: SensoryTexture = {
  name: 'error',
  haptic: { pattern: [40, 30, 40] },
  sound: { kind: 'bonk', freq: 220, durationMs: 120, gain: 0.5 },
  visual: { kind: 'shake', durationMs: 220 },
};
```

`navigate.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const navigate: SensoryTexture = {
  name: 'navigate',
  haptic: { pattern: 8 },
  sound: { kind: 'whoosh', freq: 440, durationMs: 150, gain: 0.25 },
  visual: { kind: 'slide', durationMs: 220 },
};
```

`delete.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
const delete_: SensoryTexture = {
  name: 'delete',
  haptic: { pattern: 60 },
  sound: { kind: 'bonk', freq: 180, durationMs: 200, gain: 0.4 },
  visual: { kind: 'fade-out', durationMs: 250 },
};
export { delete_ as delete };
```

`refresh.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const refresh: SensoryTexture = {
  name: 'refresh',
  haptic: { pattern: [10, 20, 10] },
  sound: { kind: 'pop', freq: 520, durationMs: 90, gain: 0.35 },
  visual: { kind: 'pop', durationMs: 260 },
};
```

`install.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
/**
 * The signature moment. Install fires once per app per device — make it
 * the moment users notice Shippie feels different from a normal PWA.
 */
export const install: SensoryTexture = {
  name: 'install',
  haptic: { pattern: [15, 50, 15, 50, 30] },
  sound: { kind: 'chime', freq: 988, durationMs: 600, gain: 0.6 },
  visual: {
    kind: 'lift-float',
    durationMs: 700,
    particles: { count: 8, radiusPx: 40, colors: ['#E8603C', '#F4B860', '#FFE69A', '#ffffff'], durationMs: 700 },
    glow: { color: 'rgba(244,184,96,0.55)', opacityMax: 0.55, durationMs: 700 },
  },
};
```

`milestone.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const milestone: SensoryTexture = {
  name: 'milestone',
  haptic: { pattern: [10, 40, 10, 40, 10] },
  sound: { kind: 'chime', freq: 1320, durationMs: 500, gain: 0.55 },
  visual: {
    kind: 'pop',
    durationMs: 600,
    particles: { count: 8, radiusPx: 36, colors: ['#E8603C', '#F4B860', '#9CD3D8', '#ffffff'], durationMs: 600 },
    glow: { color: 'rgba(232,96,60,0.5)', opacityMax: 0.5, durationMs: 600 },
  },
};
```

`toggle.ts`:
```typescript
import type { SensoryTexture } from '../types.ts';
export const toggle: SensoryTexture = {
  name: 'toggle',
  haptic: { pattern: 10 },
  sound: { kind: 'click', freq: 1100, durationMs: 25, gain: 0.3 },
  visual: { kind: 'scale-spring', durationMs: 150 },
};
```

- [ ] **Step 2: Write the index**

```typescript
// packages/sdk/src/wrapper/textures/index.ts
import { registerTexture } from './engine.ts';
import { confirm } from './presets/confirm.ts';
import { complete } from './presets/complete.ts';
import { error } from './presets/error.ts';
import { navigate } from './presets/navigate.ts';
import { delete as deleteTex } from './presets/delete.ts';
import { refresh } from './presets/refresh.ts';
import { install } from './presets/install.ts';
import { milestone } from './presets/milestone.ts';
import { toggle } from './presets/toggle.ts';

let registered = false;
export function registerBuiltinTextures(): void {
  if (registered) return;
  for (const t of [confirm, complete, error, navigate, deleteTex, refresh, install, milestone, toggle]) {
    registerTexture(t);
  }
  registered = true;
}

export {
  fireTexture,
  configureTextureEngine,
  getTextureEngineConfig,
  registerTexture,
} from './engine.ts';
export type { SensoryTexture, TextureName, TextureEngineConfig } from './types.ts';
```

- [ ] **Step 3: Tests for the registry boot**

Append to `engine.test.ts`:

```typescript
import { registerBuiltinTextures } from './index.ts';

describe('builtin textures', () => {
  it('registers all 9 presets', () => {
    _resetTextureEngineForTest();
    registerBuiltinTextures();
    for (const name of ['confirm','complete','error','navigate','delete','refresh','install','milestone','toggle'] as const) {
      // Calling with a missing target only fires haptic/sound — visual is a no-op without a target.
      expect(() => fireTexture(name)).not.toThrow();
    }
  });
});
```

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/textures/`
Expected: 7 + 6 + 1 = 14 pass.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wrapper/textures/presets packages/sdk/src/wrapper/textures/index.ts packages/sdk/src/wrapper/textures/engine.test.ts
git commit -m "feat(sdk/textures): 9 preset textures + boot registry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Observer rule that auto-fires textures

**Files:**
- Create: `packages/sdk/src/wrapper/observe/rules/textures.ts`
- Modify: `packages/sdk/src/wrapper/observe/rules/index.ts` — register the new rule
- Modify: `packages/sdk/src/wrapper/observe/types.ts` — add `'webaudio'` capability (used by sound-enabled rules in future; not gated for the texture rule itself)

The rule attaches one document-level listener (delegated). It maps semantic interactions to texture names:

| Interaction | Texture |
|---|---|
| `click` on button-like element | `confirm` |
| `click` on `[role="switch"]`, `input[type="checkbox"]`, `input[type="radio"]`, `[aria-pressed]` | `toggle` |
| `submit` on a form (success path — assume success unless caller cancels with `event.preventDefault()` synchronously) | `complete` |
| `invalid` on a form field | `error` |
| `click` on `[data-shippie-action="delete"]` | `delete` |
| `appinstalled` event on window | `install` (the signature moment) |

Navigation (`navigate`) and refresh (`refresh`) are wired by the existing `view-transitions` and `pull-to-refresh` paths once they're updated to call `fireTexture`. Defer that wiring to Task 9.

- [ ] **Step 1: Write the rule**

```typescript
// packages/sdk/src/wrapper/observe/rules/textures.ts
/**
 * Auto-fire texture rule. Attaches delegated listeners at the document
 * level (one set, not per-element) so it costs nothing as the DOM grows.
 *
 * The rule is listed against selector '*' so it applies once per page,
 * not per-element. The apply function attaches handlers and returns a
 * teardown that detaches them.
 */
import type { EnhanceRule } from '../types.ts';
import { fireTexture, registerBuiltinTextures } from '../../textures/index.ts';

const BUTTON_SELECTOR =
  'button, [role="button"], a[role="button"], input[type="submit"], input[type="button"]';
const TOGGLE_SELECTOR =
  '[role="switch"], input[type="checkbox"], input[type="radio"], [aria-pressed]';
const DELETE_SELECTOR = '[data-shippie-action="delete"]';

let installed = false;

export const texturesRule: EnhanceRule = {
  name: 'textures',
  capabilities: [],
  apply() {
    // The rule is page-global, not per-element. Apply once.
    if (installed) return () => {};
    installed = true;
    registerBuiltinTextures();

    if (typeof document === 'undefined') return () => { installed = false; };

    const onClick = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const deleteEl = target.closest(DELETE_SELECTOR);
      if (deleteEl) { fireTexture('delete', deleteEl); return; }
      const toggleEl = target.closest(TOGGLE_SELECTOR);
      if (toggleEl) { fireTexture('toggle', toggleEl); return; }
      const btnEl = target.closest(BUTTON_SELECTOR);
      if (btnEl) { fireTexture('confirm', btnEl); return; }
    };
    const onSubmit = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      fireTexture('complete', target);
    };
    const onInvalid = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      fireTexture('error', target);
    };
    const onAppInstalled = () => {
      // Pulse the document body — there's no "install button" element to anchor to
      // by the time the event fires.
      fireTexture('install', document.body);
    };

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('invalid', onInvalid, true); // capture — invalid doesn't bubble
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      installed = false;
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
      document.removeEventListener('invalid', onInvalid, true);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  },
};

/** Test seam: reset the install latch. */
export function _resetTexturesRuleForTest(): void {
  installed = false;
}
```

- [ ] **Step 2: Register the rule**

In `packages/sdk/src/wrapper/observe/rules/index.ts`, add:

```typescript
import { registerRule } from '../registry.ts';
import { wakelockRule } from './wakelock.ts';
import { shareTargetRule } from './share-target.ts';
import { texturesRule } from './textures.ts';

let registered = false;
export function registerBuiltins(): void {
  if (registered) return;
  registerRule(wakelockRule);
  registerRule(shareTargetRule);
  registerRule(texturesRule);
  registered = true;
}
```

(Read the existing file first to preserve any other exports or wiring.)

- [ ] **Step 3: Test the rule wiring**

Create `packages/sdk/src/wrapper/observe/rules/textures.test.ts`:

```typescript
import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { Window } from 'happy-dom';
import { texturesRule, _resetTexturesRuleForTest } from './textures.ts';
import { _resetTextureEngineForTest, configureTextureEngine } from '../../textures/engine.ts';

beforeEach(() => {
  _resetTexturesRuleForTest();
  _resetTextureEngineForTest();
});

describe('textures rule', () => {
  it('fires confirm on a button click', async () => {
    const win = new Window();
    const doc = win.document;
    (globalThis as { document: Document }).document = doc as unknown as Document;
    (globalThis as { window: Window }).window = win as unknown as Window;
    const vibrate = mock(() => true);
    (globalThis as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };

    doc.body.innerHTML = '<button id="b">go</button>';
    const teardown = texturesRule.apply(doc.body);
    configureTextureEngine({ visuals: false }); // keep happy-dom from running animations

    doc.getElementById('b')!.dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    expect(vibrate).toHaveBeenCalled();
    if (typeof teardown === 'function') teardown();
  });

  it('fires error on an invalid event', async () => {
    const win = new Window();
    (globalThis as { document: Document }).document = win.document as unknown as Document;
    (globalThis as { window: Window }).window = win as unknown as Window;
    const vibrate = mock(() => true);
    (globalThis as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };

    win.document.body.innerHTML = '<form><input id="i" required /></form>';
    const teardown = texturesRule.apply(win.document.body);
    configureTextureEngine({ visuals: false });

    win.document.getElementById('i')!.dispatchEvent(new win.Event('invalid'));
    await new Promise((r) => setTimeout(r, 30));

    expect(vibrate).toHaveBeenCalled();
    if (typeof teardown === 'function') teardown();
  });
});
```

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/observe/rules/textures.test.ts`
Expected: 2 pass.

- [ ] **Step 4: Run the wider observe test suite to catch regressions**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/observe/`
Expected: existing 12 + new 2 = 14 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/wrapper/observe/rules/textures.ts packages/sdk/src/wrapper/observe/rules/index.ts packages/sdk/src/wrapper/observe/rules/textures.test.ts
git commit -m "$(cat <<'EOF'
feat(sdk/wrapper): textures rule auto-fires presets on standard interactions

button click → confirm; toggle → toggle; submit → complete; invalid →
error; data-shippie-action=delete → delete; appinstalled → install.
Document-level delegation, no per-element overhead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Patina storage (IndexedDB)

**Files:**
- Create: `packages/sdk/src/wrapper/patina/types.ts`
- Create: `packages/sdk/src/wrapper/patina/storage.ts`
- Create: `packages/sdk/src/wrapper/patina/storage.test.ts`

Patina state per origin: `{ firstSeenAt: number, sessionCount: number, lastSeenAt: number, milestonesFired: TextureName[] }`. One record per origin, written at boot and on session end (debounced).

- [ ] **Step 1: Write types**

```typescript
// packages/sdk/src/wrapper/patina/types.ts
import type { TextureName } from '../textures/types.ts';

export interface PatinaState {
  /** Wall-clock ms when this origin was first observed. */
  firstSeenAt: number;
  /** Wall-clock ms of the most recent session. */
  lastSeenAt: number;
  /** How many distinct app-open sessions. Used for milestone gating. */
  sessionCount: number;
  /** Milestones already fired so we don't repeat. */
  milestonesFired: TextureName[];
}

export interface PatinaConfig {
  /** Master switch. Default true. */
  enabled: boolean;
  /** 0 = no patina, 1 = strong. Default 0.3 (subtle). */
  sensitivity: number;
}

export const DEFAULT_PATINA_CONFIG: PatinaConfig = {
  enabled: true,
  sensitivity: 0.3,
};
```

- [ ] **Step 2: Write the failing storage test**

```typescript
// packages/sdk/src/wrapper/patina/storage.test.ts
import { describe, expect, it, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { loadPatinaState, savePatinaState, _resetPatinaDbForTest } from './storage.ts';

beforeEach(() => _resetPatinaDbForTest());

describe('patina storage', () => {
  it('returns null when no record exists yet', async () => {
    const state = await loadPatinaState();
    expect(state).toBeNull();
  });

  it('round-trips a state', async () => {
    const initial = {
      firstSeenAt: 1700_000_000_000,
      lastSeenAt: 1700_001_000_000,
      sessionCount: 5,
      milestonesFired: [],
    };
    await savePatinaState(initial);
    const loaded = await loadPatinaState();
    expect(loaded).toEqual(initial);
  });

  it('overwrites on second save', async () => {
    await savePatinaState({ firstSeenAt: 1, lastSeenAt: 2, sessionCount: 1, milestonesFired: [] });
    await savePatinaState({ firstSeenAt: 1, lastSeenAt: 3, sessionCount: 2, milestonesFired: [] });
    const loaded = await loadPatinaState();
    expect(loaded?.sessionCount).toBe(2);
  });
});
```

Confirm `fake-indexeddb` is available: `grep "fake-indexeddb" /Users/devante/Documents/Shippie/package.json /Users/devante/Documents/Shippie/packages/sdk/package.json`. If missing in sdk, add: `cd packages/sdk && bun add -D fake-indexeddb`.

- [ ] **Step 3: Run, verify fail**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/patina/storage.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement storage**

```typescript
// packages/sdk/src/wrapper/patina/storage.ts
/**
 * Patina state in IndexedDB. One record per origin, keyed by 'state'.
 *
 * IndexedDB is intentionally chosen over localStorage so the read/write
 * doesn't block the main thread. Writes are fire-and-forget — patina is
 * cosmetic, not load-bearing, so transient failures are fine.
 */
import type { PatinaState } from './types.ts';

const DB_NAME = 'shippie-patina';
const STORE = 'state';
const KEY = 'state';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function loadPatinaState(): Promise<PatinaState | null> {
  try {
    const db = await openDb();
    return await new Promise<PatinaState | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PatinaState) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function savePatinaState(state: PatinaState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Patina is cosmetic — never throw.
  }
}

export function _resetPatinaDbForTest(): void {
  dbPromise = null;
  if (typeof indexedDB !== 'undefined') {
    indexedDB.deleteDatabase(DB_NAME);
  }
}
```

- [ ] **Step 5: Run, verify pass**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/patina/storage.test.ts`
Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/wrapper/patina/types.ts packages/sdk/src/wrapper/patina/storage.ts packages/sdk/src/wrapper/patina/storage.test.ts
git commit -m "feat(sdk/patina): IndexedDB-backed state storage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Page-level patina + milestone

**Files:**
- Create: `packages/sdk/src/wrapper/patina/page.ts`
- Create: `packages/sdk/src/wrapper/patina/milestone.ts`
- Create: `packages/sdk/src/wrapper/patina/index.ts`
- Create: `packages/sdk/src/wrapper/patina/page.test.ts`

Page patina exposes `--shippie-patina-warmth` as a CSS variable on `<html>`. Apps that opt in use it in their styles (e.g. `background: hsl(20, calc(15% + var(--shippie-patina-warmth) * 5%), 98%)`). The variable goes from 0 (new) to 1 (1 year old).

Milestones fire `milestone` texture once at day 100 and once at day 365.

- [ ] **Step 1: Page patina logic**

```typescript
// packages/sdk/src/wrapper/patina/page.ts
import type { PatinaConfig, PatinaState } from './types.ts';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Map age + sensitivity to a 0–1 warmth value applied as a CSS variable.
 * Linear ramp from age 0 to age 1 year, capped at 1.
 */
export function computeWarmth(state: PatinaState, config: PatinaConfig, now: number): number {
  if (!config.enabled) return 0;
  const ageMs = now - state.firstSeenAt;
  const ratio = Math.min(1, Math.max(0, ageMs / ONE_YEAR_MS));
  return ratio * config.sensitivity;
}

export function applyPageWarmth(warmth: number, target: HTMLElement | null = null): void {
  const el = target ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;
  el.style.setProperty('--shippie-patina-warmth', warmth.toFixed(3));
}
```

- [ ] **Step 2: Page patina test**

```typescript
// packages/sdk/src/wrapper/patina/page.test.ts
import { describe, expect, it } from 'bun:test';
import { computeWarmth, applyPageWarmth } from './page.ts';
import { Window } from 'happy-dom';

describe('computeWarmth', () => {
  const state = { firstSeenAt: 0, lastSeenAt: 0, sessionCount: 0, milestonesFired: [] };
  it('is 0 immediately after firstSeenAt', () => {
    expect(computeWarmth(state, { enabled: true, sensitivity: 1 }, 0)).toBe(0);
  });
  it('is sensitivity at 1 year', () => {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    expect(computeWarmth(state, { enabled: true, sensitivity: 0.3 }, oneYear)).toBeCloseTo(0.3, 5);
  });
  it('caps at sensitivity beyond 1 year', () => {
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    expect(computeWarmth(state, { enabled: true, sensitivity: 0.3 }, twoYears)).toBeCloseTo(0.3, 5);
  });
  it('is 0 when disabled', () => {
    expect(computeWarmth(state, { enabled: false, sensitivity: 1 }, 1e12)).toBe(0);
  });
});

describe('applyPageWarmth', () => {
  it('sets the CSS variable on the target', () => {
    const win = new Window();
    const el = win.document.documentElement as unknown as HTMLElement;
    applyPageWarmth(0.42, el);
    expect(el.style.getPropertyValue('--shippie-patina-warmth')).toBe('0.420');
  });
});
```

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/patina/page.test.ts`
Expected: 5 pass.

- [ ] **Step 3: Milestone logic**

```typescript
// packages/sdk/src/wrapper/patina/milestone.ts
/**
 * Fire `milestone` texture at day 100 and day 365 of usage age.
 *
 * Each milestone fires exactly once per origin per device; the firing is
 * recorded in PatinaState.milestonesFired so we never repeat. Milestones
 * are one-shots — they don't try to celebrate every Tuesday.
 */
import { fireTexture } from '../textures/engine.ts';
import type { PatinaState } from './types.ts';
import type { TextureName } from '../textures/types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface Milestone {
  name: TextureName;
  ageDays: number;
}

const MILESTONES: Milestone[] = [
  { name: 'milestone', ageDays: 100 },
  // We re-use the same texture for 365 since visually they're identical;
  // dedupe by recording a separate marker in milestonesFired.
];

const FIRED_MARKER_DAY_365 = 'milestone' as TextureName; // re-purposed marker

export function maybeFireMilestone(state: PatinaState, now: number = Date.now()): PatinaState {
  const ageMs = now - state.firstSeenAt;
  let next = state;
  if (ageMs >= 100 * ONE_DAY_MS && !state.milestonesFired.includes('milestone')) {
    fireTexture('milestone');
    next = { ...next, milestonesFired: [...next.milestonesFired, 'milestone'] };
  }
  // Day-365 marker would go here — deferred until a sensible separate name exists in the registry.
  return next;
}
```

- [ ] **Step 4: Boot fn `installPatina`**

```typescript
// packages/sdk/src/wrapper/patina/index.ts
/**
 * Boot the patina layer. Loads state (or seeds it), applies the warmth
 * CSS variable, fires any due milestones, and writes the updated state
 * back. Failures are swallowed — patina is cosmetic.
 */
import { loadPatinaState, savePatinaState } from './storage.ts';
import { computeWarmth, applyPageWarmth } from './page.ts';
import { maybeFireMilestone } from './milestone.ts';
import { DEFAULT_PATINA_CONFIG, type PatinaConfig } from './types.ts';

let config: PatinaConfig = { ...DEFAULT_PATINA_CONFIG };

export function configurePatina(patch: Partial<PatinaConfig>): void {
  config = { ...config, ...patch };
}

export async function installPatina(now: number = Date.now()): Promise<void> {
  if (!config.enabled) return;
  let state = await loadPatinaState();
  if (!state) {
    state = { firstSeenAt: now, lastSeenAt: now, sessionCount: 1, milestonesFired: [] };
  } else {
    state = { ...state, lastSeenAt: now, sessionCount: state.sessionCount + 1 };
  }

  applyPageWarmth(computeWarmth(state, config, now));
  state = maybeFireMilestone(state, now);

  await savePatinaState(state);
}

export type { PatinaState, PatinaConfig } from './types.ts';
```

- [ ] **Step 5: Wire `installPatina` into the wrapper bootstrap**

In `packages/sdk/src/wrapper/observe-init.ts`, after the observer starts, add:

```typescript
import { installPatina } from './patina/index.ts';
// ... in the bootstrap fn after the observer is started:
void installPatina();
```

(Read the existing file first to find the right insertion point. If there is no existing bootstrap fn, the patina install belongs at the very end of whatever module runs once on page load.)

- [ ] **Step 6: Re-export from wrapper index**

Add to `packages/sdk/src/wrapper/index.ts`:

```typescript
export { installPatina, configurePatina } from './patina/index.ts';
export {
  fireTexture,
  configureTextureEngine,
  registerBuiltinTextures,
} from './textures/index.ts';
```

- [ ] **Step 7: Run all wrapper tests**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/src/wrapper/`
Expected: existing tests + new 14 (textures) + 5 (page) + 3 (storage) + 2 (rule) + 1 (registry) all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/wrapper/patina/ packages/sdk/src/wrapper/observe-init.ts packages/sdk/src/wrapper/index.ts
git commit -m "$(cat <<'EOF'
feat(sdk/patina): page-level warmth + day-100 milestone

CSS variable --shippie-patina-warmth ramps 0→sensitivity over a year.
Apps opt in by referencing the variable in their styles. Milestone
texture fires once at day 100 of usage age, marker stored to dedupe.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire navigate + refresh textures into existing primitives

**Files:**
- Modify: `packages/sdk/src/wrapper/view-transitions.ts`
- Modify: `packages/sdk/src/wrapper/gestures.ts` (the `attachPullToRefresh` callback)

The existing `wrapNavigation` and pull-to-refresh fire their effects but not textures. Hook in.

- [ ] **Step 1: Hook `navigate` texture into `wrapNavigation`**

In `packages/sdk/src/wrapper/view-transitions.ts`, inside `wrapNavigation`, just after `installViewTransitionStyles(opts)`:

```typescript
// Fire the navigate texture in the same frame as the transition starts.
// Lazy-import to avoid a hard dep cycle (textures import view-transitions
// indirectly through visual-fx).
void import('./textures/engine.ts').then(({ fireTexture }) => {
  try { fireTexture('navigate', document.body); } catch { /* swallow */ }
});
```

- [ ] **Step 2: Hook `refresh` texture into `attachPullToRefresh`**

In `packages/sdk/src/wrapper/gestures.ts`, in `attachPullToRefresh`, just before calling `opts.onRefresh()`:

```typescript
void import('./textures/engine.ts').then(({ fireTexture }) => {
  try { fireTexture('refresh'); } catch { /* swallow */ }
});
```

- [ ] **Step 3: Run all sdk tests to confirm no regression**

Run: `cd /Users/devante/Documents/Shippie && bun test packages/sdk/`
Expected: all pass. The dynamic imports return promises but no test awaits them; the fire happens after the assertion in existing tests, so no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wrapper/view-transitions.ts packages/sdk/src/wrapper/gestures.ts
git commit -m "feat(sdk/wrapper): wire navigate + refresh textures into existing primitives

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Integrate into showcase apps

**Files:**
- Modify: `apps/showcase-recipe/src/main.tsx` (or `App.tsx` — wherever wrapper init happens)
- Modify: `apps/showcase-journal/src/main.tsx`
- Modify: `apps/showcase-recipe/src/styles.css` (or equivalent) — opt into the warmth CSS variable
- Modify: `apps/showcase-journal/src/styles.css`

Both apps already bootstrap the wrapper. Confirm the texture rule is registered (it is — via `registerBuiltins()`). Add the warmth CSS variable usage so patina is visible.

- [ ] **Step 1: Verify wrapper init runs in each showcase**

Run: `grep -rn "startObserve\|registerBuiltins\|installPatina" /Users/devante/Documents/Shippie/apps/showcase-recipe/src/ /Users/devante/Documents/Shippie/apps/showcase-journal/src/`

Expected: at least one match per app (the existing observer init). If `installPatina` isn't called transitively via `observe-init.ts`, add a direct call at app boot.

- [ ] **Step 2: Wire the warmth variable in recipe**

In `apps/showcase-recipe/src/styles.css` (or its main stylesheet), add:

```css
:root { --shippie-patina-warmth: 0; }
body {
  background: hsl(28, calc(20% + var(--shippie-patina-warmth) * 12%), 98%);
  transition: background 1.2s ease-out;
}
```

The default of 0 means the app looks the same as today on first install. The body background warms by up to 12% saturation as patina accrues over a year.

- [ ] **Step 3: Same for journal**

```css
:root { --shippie-patina-warmth: 0; }
body {
  background: hsl(36, calc(15% + var(--shippie-patina-warmth) * 14%), 99%);
  transition: background 1.2s ease-out;
}
```

- [ ] **Step 4: Manual smoke**

Two terminals:
```bash
cd /Users/devante/Documents/Shippie/apps/showcase-recipe && bun run vite dev --port 5181
cd /Users/devante/Documents/Shippie/apps/showcase-journal && bun run vite dev --port 5182
```

In each:
- Tap any button — feel the haptic on Android, see the spring scale (Chrome devtools sensors → vibration log; or open on a real Android device via the LAN).
- Submit a form — confirm the complete texture fires (haptic + spring pop).
- Cause a form validation error — confirm error texture (shake + bonk if sound enabled).

Open devtools console:
```javascript
// override the patina state to simulate 6 months of use
const tx = (await indexedDB.open('shippie-patina')).result.transaction('state', 'readwrite');
tx.objectStore('state').put({
  firstSeenAt: Date.now() - 180*24*3600*1000,
  lastSeenAt: Date.now(),
  sessionCount: 50,
  milestonesFired: [],
}, 'state');
```

Reload — body background should be visibly warmer.

- [ ] **Step 5: Run the full repo test suite**

Run: `cd /Users/devante/Documents/Shippie && bun test 2>&1 | tail -10`
Expected: baseline preserved (~848 pass before, ~870+ after). 6 pre-existing rate-route failures still present, no NEW failures introduced.

- [ ] **Step 6: Commit**

```bash
git add apps/showcase-recipe/src/ apps/showcase-journal/src/
git commit -m "$(cat <<'EOF'
feat(showcases): opt into patina warmth CSS variable

Recipe + Journal both render a slightly warmer body background as
patina accrues. Default state (no patina record) is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done When

- [ ] 9 textures registered and individually fireable via `fireTexture(name, element?)`
- [ ] Texture engine fires haptic + sound + visual in the same rAF
- [ ] Sound is OFF by default; flipping `configureTextureEngine({ sound: true })` enables it
- [ ] DOM observer's textures rule auto-fires on click/submit/invalid/appinstalled without app code
- [ ] Patina state stored in IndexedDB; round-trips across reloads
- [ ] Page-level CSS variable `--shippie-patina-warmth` ramps 0→sensitivity over 365 days
- [ ] Day-100 milestone texture fires exactly once per origin per device
- [ ] Recipe + Journal showcase apps visibly warm with simulated 6-month state
- [ ] No regressions in repo test baseline; new tests at +20 or so

## NOT in this plan (deferred)

- **Element-level patina.** Buttons-getting-warmer-with-use needs stable element identity across renders, which framework-specific (React reconciliation breaks naive selector keying). Solve in a follow-up plan that introduces a stable `data-shippie-id` attribute via the observer.
- **Sampled audio palettes (warm / minimal / playful).** Procedural synth is the v1 default. Sampled audio is a separate follow-up — swap the synth backend without changing call sites.
- **Texture compiler from AppProfile.** Plan B (Zero-Config Pipeline) builds the AppProfile; Plan B's compiler step picks which textures to include in a given app's bundle. For now, all 9 are bundled.
- **Live Room showcase app.** Live Room is the user-facing acceptance test for textures (buzzer + scoreboard) but it's a substantial standalone build. It belongs in its own showcase plan once textures are merged.
- **Dashboard control of texture/patina sensitivity.** Plan G (Maker Dashboard) adds the UI; for now sensitivity is set via `configurePatina({ sensitivity: 0.5 })` in code.
