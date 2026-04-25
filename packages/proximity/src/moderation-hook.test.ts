/**
 * Tests for the group moderation hook.
 *
 * Covers the three modes, queue persistence (via the in-memory storage
 * adapter — OPFS itself is exercised in browser-level tests), the
 * AI-flag flow with a mocked moderate API, and queue rotation when a
 * member is removed.
 */
import { describe, expect, test } from 'bun:test';
import {
  createModerationHook,
  createMemoryQueueStorage,
  type GroupLike,
  type ModerateApi,
  type ModerationMode,
  type PendingMessage,
} from './moderation-hook.ts';

interface BroadcastSpy {
  calls: Array<{ channel: string; data: unknown }>;
}

function makeGroup(initialMode?: ModerationMode): GroupLike & BroadcastSpy {
  void initialMode;
  const calls: Array<{ channel: string; data: unknown }> = [];
  return {
    id: 'group-test-1',
    ownerPeerId: 'owner-pk',
    selfPeerId: 'self-pk',
    calls,
    broadcast(channel, data) {
      calls.push({ channel, data });
    },
  };
}

function makeAi(opts: {
  flagged: boolean;
  score?: number;
  categories?: string[];
  fail?: boolean;
}): ModerateApi {
  return {
    async moderate(_text) {
      if (opts.fail) throw new Error('ai unavailable');
      return {
        flagged: opts.flagged,
        score: opts.score ?? (opts.flagged ? 0.95 : 0.05),
        categories: opts.categories,
      };
    },
  };
}

describe('mode=open', () => {
  test('passes through immediately', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'open' });

    const decision = await hook.send('chat', { text: 'hello' });
    expect(decision.flagged).toBe(false);
    expect(group.calls).toHaveLength(1);
    expect(group.calls[0]?.channel).toBe('chat');
    expect((group.calls[0]?.data as { text: string }).text).toBe('hello');
    expect(await hook.getQueue()).toHaveLength(0);
  });
});

describe('mode=owner-approved', () => {
  test('queues outgoing instead of broadcasting', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'owner-approved' });

    const decision = await hook.send('chat', { text: 'hi' });
    expect(decision.flagged).toBe(true);
    expect(decision.reason).toBe('mode-owner-approved');
    expect(group.calls).toHaveLength(0);
    const queue = await hook.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.channel).toBe('chat');
    expect(queue[0]?.payloadJson).toContain('hi');
  });

  test('approve broadcasts and clears the entry', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'owner-approved' });

    await hook.send('chat', { text: 'one' });
    await hook.send('chat', { text: 'two' });
    expect(await hook.getQueue()).toHaveLength(2);

    const queue = await hook.getQueue();
    const ok = await hook.approve(queue[0]!.id);
    expect(ok).toBe(true);
    expect(group.calls).toHaveLength(1);
    expect((group.calls[0]?.data as { text: string }).text).toBe('one');
    expect(await hook.getQueue()).toHaveLength(1);
  });

  test('reject removes without broadcasting', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'owner-approved' });

    await hook.send('chat', { text: 'spam' });
    const [entry] = await hook.getQueue();
    const ok = await hook.reject(entry!.id);
    expect(ok).toBe(true);
    expect(group.calls).toHaveLength(0);
    expect(await hook.getQueue()).toHaveLength(0);
  });

  test('approve / reject with unknown id returns false', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'owner-approved' });

    expect(await hook.approve('nope')).toBe(false);
    expect(await hook.reject('nope')).toBe(false);
  });
});

describe('mode=ai-screened', () => {
  test('clean message broadcasts immediately', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const ai = makeAi({ flagged: false });
    const hook = createModerationHook({ group, storage, mode: 'ai-screened', ai });

    const decision = await hook.send('chat', { text: 'fresh pasta is delicious' });
    expect(decision.flagged).toBe(false);
    expect(group.calls).toHaveLength(1);
    expect(await hook.getQueue()).toHaveLength(0);
  });

  test('flagged message holds for owner', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const ai = makeAi({ flagged: true, score: 0.92, categories: ['toxic'] });
    const hook = createModerationHook({ group, storage, mode: 'ai-screened', ai });

    const decision = await hook.send('chat', { text: 'you are awful' });
    expect(decision.flagged).toBe(true);
    expect(decision.reason).toBe('mode-ai-flagged');
    expect(decision.categories).toEqual(['toxic']);
    expect(group.calls).toHaveLength(0);
    const queue = await hook.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.reason).toBe('mode-ai-flagged');
    expect(queue[0]?.score).toBe(0.92);
  });

  test('low-confidence flag still passes through', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const ai = makeAi({ flagged: true, score: 0.3 });
    const hook = createModerationHook({
      group,
      storage,
      mode: 'ai-screened',
      ai,
      flagThreshold: 0.75,
    });

    const decision = await hook.send('chat', { text: 'maybe spicy?' });
    expect(decision.flagged).toBe(false);
    expect(group.calls).toHaveLength(1);
  });

  test('non-text payload bypasses AI screening', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const ai = makeAi({ flagged: true });
    const hook = createModerationHook({ group, storage, mode: 'ai-screened', ai });

    const decision = await hook.send('cursor', { x: 12, y: 99 });
    expect(decision.flagged).toBe(false);
    expect(group.calls).toHaveLength(1);
  });

  test('AI failure queues for owner (fail-closed)', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const ai = makeAi({ flagged: false, fail: true });
    const hook = createModerationHook({ group, storage, mode: 'ai-screened', ai });

    const decision = await hook.send('chat', { text: 'hello' });
    expect(decision.flagged).toBe(true);
    expect(decision.reason).toBe('ai-unavailable');
    expect(group.calls).toHaveLength(0);
    expect(await hook.getQueue()).toHaveLength(1);
  });

  test('mode=ai-screened without ai bound also fails closed', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'ai-screened' });

    const decision = await hook.send('chat', 'a string body');
    expect(decision.flagged).toBe(true);
    expect(decision.reason).toBe('ai-unavailable');
  });

  test('approve replays a flagged-then-approved message', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const ai = makeAi({ flagged: true, score: 0.95 });
    const hook = createModerationHook({ group, storage, mode: 'ai-screened', ai });

    await hook.send('chat', { text: 'borderline' });
    const queue = await hook.getQueue();
    await hook.approve(queue[0]!.id);
    expect(group.calls).toHaveLength(1);
    expect((group.calls[0]?.data as { text: string }).text).toBe('borderline');
  });
});

describe('queue persistence', () => {
  test('a fresh hook on the same storage sees previously queued items', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();

    const hook1 = createModerationHook({ group, storage, mode: 'owner-approved' });
    await hook1.send('chat', { text: 'persist me' });

    // Simulate reload — new hook over the same storage.
    const hook2 = createModerationHook({ group, storage, mode: 'owner-approved' });
    const queue = await hook2.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.payloadJson).toContain('persist me');
  });
});

describe('member removal rotates the queue', () => {
  test('onMemberRemoved clears pending entries', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'owner-approved' });

    await hook.send('chat', { text: 'a' });
    await hook.send('chat', { text: 'b' });
    expect(await hook.getQueue()).toHaveLength(2);

    await hook.onMemberRemoved('removed-peer-pk');
    expect(await hook.getQueue()).toHaveLength(0);
  });
});

describe('mode switching', () => {
  test('setMode flips behaviour at runtime', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const hook = createModerationHook({ group, storage, mode: 'open' });

    await hook.send('chat', { text: 'first' });
    expect(group.calls).toHaveLength(1);

    hook.setMode('owner-approved');
    await hook.send('chat', { text: 'second' });
    expect(group.calls).toHaveLength(1);
    expect(await hook.getQueue()).toHaveLength(1);
  });
});

describe('onQueueChange notifications', () => {
  test('fires on enqueue / dequeue / clear', async () => {
    const group = makeGroup();
    const storage = createMemoryQueueStorage();
    const seen: number[] = [];
    const hook = createModerationHook({
      group,
      storage,
      mode: 'owner-approved',
      onQueueChange: (q: PendingMessage[]) => seen.push(q.length),
    });

    await hook.send('chat', { text: 'a' });
    await hook.send('chat', { text: 'b' });
    const [first] = await hook.getQueue();
    await hook.approve(first!.id);
    await hook.onMemberRemoved('peer-x');

    expect(seen).toEqual([1, 2, 1, 0]);
  });
});
