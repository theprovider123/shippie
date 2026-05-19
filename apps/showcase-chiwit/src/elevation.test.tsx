/**
 * Chiwit elevation tests — verify the integration of the showcase-kit-v2
 * primitives without spinning up the full React renderer (which would
 * require happy-dom + react-dom/test-utils boilerplate the rest of the
 * Shippie monorepo deliberately avoids).
 *
 * Coverage (per spec §10 / Brief A test list):
 *   - Onboarding gate writes the correct localStorage key on completion.
 *   - WeeklyShape keepsake `draw` runs against a 2D context without
 *     throwing on a happy-path data shape.
 *   - An intent matcher produces the expected `ToastSpec`.
 */
import { describe, expect, it, beforeEach } from 'bun:test';

import {
  hasCompletedOnboarding,
  markOnboardingComplete,
  resetOnboarding,
} from '@shippie/showcase-kit-v2';
import { MATCHERS, specForKind, AMBIENT_BY_KIND } from './IntentMatchers';
import { WeeklyShape, buildWeekShape, isoWeekCode, type WeekShapeData } from './WeeklyShape';

/* ------------------------------------------------------------------ *
 *  In-memory Storage (Bun's runtime has no DOM by default).          *
 * ------------------------------------------------------------------ */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
  key(index: number) { return Array.from(this.map.keys())[index] ?? null; }
}

/* ------------------------------------------------------------------ *
 *  Minimal CanvasRenderingContext2D stub — records draw ops so the   *
 *  template's drawTrackedText + path ops don't throw.                *
 * ------------------------------------------------------------------ */
class FakeCanvasCtx {
  font = '16px sans-serif';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  ops: string[] = [];

  fillRect() { this.ops.push('fillRect'); }
  fillText() { this.ops.push('fillText'); }
  strokeText() { this.ops.push('strokeText'); }
  beginPath() { this.ops.push('beginPath'); }
  closePath() { this.ops.push('closePath'); }
  moveTo() { this.ops.push('moveTo'); }
  lineTo() { this.ops.push('lineTo'); }
  quadraticCurveTo() { this.ops.push('quadraticCurveTo'); }
  stroke() { this.ops.push('stroke'); }
  fill() { this.ops.push('fill'); }
  arc() { this.ops.push('arc'); }
  rect() { this.ops.push('rect'); }
  measureText(text: string) {
    return { width: text.length * 7 } as TextMetrics;
  }
  createLinearGradient() {
    return {
      addColorStop() { /* no-op */ },
    } as unknown as CanvasGradient;
  }
}

/* ------------------------------------------------------------------ *
 *  Tests                                                              *
 * ------------------------------------------------------------------ */

describe('Chiwit elevation · onboarding gate', () => {
  let store: MemoryStorage;
  beforeEach(() => { store = new MemoryStorage(); });

  it('writes the chiwit-versioned key on completion', () => {
    expect(hasCompletedOnboarding('chiwit', 1, store)).toBe(false);
    markOnboardingComplete('chiwit', 1, store);
    expect(hasCompletedOnboarding('chiwit', 1, store)).toBe(true);
    // The key is `shippie:onboarding:<slug>:v` per the kit's useFirstRun.
    expect(store.getItem('shippie:onboarding:chiwit:v')).toBe('1');
  });

  it('re-runs onboarding when version bumps past stored value', () => {
    markOnboardingComplete('chiwit', 1, store);
    expect(hasCompletedOnboarding('chiwit', 2, store)).toBe(false);
  });

  it('resetOnboarding clears the key', () => {
    markOnboardingComplete('chiwit', 1, store);
    resetOnboarding('chiwit', store);
    expect(hasCompletedOnboarding('chiwit', 1, store)).toBe(false);
  });
});

describe('Chiwit elevation · WeeklyShape keepsake', () => {
  function makeData(): WeekShapeData {
    return buildWeekShape({
      days: [
        { date: '2026-05-11', pulse: 62, signalCount: 4 },
        { date: '2026-05-12', pulse: 70, signalCount: 5 },
        { date: '2026-05-13', pulse: 55, signalCount: 3 },
        { date: '2026-05-14', pulse: 78, signalCount: 6 },
        { date: '2026-05-15', pulse: 64, signalCount: 4 },
        { date: '2026-05-16', pulse: 71, signalCount: 5 },
        { date: '2026-05-17', pulse: 68, signalCount: 0 },
      ],
      factors: [
        { label: 'Foundations', value: 70 },
        { label: 'Recovery',    value: 64 },
        { label: 'Movement',    value: 55 },
        { label: 'Mind',        value: 73 },
        { label: 'Body',        value: 60 },
      ],
      signalCount: 27,
      weekStartISO: '2026-05-11',
      weekEndISO:   '2026-05-17',
      pulseAverage: 67,
    });
  }

  it('draws onto a 2D context without throwing for a happy-path shape', () => {
    const ctx = new FakeCanvasCtx() as unknown as CanvasRenderingContext2D;
    const data = makeData();
    expect(() => WeeklyShape(ctx, data, 1080, 1350)).not.toThrow();
    // Sanity: some text + a few rects + the ribbon got painted.
    const ops = (ctx as unknown as FakeCanvasCtx).ops;
    expect(ops.includes('fillText')).toBe(true);
    expect(ops.includes('fillRect')).toBe(true);
    expect(ops.filter((o) => o === 'fill').length).toBeGreaterThan(0);
  });

  it('builds a "WEEK OF …" label and a chiwit/wk-YYYY-WW footer', () => {
    const data = makeData();
    expect(data.weekLabel.startsWith('WEEK OF ')).toBe(true);
    expect(data.footerCode).toBe(`chiwit/wk-${isoWeekCode('2026-05-11')}`);
    expect(data.pulseNumeric).toBe(67);
    expect(data.factors.length).toBe(5);
    expect(data.ribbon.length).toBe(7);
  });
});

describe('Chiwit elevation · intent matcher', () => {
  it('coffee-brewed produces a hydration ambient toast', () => {
    const matcher = MATCHERS.find((m) => m.kind === 'coffee-brewed');
    expect(matcher).toBeDefined();
    const spec = matcher!.toast({ kind: 'coffee-brewed' });
    expect(spec.title).toBe('Coffee (Coffee Brewer) folded into today');
    expect(spec.body).toBe('Hydration · +1 ambient signal');
    expect(spec.icon).toBe('☕');
    expect(spec.href).toContain('intent-coffee');
  });

  it('specForKind returns null for an unmatched kind', () => {
    expect(specForKind('totally-unknown-kind')).toBeNull();
  });

  it('all six spec §4.1 kinds have a registered matcher', () => {
    const expected = [
      'coffee-brewed',
      'workout-completed',
      'mindful-session',
      'cooked-meal',
      'sleep-logged',
      'hydration-logged',
    ];
    for (const kind of expected) {
      expect(MATCHERS.some((m) => m.kind === kind)).toBe(true);
      expect(AMBIENT_BY_KIND[kind]).toBeDefined();
    }
  });
});
