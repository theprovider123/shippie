import { describe, it, expect, vi } from 'vitest';
import { OutboxImpl, type SendResult } from './outbox';
import type { OutboxEntry, OutboxStore, WorkspaceEvent } from '@shippie/cloudlet-contract';

/** In-memory fake of OutboxStore — the seam that makes the Outbox Node-testable. */
function fakeStore(): OutboxStore & { _entries: Map<string, OutboxEntry> } {
  const entries = new Map<string, OutboxEntry>();
  const meta = new Map<string, string>();
  return {
    _entries: entries,
    async get(k) {
      return entries.get(k);
    },
    async put(k, v) {
      entries.set(k, v);
    },
    async delete(k) {
      entries.delete(k);
    },
    async list() {
      return [...entries.entries()]
        .map(([key, value]) => ({ key, value }))
        .sort((a, b) => a.value.enqueuedAt - b.value.enqueuedAt);
    },
    async getMeta(k) {
      return meta.get(k);
    },
    async setMeta(k, v) {
      meta.set(k, v);
    },
  };
}

function makeOutbox(opts: {
  store: OutboxStore;
  send: (e: WorkspaceEvent) => Promise<SendResult>;
  now?: () => number;
}) {
  let n = 0;
  return new OutboxImpl({
    store: opts.store,
    send: opts.send,
    actorUserId: 'u1',
    schemaVersion: 1,
    now: opts.now ?? (() => 1_000),
    uuid: () => `uuid-${++n}`,
    backoffBaseMs: 1_000,
  });
}

describe('Outbox', () => {
  it('enqueue stamps clientEventId, deviceId, createdOfflineAt + persists', async () => {
    const store = fakeStore();
    const ob = makeOutbox({ store, send: async () => ({ ok: true, duplicate: false }) });
    const ev = await ob.enqueue({ type: 'feedback.created', instanceId: 'i1', payload: { x: 1 } });
    expect(ev.clientEventId).toBe('uuid-1'); // clientEventId minted first
    expect(ev.deviceId).toBe('dev-uuid-2'); // deviceId minted on first lookup
    expect(ev.actorUserId).toBe('u1');
    expect(ev.schemaVersion).toBe(1);
    expect(ev.createdOfflineAt).toBe(new Date(1_000).toISOString());
    expect(await ob.pendingCount()).toBe(1);
  });

  it('deviceId is stable across enqueues + persisted in the store', async () => {
    const store = fakeStore();
    const ob = makeOutbox({ store, send: async () => ({ ok: true, duplicate: false }) });
    const a = await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    const b = await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    expect(a.deviceId).toBe(b.deviceId);
    expect(await store.getMeta('deviceId')).toBe(a.deviceId);
  });

  it('flush sends queued events and removes accepted ones', async () => {
    const store = fakeStore();
    const sent: string[] = [];
    const ob = makeOutbox({
      store,
      send: async (e) => {
        sent.push(e.clientEventId);
        return { ok: true, duplicate: false };
      },
    });
    await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    const r = await ob.flush();
    expect(r.attempted).toBe(2);
    expect(r.accepted).toBe(2);
    expect(r.pending).toBe(0);
    expect(sent).toHaveLength(2);
    expect(ob.status()).toBe('synced');
  });

  it('keeps failures queued and backs off; replay relies on server dedupe', async () => {
    const store = fakeStore();
    let fail = true;
    const sendCounts: Record<string, number> = {};
    let clock = 1_000;
    const ob = makeOutbox({
      store,
      now: () => clock,
      send: async (e) => {
        sendCounts[e.clientEventId] = (sendCounts[e.clientEventId] ?? 0) + 1;
        return fail ? { ok: false, retryable: true } : { ok: true, duplicate: false };
      },
    });
    await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    const r1 = await ob.flush();
    expect(r1.failed).toBe(1);
    expect(r1.pending).toBe(1);
    expect(ob.status()).toBe('offline');

    // Immediately re-flushing is a no-op: the entry is in backoff.
    const r2 = await ob.flush();
    expect(r2.attempted).toBe(0);

    // Advance past backoff, let the server accept; the SAME clientEventId is
    // resent (idempotent replay — server dedupes).
    clock += 2_000;
    fail = false;
    const r3 = await ob.flush();
    expect(r3.accepted).toBe(1);
    expect(r3.pending).toBe(0);
    const onlyId = Object.keys(sendCounts)[0];
    expect(sendCounts[onlyId]).toBe(2); // attempted twice, same id
  });

  it('treats server-confirmed duplicates as success and removes them', async () => {
    const store = fakeStore();
    const ob = makeOutbox({ store, send: async () => ({ ok: true, duplicate: true }) });
    await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    const r = await ob.flush();
    expect(r.duplicates).toBe(1);
    expect(r.pending).toBe(0);
  });

  it('drops non-retryable failures so the queue cannot wedge', async () => {
    const store = fakeStore();
    const ob = makeOutbox({ store, send: async () => ({ ok: false, retryable: false }) });
    await ob.enqueue({ type: 't', instanceId: 'i1', payload: {} });
    const r = await ob.flush();
    expect(r.failed).toBe(1);
    expect(r.pending).toBe(0);
  });

  it('a captured event survives a reload (re-reads the same store)', async () => {
    const store = fakeStore();
    const ob1 = makeOutbox({ store, send: async () => ({ ok: true, duplicate: false }) });
    await ob1.enqueue({ type: 't', instanceId: 'i1', payload: { keep: true } });
    // New Outbox over the SAME persisted store (simulates a fresh page load).
    const sent: WorkspaceEvent[] = [];
    const ob2 = makeOutbox({
      store,
      send: async (e) => {
        sent.push(e);
        return { ok: true, duplicate: false };
      },
    });
    expect(await ob2.pendingCount()).toBe(1);
    await ob2.flush();
    expect(sent[0].payload).toEqual({ keep: true });
  });
});
