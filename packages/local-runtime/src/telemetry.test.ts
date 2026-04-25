import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { recordCapabilityProof, resetCapabilityProofMemoryForTests } from './telemetry.ts';

interface BeaconCall {
  url: string;
  body: string;
}

const calls: BeaconCall[] = [];

beforeEach(() => {
  calls.length = 0;
  resetCapabilityProofMemoryForTests();
  (globalThis as unknown as { navigator: Partial<Navigator> }).navigator = {
    sendBeacon: (url: string, body: BodyInit | null | undefined) => {
      calls.push({ url, body: typeof body === 'string' ? body : '' });
      return true;
    },
  } as unknown as Navigator;
  (globalThis as unknown as { window: { __shippieSessionId?: string } }).window = {};
});

afterEach(() => {
  delete (globalThis as { navigator?: unknown }).navigator;
  delete (globalThis as { window?: unknown }).window;
});

describe('recordCapabilityProof', () => {
  test('emits beacon with event_type and metadata', () => {
    recordCapabilityProof('local.db_used', { metadata: { tables: 2 } });
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(calls[0]!.body) as { events: Array<{ event_type: string; metadata?: unknown }> };
    expect(sent.events[0]!.event_type).toBe('local.db_used');
    expect(sent.events[0]!.metadata).toEqual({ tables: 2 });
  });

  test('deduplicates by event name', () => {
    recordCapabilityProof('local.db_used');
    recordCapabilityProof('local.db_used');
    recordCapabilityProof('local.db_used');
    expect(calls).toHaveLength(1);
  });

  test('emits separate proofs for distinct names', () => {
    recordCapabilityProof('local.db_used');
    recordCapabilityProof('local.files_used');
    expect(calls).toHaveLength(2);
    const names = calls.map((c) => (JSON.parse(c.body) as { events: Array<{ event_type: string }> }).events[0]!.event_type);
    expect(names).toEqual(['local.db_used', 'local.files_used']);
  });

  test('includes a session id', () => {
    recordCapabilityProof('local.db_used');
    const sent = JSON.parse(calls[0]!.body) as { events: Array<{ session_id: string }> };
    expect(sent.events[0]!.session_id).toMatch(/^s-[a-z0-9]+-[a-z0-9]+$/);
  });
});
