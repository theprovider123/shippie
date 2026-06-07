import { describe, it, expect, vi } from 'vitest';
import { AIBrokerRefusal, type AIRequest, type JsonSchema, type Role } from '@shippie/cloudlet-contract';
import { createAIBroker, type BrokerDeps, type ModelFn } from './ai-broker';

const SCHEMA: JsonSchema = { type: 'object', required: ['cards'] };

function fakeKv() {
  const m = new Map<string, string>();
  return {
    store: m,
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
  };
}

function baseReq(over: Partial<AIRequest> = {}): AIRequest {
  return {
    appId: 'uniti',
    instanceId: 'i1',
    userId: 'u1',
    purpose: 'adaptation.generate',
    sensitivity: 'pseudonymised',
    inputRefs: [{ kind: 'pupil', id: 'p12' }],
    context: { objective: 'add fractions', notes: ['p12 (Aisha J.) needs revisit'] },
    ...over,
  };
}

function deps(over: Partial<BrokerDeps> = {}): BrokerDeps {
  const model: ModelFn = async () => ({
    output: { cards: [{ teacherAction: 'Pre-teach for Pupil A', target: ['Pupil A'] }] },
    tokens: 120,
    model: 'test-model',
  });
  return {
    rolesFor: async () => ['teacher'] as Role[],
    aiEnabled: async () => true,
    remainingBudget: async () => 100_000,
    pupilNames: async () => ({ p12: 'Aisha J.' }),
    kv: fakeKv(),
    model,
    meter: vi.fn(async () => {}),
    audit: vi.fn(async () => 'audit-1'),
    now: () => 1000,
    ...over,
  };
}

describe('AIBroker.request pipeline', () => {
  it('refuses + audits when the caller lacks the role', async () => {
    const audit = vi.fn(async () => 'a');
    const broker = createAIBroker(deps({ rolesFor: async () => ['viewer'] as Role[], audit }));
    await expect(broker.request(baseReq(), SCHEMA)).rejects.toMatchObject({ reason: 'forbidden' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai.refused', reason: 'forbidden' }));
  });

  it('refuses + audits when AI is disabled for the school', async () => {
    const audit = vi.fn(async () => 'a');
    const broker = createAIBroker(deps({ aiEnabled: async () => false, audit }));
    await expect(broker.request(baseReq(), SCHEMA)).rejects.toMatchObject({ reason: 'ai_disabled' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ reason: 'ai_disabled' }));
  });

  it('refuses when over budget', async () => {
    const broker = createAIBroker(deps({ remainingBudget: async () => 0 }));
    await expect(broker.request(baseReq(), SCHEMA)).rejects.toMatchObject({ reason: 'over_budget' });
  });

  it('refuses with no_model when no model binding is available (the rules-path gate)', async () => {
    const broker = createAIBroker(deps({ model: async () => null }));
    await expect(broker.request(baseReq(), SCHEMA)).rejects.toBeInstanceOf(AIBrokerRefusal);
    await expect(broker.request(baseReq(), SCHEMA)).rejects.toMatchObject({ reason: 'no_model' });
  });

  it('EXCLUDES safeguarding signal from the model input', async () => {
    let seen: unknown;
    const model: ModelFn = async ({ context }) => {
      seen = context;
      return { output: { cards: [] }, tokens: 1, model: 'm' };
    };
    const broker = createAIBroker(deps({ model }));
    await broker.request(
      baseReq({ context: { objective: 'x', notes: ['safeguarding disclosure about home'] } }),
      SCHEMA,
    );
    const json = JSON.stringify(seen);
    expect(json).not.toContain('disclosure');
    expect(json).toContain('[excluded: safeguarding]');
  });

  it('PSEUDONYMISES pupil ids + names before the model sees them', async () => {
    let seen: unknown;
    const model: ModelFn = async ({ context }) => {
      seen = context;
      return { output: { cards: [] }, tokens: 1, model: 'm' };
    };
    const broker = createAIBroker(deps({ model }));
    await broker.request(baseReq(), SCHEMA);
    const json = JSON.stringify(seen);
    expect(json).not.toContain('Aisha');
    expect(json).not.toContain('p12');
    expect(json).toContain('Pupil A');
  });

  it('re-expands pseudonym labels back to real ids in the result', async () => {
    const broker = createAIBroker(deps());
    const res = await broker.request<{ cards: Array<{ target: string[] }> }>(baseReq(), SCHEMA);
    expect(res.data.cards[0]?.target).toEqual(['p12']);
    expect(res.cached).toBe(false);
  });

  it('meters tokens + audits + eval-logs on a fresh call', async () => {
    const meter = vi.fn(async () => {});
    const evalLog = vi.fn(async () => {});
    const broker = createAIBroker(deps({ meter, evalLog }));
    const res = await broker.request(baseReq(), SCHEMA);
    expect(meter).toHaveBeenCalledWith('i1', 'ai_tokens', 120);
    expect(evalLog).toHaveBeenCalledWith(expect.objectContaining({ cached: false, tokens: 120 }));
    expect(res.auditId).toBe('audit-1');
  });

  it('serves the content-hash cache on the second identical call (no model, no metering)', async () => {
    const kv = fakeKv();
    const model = vi.fn<ModelFn>(async () => ({ output: { cards: [{ target: ['Pupil A'] }] }, tokens: 50, model: 'm' }));
    const meter = vi.fn(async () => {});
    const broker = createAIBroker(deps({ kv, model, meter }));
    const first = await broker.request(baseReq(), SCHEMA);
    const second = await broker.request(baseReq(), SCHEMA);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(model).toHaveBeenCalledTimes(1); // second served from cache
    expect(meter).toHaveBeenCalledTimes(1); // cache hit doesn't re-meter
    // Cached output is re-expanded too.
    expect((second.data as { cards: Array<{ target: string[] }> }).cards[0]?.target).toEqual(['p12']);
  });

  it('refuses schema_invalid when the model returns the wrong shape', async () => {
    const broker = createAIBroker(deps({ model: async () => ({ output: { wrong: true }, tokens: 1, model: 'm' }) }));
    await expect(broker.request(baseReq(), SCHEMA)).rejects.toMatchObject({ reason: 'schema_invalid' });
  });

  it('does not name pupils for group-sensitivity requests', async () => {
    let seen: unknown;
    const model: ModelFn = async ({ context }) => {
      seen = context;
      return { output: { cards: [] }, tokens: 1, model: 'm' };
    };
    const pupilNames = vi.fn(async () => ({ p12: 'Aisha J.' }));
    const broker = createAIBroker(deps({ model, pupilNames }));
    await broker.request(baseReq({ sensitivity: 'group', context: { objective: 'x' } }), SCHEMA);
    expect(pupilNames).not.toHaveBeenCalled();
    expect(JSON.stringify(seen)).not.toContain('Aisha');
  });
});
