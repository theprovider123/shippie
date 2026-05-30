import { describe, expect, test } from 'bun:test';
import type { Entry, Goals, Mode, Slot } from './types';
import { EMPTY_NUTRIENTS } from './nutrition';
import { targetsForMode } from './modes';
import { emptyExternalContext, type ExternalContext } from './intents';
import { buildInsights, type Insight } from './insights';
import type { Nutrients } from './foods-data';

const NOW = new Date('2026-05-29T20:00:00');
const SHAME = /\b(fail|failed|failure|bad|cheat|guilt|shame|blew|busted|ruined|naughty|sin)\b/i;

function entry(nut: Partial<Nutrients>, slot: Slot, iso: string): Entry {
  return {
    id: `e_${iso}_${slot}`,
    name: 'food',
    slot,
    qty: 1,
    grams: 100,
    nutrients: { ...EMPTY_NUTRIENTS, ...nut },
    logged_at: iso,
  };
}

function goals(mode: Mode, override: Partial<Goals['targets']> = {}): Goals {
  return {
    mode,
    units: 'metric',
    customized: false,
    targets: { ...targetsForMode(mode, 70), ...override },
  };
}

function assertNeutral(list: readonly Insight[]) {
  for (const ins of list) {
    expect(['note', 'positive', 'watch']).toContain(ins.tone);
    expect(ins.title).not.toMatch(SHAME);
    expect(ins.body).not.toMatch(SHAME);
  }
}

describe('buildInsights', () => {
  test('empty day yields no insights', () => {
    const out = buildInsights({
      todayEntries: [],
      allEntries: [],
      goals: goals('maintenance'),
      external: emptyExternalContext(),
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  test('reaching protein gives a positive (never punitive) card', () => {
    const out = buildInsights({
      todayEntries: [entry({ protein_g: 40, kcal: 200 }, 'breakfast', '2026-05-29T08:00:00')],
      allEntries: [],
      goals: goals('protein-watch', { protein_g: 30 }),
      external: emptyExternalContext(),
      now: NOW,
    });
    const protein = out.find((i) => i.kind === 'protein');
    expect(protein?.tone).toBe('positive');
    assertNeutral(out);
  });

  test('over-the-line sodium is a neutral "watch", not a failure', () => {
    const out = buildInsights({
      todayEntries: [entry({ sodium_mg: 3200, kcal: 600 }, 'lunch', '2026-05-29T13:00:00')],
      allEntries: [],
      goals: goals('sodium-watch'),
      external: emptyExternalContext(),
      now: NOW,
    });
    const sodium = out.find((i) => i.kind === 'sodium');
    expect(sodium?.tone).toBe('watch');
    assertNeutral(out);
  });

  test('late caffeine surfaces as a sleep-aware note', () => {
    const out = buildInsights({
      todayEntries: [entry({ caffeine_mg: 90, kcal: 5 }, 'drink', '2026-05-29T22:00:00')],
      allEntries: [],
      goals: goals('maintenance'),
      external: emptyExternalContext(),
      now: NOW,
    });
    expect(out.find((i) => i.kind === 'caffeine')?.tone).toBe('watch');
  });

  test('a logged workout pulls in a fueling card', () => {
    const ext: ExternalContext = { ...emptyExternalContext(), workouts: [{ kind: 'run', at: '2026-05-29T18:00:00' }] };
    const out = buildInsights({
      todayEntries: [entry({ protein_g: 5, kcal: 100 }, 'snack', '2026-05-29T12:00:00')],
      allEntries: [],
      goals: goals('endurance'),
      external: ext,
      now: NOW,
    });
    expect(out.find((i) => i.kind === 'fueling')).toBeTruthy();
    assertNeutral(out);
  });

  test('cycle-aware mode surfaces a luteal note when phase is known', () => {
    const ext: ExternalContext = { ...emptyExternalContext(), cycle: [{ phase: 'luteal', at: '2026-05-29T07:00:00' }] };
    const out = buildInsights({
      todayEntries: [entry({ protein_g: 20, kcal: 300 }, 'breakfast', '2026-05-29T08:00:00')],
      allEntries: [],
      goals: goals('cycle-aware'),
      external: ext,
      now: NOW,
    });
    const cycle = out.find((i) => i.kind === 'cycle');
    expect(cycle).toBeTruthy();
    expect(cycle?.tone).toBe('note');
  });

  test('mode priority floats the relevant card to the top', () => {
    const out = buildInsights({
      todayEntries: [
        entry({ protein_g: 10, kcal: 200 }, 'breakfast', '2026-05-29T08:00:00'),
        entry({ protein_g: 10, kcal: 200 }, 'dinner', '2026-05-29T19:00:00'),
      ],
      allEntries: [],
      goals: goals('protein-watch', { protein_g: 140 }),
      external: emptyExternalContext(),
      now: NOW,
    });
    expect(out[0]!.kind).toBe('protein');
  });

  test('long gap between meals reads descriptively', () => {
    const out = buildInsights({
      todayEntries: [
        entry({ kcal: 300, protein_g: 10 }, 'breakfast', '2026-05-29T07:00:00'),
        entry({ kcal: 500, protein_g: 20 }, 'dinner', '2026-05-29T19:00:00'),
      ],
      allEntries: [],
      goals: goals('general-energy'),
      external: emptyExternalContext(),
      now: NOW,
    });
    const reg = out.find((i) => i.kind === 'regularity');
    expect(reg?.tone).toBe('note');
    assertNeutral(out);
  });
});
