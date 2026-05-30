import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetForTests, closeLedgerDb, DB_NAME } from '@shippie/trust-ledger';
import {
  emitBridgeLedgerRow,
  _resetLedgerHost,
  getLedger,
  getRevocationStore,
  withRevocationGate,
} from './host';
import {
  BridgeRpcError,
  type BridgeHandler,
  type BridgeLedgerEvent,
} from '@shippie/container-bridge';
import type { BridgeCapability } from '@shippie/app-package-contract';

async function deleteLedgerDb(): Promise<void> {
  closeLedgerDb();
  _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  _resetForTests();
}

beforeEach(async () => {
  await deleteLedgerDb();
  _resetLedgerHost();
});

function fakeEvent(over: Partial<BridgeLedgerEvent> = {}): BridgeLedgerEvent {
  return {
    request: {
      protocol: 'shippie.bridge.v1',
      id: 'req_1',
      appId: 'app_recipe',
      capability: 'network.fetch',
      method: 'fetch',
      payload: { url: 'https://palate.app/imports/aisle-map.json' },
    } as BridgeLedgerEvent['request'],
    capability: 'network.fetch',
    method: 'fetch',
    payload: { url: 'https://palate.app/imports/aisle-map.json' },
    outcome: 'ok',
    result: { status: 200, bytes: 4200 },
    durationMs: 12,
    ...over,
  };
}

const resolveApp = (id: string) =>
  id === 'app_recipe' ? { appSlug: 'recipe', egressVisibility: 'full' as const } : null;

describe('emitBridgeLedgerRow', () => {
  it('commits a row before returning, with redacted host', async () => {
    await emitBridgeLedgerRow(fakeEvent(), { resolveApp });
    const ledger = await getLedger();
    expect(ledger).not.toBeNull();
    const rows = await ledger!.readApp('recipe');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.target_host).toBe('palate.app');
    expect(rows[0]!.summary).toContain('palate.app');
    expect(rows[0]!.egress_visibility).toBe('full');
    expect(rows[0]!.outcome).toBe('ok');
  });

  it('maps denied bridge outcome to denied ledger outcome', async () => {
    await emitBridgeLedgerRow(
      fakeEvent({ outcome: 'denied', result: undefined, errorCode: 'capability_not_granted' }),
      { resolveApp },
    );
    const ledger = await getLedger();
    const rows = await ledger!.readApp('recipe');
    expect(rows[0]!.outcome).toBe('denied');
  });

  it('marks URL-installed apps with egress_visibility=bridge-only', async () => {
    const urlInstalledResolver = (id: string) =>
      id === 'app_recipe' ? { appSlug: 'recipe', egressVisibility: 'bridge-only' as const } : null;
    await emitBridgeLedgerRow(fakeEvent(), { resolveApp: urlInstalledResolver });
    const ledger = await getLedger();
    const rows = await ledger!.readApp('recipe');
    expect(rows[0]!.egress_visibility).toBe('bridge-only');
  });

  it('falls back to event.request.appId when the resolver returns null', async () => {
    await emitBridgeLedgerRow(fakeEvent(), { resolveApp: () => null });
    const ledger = await getLedger();
    const rows = await ledger!.readApp('app_recipe');
    expect(rows).toHaveLength(1);
  });

  it('fail-closed: throws BridgeRpcError when commit fails for non-allow-listed capability', async () => {
    const ledger = await getLedger();
    expect(ledger).not.toBeNull();
    const spy = vi.spyOn(ledger!, 'commit').mockRejectedValue(new Error('IDB quota exceeded'));
    await expect(
      emitBridgeLedgerRow(fakeEvent(), { resolveApp, ledger: ledger! }),
    ).rejects.toBeInstanceOf(BridgeRpcError);
    spy.mockRestore();
  });

  it('fail-open: does not throw when commit fails for allow-listed capability (db.query)', async () => {
    const ledger = await getLedger();
    const spy = vi.spyOn(ledger!, 'commit').mockRejectedValue(new Error('transient IDB error'));
    await expect(
      emitBridgeLedgerRow(fakeEvent({ capability: 'db.query', payload: { table: 't' } }), {
        resolveApp,
        ledger: ledger!,
      }),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('fail-closed: Vault key error always throws with key-unavailable code', async () => {
    const ledger = await getLedger();
    const spy = vi.spyOn(ledger!, 'commit').mockRejectedValue(new Error('seed key load failed'));
    await expect(
      emitBridgeLedgerRow(fakeEvent({ capability: 'db.query', payload: { table: 't' } }), {
        resolveApp,
        ledger: ledger!,
      }),
    ).rejects.toMatchObject({ code: 'key-unavailable' });
    spy.mockRestore();
  });
});

describe('withRevocationGate (5B)', () => {
  it('lets a call through when the capability is not revoked', async () => {
    const inner: BridgeHandler = async () => ({ ok: true, ran: true });
    const wrapped = withRevocationGate({ 'db.insert': inner }, 'recipe');
    const handler = wrapped['db.insert' as BridgeCapability]!;
    const result = await handler({
      request: { appId: 'app_recipe' } as never,
      capability: 'db.insert',
      method: 'insert',
      payload: { table: 'meals' },
    });
    expect(result).toEqual({ ok: true, ran: true });
  });

  it('throws capability_revoked when the user has revoked the capability for this app', async () => {
    const inner: BridgeHandler = async () => ({ ok: true });
    const wrapped = withRevocationGate({ 'network.fetch': inner }, 'recipe');
    const store = await getRevocationStore();
    expect(store).not.toBeNull();
    await store!.revoke('recipe', 'network.fetch');
    const handler = wrapped['network.fetch' as BridgeCapability]!;
    await expect(
      handler({
        request: { appId: 'app_recipe' } as never,
        capability: 'network.fetch',
        method: 'fetch',
        payload: { url: 'https://palate.app/' },
      }),
    ).rejects.toMatchObject({ code: 'capability_revoked' });
  });

  it('keeps revocations scoped per-(app, capability)', async () => {
    const store = await getRevocationStore();
    await store!.revoke('recipe', 'network.fetch');
    const inner: BridgeHandler = async () => ({ ok: true });
    const recipeWrapped = withRevocationGate({ 'network.fetch': inner }, 'recipe');
    const journalWrapped = withRevocationGate({ 'network.fetch': inner }, 'journal');
    await expect(
      recipeWrapped['network.fetch' as BridgeCapability]!({
        request: { appId: 'app_recipe' } as never,
        capability: 'network.fetch',
        method: 'fetch',
        payload: { url: 'https://x.com/' },
      }),
    ).rejects.toMatchObject({ code: 'capability_revoked' });
    await expect(
      journalWrapped['network.fetch' as BridgeCapability]!({
        request: { appId: 'app_journal' } as never,
        capability: 'network.fetch',
        method: 'fetch',
        payload: { url: 'https://x.com/' },
      }),
    ).resolves.toEqual({ ok: true });
  });
});
