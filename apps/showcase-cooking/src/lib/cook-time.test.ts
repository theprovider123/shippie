import { describe, expect, test } from 'bun:test';
import {
  adjustForBathDrift,
  bathDriftIsCritical,
  buildStagePrompts,
  currentStagePrompt,
  nextStagePrompt,
} from './cook-time.ts';
import { CUTS } from '../data.ts';

describe('bath drift adjustment', () => {
  test('positive drift returns the base time (no shortening)', () => {
    expect(adjustForBathDrift(60, 1)).toBe(60);
  });

  test('-1°C drift extends ~10%', () => {
    expect(adjustForBathDrift(60, -1)).toBe(66);
  });

  test('-2°C drift extends ~20%', () => {
    expect(adjustForBathDrift(60, -2)).toBe(72);
  });

  test('-4°C drift treated as critical, returns base unmodified', () => {
    expect(adjustForBathDrift(60, -4)).toBe(60);
    expect(bathDriftIsCritical(-4)).toBe(true);
    expect(bathDriftIsCritical(-2)).toBe(false);
  });
});

describe('stage prompt builder', () => {
  test('smoke: 3-2-1 ribs gets wrap and sauce milestones', () => {
    const ribs = CUTS.find((c) => c.id === 'pork-ribs')!;
    const prompts = buildStagePrompts(ribs, 'smoke', 360, 10);
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    const titles = prompts.map((p) => p.title.toLowerCase());
    expect(titles).toContain('wrap');
    expect(titles).toContain('sauce');
  });

  test('smoke: large cuts get stall + probe + pull-soon prompts', () => {
    const brisket = CUTS.find((c) => c.id === 'beef-brisket')!;
    const prompts = buildStagePrompts(brisket, 'smoke', 600, 60);
    expect(prompts.length).toBe(3);
    const titles = prompts.map((p) => p.title.toLowerCase());
    expect(titles.some((t) => t.includes('stall'))).toBe(true);
    expect(titles.some((t) => t.includes('probe'))).toBe(true);
    expect(titles.some((t) => t.includes('pull'))).toBe(true);
  });

  test('roast: emits baste + rest prompts for long cooks', () => {
    const lamb = CUTS.find((c) => c.id === 'lamb-leg')!;
    const prompts = buildStagePrompts(lamb, 'roast', 90, 15);
    const titles = prompts.map((p) => p.title.toLowerCase());
    expect(titles.some((t) => t.includes('baste'))).toBe(true);
    expect(titles.some((t) => t.includes('rest'))).toBe(true);
  });

  test('pan: emits flip + rest prompts', () => {
    const steak = CUTS.find((c) => c.id === 'beef-steak')!;
    const prompts = buildStagePrompts(steak, 'pan', 6, 4);
    expect(prompts.find((p) => p.title.toLowerCase() === 'flip')).toBeTruthy();
    expect(prompts.find((p) => p.title.toLowerCase() === 'rest')).toBeTruthy();
  });

  test('sous-vide: a single sear-and-serve prompt at the end', () => {
    const steak = CUTS.find((c) => c.id === 'beef-steak')!;
    const prompts = buildStagePrompts(steak, 'sous-vide', 90, 0);
    expect(prompts.length).toBe(1);
    expect(prompts[0]!.at_minute).toBe(90);
  });

  test('prompts are sorted by at_minute ascending', () => {
    const brisket = CUTS.find((c) => c.id === 'beef-brisket')!;
    const prompts = buildStagePrompts(brisket, 'smoke', 600, 60);
    for (let i = 1; i < prompts.length; i++) {
      expect(prompts[i]!.at_minute).toBeGreaterThanOrEqual(prompts[i - 1]!.at_minute);
    }
  });

  test('currentStagePrompt: returns the most recent triggered prompt', () => {
    const steak = CUTS.find((c) => c.id === 'beef-steak')!;
    const prompts = buildStagePrompts(steak, 'pan', 6, 4);
    expect(currentStagePrompt(prompts, 0)).toBeNull();
    const c = currentStagePrompt(prompts, 5);
    expect(c?.title.toLowerCase()).toBe('flip');
  });

  test('nextStagePrompt: returns the upcoming prompt or null at the end', () => {
    const steak = CUTS.find((c) => c.id === 'beef-steak')!;
    const prompts = buildStagePrompts(steak, 'pan', 6, 4);
    const upcoming = nextStagePrompt(prompts, 0);
    expect(upcoming).not.toBeNull();
    expect(nextStagePrompt(prompts, 999)).toBeNull();
  });
});
