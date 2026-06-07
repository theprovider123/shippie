import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import {
  AIBrokerRefusal,
  type AIBroker,
  type Role,
} from '@shippie/cloudlet-contract';
import {
  generateAdaptationsRules,
  generateAdaptationsBroker,
  adaptationGeneratedEvent,
  assertNoDeficitLanguage,
  type AdaptationContext,
} from './adaptation-engine';
import { createAIBroker, type ModelFn } from './ai-broker';
import { WorkspaceStore } from './workspace-store';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

function store() {
  const db = new DatabaseSync(':memory:');
  const exec = {
    run: (sql: string, ...a: unknown[]) => void db.prepare(sql).run(...(a as never[])),
    all: <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[])) as T[],
  };
  const s = new WorkspaceStore(exec);
  s.init();
  return s;
}

const ctx = (over: Partial<AdaptationContext> = {}): AdaptationContext => ({
  instanceId: 'i1',
  lesson: { id: 'l1', subjectId: 'maths', objective: 'add fractions', topic: 'equivalent fractions', time: '09:00' },
  pupils: [
    { id: 'p1', name: 'Aisha J.', send: 1, eal: 0, fsm: 0 },
    { id: 'p4', name: 'Darius M.', send: 0, eal: 1, fsm: 0 },
    { id: 'p2', name: 'Ben C.', send: 0, eal: 0, fsm: 0 },
  ],
  feedback: [
    { pupilId: 'p1', state: 'needs_revisit', note: null, supportStrategy: null },
    { pupilId: 'p4', state: 'nearly_there', note: null, supportStrategy: null },
    { pupilId: 'p2', state: 'got_it', note: null, supportStrategy: null },
  ],
  ...over,
});

describe('rules generator (the no-model default path)', () => {
  it('proposes a revisit group card for pupils who did not get it', () => {
    const cards = generateAdaptationsRules(ctx(), () => 0);
    const revisit = cards.find((c) => c.need.includes('revisit'));
    expect(revisit).toBeTruthy();
    // p1 (needs_revisit) + p4 (nearly_there); p2 (got_it) excluded.
    expect(revisit!.target.ids.sort()).toEqual(['p1', 'p4']);
    expect(revisit!.reviewState).toBe('suggested'); // teacher-owned
    expect(revisit!.source).toBe('rules');
  });

  it('adds an EAL pre-teach card and a SEND scaffold card when relevant', () => {
    const cards = generateAdaptationsRules(ctx(), () => 0);
    expect(cards.some((c) => c.target.label.includes('EAL'))).toBe(true);
    expect(cards.some((c) => c.need.includes('concrete scaffold') || c.strategy.includes('worked model'))).toBe(true);
  });

  it('produces NO cards when the whole class got it', () => {
    const cards = generateAdaptationsRules(
      ctx({ feedback: [{ pupilId: 'p1', state: 'got_it', note: null, supportStrategy: null }] }),
      () => 0,
    );
    expect(cards).toHaveLength(0);
  });

  it('never emits deficit/diagnosis language', () => {
    const cards = generateAdaptationsRules(ctx(), () => 0);
    for (const c of cards) expect(() => assertNoDeficitLanguage(c)).not.toThrow();
  });

  it('assertNoDeficitLanguage blocks a card with a deficit label', () => {
    expect(() =>
      assertNoDeficitLanguage({
        id: 'x', instanceId: 'i1', target: { kind: 'group', ids: [], label: '' },
        objective: 'o', need: 'low ability group', strategy: 's', teacherAction: 'a',
        whyThis: 'w', evidence: [], confidence: 'emerging', reviewState: 'suggested',
        source: 'rules', schemaVersion: 1,
      }),
    ).toThrow(/deficit/);
  });
});

describe('adaptation.generated event → workspace projection', () => {
  it('projects generated cards into the read-model and is replay-idempotent', () => {
    const s = store();
    const cards = generateAdaptationsRules(ctx(), () => 0);
    const evt = adaptationGeneratedEvent({
      clientEventId: 'gen-1', instanceId: 'i1', actorUserId: 'u1',
      cards, source: 'rules', lessonId: 'l1', subjectId: 'maths',
    });
    s.appendEvent(evt, 1000);
    const before = s.listAdaptationCards().length;
    expect(before).toBe(cards.length);
    // Re-append the SAME event (offline replay) — deduped, no new cards.
    s.appendEvent(evt, 1001);
    expect(s.listAdaptationCards().length).toBe(before);
    const row = s.listAdaptationCards()[0]!;
    expect(row.reviewState).toBe('planned');
    expect(row.teacherAction.length).toBeGreaterThan(0);
  });
});

describe('broker path', () => {
  function broker(model: ModelFn): AIBroker {
    const kv = new Map<string, string>();
    return createAIBroker({
      rolesFor: async () => ['teacher'] as Role[],
      aiEnabled: async () => true,
      remainingBudget: async () => 1e6,
      pupilNames: async () => ({ p1: 'Aisha J.', p4: 'Darius M.', p2: 'Ben C.' }),
      kv: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
      model,
      meter: async () => {},
      audit: async () => 'a1',
    });
  }

  it('returns richer broker cards (same shape) when a model is available', async () => {
    const model: ModelFn = async () => ({
      output: { cards: [{ need: 'finding equivalent fractions tricky', teacherAction: 'Use a fraction wall with Pupil A', target: { kind: 'group', ids: ['Pupil A'], label: '1 pupil' } }] },
      tokens: 90, model: 'm',
    });
    const { cards, source } = await generateAdaptationsBroker(broker(model), ctx(), { userId: 'u1' });
    expect(source).toBe('broker');
    expect(cards[0]?.source).toBe('broker');
    expect(cards[0]?.reviewState).toBe('suggested');
    // pseudonym 'Pupil A' re-expanded to the real id by the Broker.
    expect(cards[0]?.target.ids).toContain('p1');
  });

  it('FALLS BACK to the rules path when the Broker refuses (no model keys)', async () => {
    const noModel: ModelFn = async () => null; // simulates absent env.AI
    const { cards, source } = await generateAdaptationsBroker(broker(noModel), ctx(), { userId: 'u1' });
    expect(source).toBe('rules');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.source === 'rules')).toBe(true);
  });

  it('falls back to rules when AI is disabled for the school', async () => {
    const kv = new Map<string, string>();
    const disabled = createAIBroker({
      rolesFor: async () => ['teacher'] as Role[],
      aiEnabled: async () => false,
      remainingBudget: async () => 1e6,
      pupilNames: async () => ({}),
      kv: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
      model: async () => ({ output: { cards: [] }, tokens: 0, model: 'm' }),
      meter: async () => {},
      audit: vi.fn(async () => 'a'),
    });
    const { source } = await generateAdaptationsBroker(disabled, ctx(), { userId: 'u1' });
    expect(source).toBe('rules');
  });

  it('re-throws non-refusal errors (does not silently swallow bugs)', async () => {
    const bad = {
      request: async () => {
        throw new Error('boom');
      },
    } as unknown as AIBroker;
    await expect(generateAdaptationsBroker(bad, ctx(), { userId: 'u1' })).rejects.toThrow('boom');
    // sanity: a refusal would NOT throw
    expect(new AIBrokerRefusal('no_model')).toBeInstanceOf(AIBrokerRefusal);
  });
});
