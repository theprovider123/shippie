import { describe, expect, it } from 'bun:test';
import { buildPassport, buildSetsCsv, PASSPORT_SCHEMA } from './export.ts';
import type { SetRow } from '../db/schema.ts';

function emptyInput() {
  return {
    exportedAt: '2026-05-29T12:00:00.000Z',
    lineages: [],
    variants: [],
    exercises: [],
    workouts: [],
    steps: [],
    sets: [],
    templates: [],
    templateSteps: [],
    prs: [],
    inventories: [],
  };
}

const set = (over: Partial<SetRow>): SetRow => ({
  id: 's1',
  step_id: 'step1',
  set_index: 0,
  weight: 100,
  reps: 5,
  unit: 'kg',
  set_type: 'working',
  rpe: null,
  rir: null,
  bar_weight: 20,
  plate_inventory_id: null,
  completed_at: '2026-05-29T10:00:00.000Z',
  source: 'manual',
  ...over,
});

describe('buildPassport', () => {
  it('stamps the schema and tallies counts', () => {
    const p = buildPassport({
      ...emptyInput(),
      sets: [set({}), set({ id: 's2' })],
      exercises: [{ id: 'e1', name: 'Squat', muscle_group: 'legs', default_unit: 'kg' }],
    });
    expect(p.schema).toBe(PASSPORT_SCHEMA);
    expect(p.exported_at).toBe('2026-05-29T12:00:00.000Z');
    expect(p.counts.sets).toBe(2);
    expect(p.counts.exercises).toBe(1);
    expect(p.data.sets).toHaveLength(2);
  });

  it('round-trips through JSON without loss', () => {
    const p = buildPassport({ ...emptyInput(), sets: [set({})] });
    const round = JSON.parse(JSON.stringify(p));
    expect(round.data.sets[0].weight).toBe(100);
    expect(round.counts.sets).toBe(1);
  });
});

describe('buildSetsCsv', () => {
  it('writes a header and one row per set', () => {
    const csv = buildSetsCsv(
      [set({ rpe: 8, rir: 2 }), set({ id: 's2', weight: 80, reps: 8 })],
      () => 'w1',
      () => 'Barbell bench press',
    );
    const lines = csv.split('\n');
    expect(lines[0]).toContain('set_id');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Barbell bench press');
    expect(lines[1]).toContain('8'); // rpe
  });

  it('quotes fields containing commas', () => {
    const csv = buildSetsCsv([set({})], () => 'w1', () => 'Squat, low bar');
    expect(csv).toContain('"Squat, low bar"');
  });
});
