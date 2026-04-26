import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { _peekSpace, currentSpace, setSpaceLabel } from './spatial-memory.ts';
import { _resetIntelligenceDbForTest } from './storage.ts';

beforeEach(async () => {
  await _resetIntelligenceDbForTest();
});

afterEach(async () => {
  await _resetIntelligenceDbForTest();
});

interface Candidate {
  candidate: string;
}

interface FakePCConfig {
  candidates: Candidate[];
  /** Schedule candidate emission with this delay (ms) after setLocalDescription. Default 0. */
  emitDelayMs?: number;
  /** If true, throw on createOffer to simulate WebRTC blocked. */
  failCreateOffer?: boolean;
}

function makeFakePCCtor(config: FakePCConfig): new () => {
  createDataChannel(label: string): unknown;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(desc: { type: string; sdp?: string }): Promise<void>;
  onicecandidate: ((event: { candidate: { candidate: string } | null }) => void) | null;
  close(): void;
} {
  return class FakePeerConnection {
    onicecandidate: ((event: { candidate: { candidate: string } | null }) => void) | null = null;
    private closed = false;

    createDataChannel(_label: string): unknown {
      return {};
    }

    async createOffer(): Promise<{ type: string; sdp?: string }> {
      if (config.failCreateOffer) throw new Error('blocked');
      return { type: 'offer', sdp: '' };
    }

    async setLocalDescription(_desc: { type: string; sdp?: string }): Promise<void> {
      // Emit candidates asynchronously, like real WebRTC.
      const delay = config.emitDelayMs ?? 0;
      const cands = config.candidates;
      setTimeout(() => {
        if (this.closed) return;
        for (const c of cands) {
          if (this.closed) return;
          this.onicecandidate?.({ candidate: c });
        }
        // End-of-candidates sentinel.
        if (!this.closed) this.onicecandidate?.({ candidate: null });
      }, delay);
    }

    close(): void {
      this.closed = true;
    }
  };
}

function makeGeoNavigator(opts: {
  latitude: number;
  longitude: number;
  failWith?: { code?: number; message?: string };
  delayMs?: number;
}): {
  geolocation: {
    getCurrentPosition: (
      success: (pos: { coords: { latitude: number; longitude: number } }) => void,
      error?: (err: { code?: number; message?: string }) => void,
    ) => void;
  };
} {
  return {
    geolocation: {
      getCurrentPosition: (success, error) => {
        const delay = opts.delayMs ?? 0;
        setTimeout(() => {
          if (opts.failWith) {
            error?.(opts.failWith);
            return;
          }
          success({ coords: { latitude: opts.latitude, longitude: opts.longitude } });
        }, delay);
      },
    },
  };
}

function makeNoGeoNavigator(): { geolocation: undefined } {
  return { geolocation: undefined };
}

const HEX64_RE = /^[0-9a-f]{64}$/;

describe('intelligence/spatial-memory', () => {
  test('wifi fingerprint is stable across calls in the same context', async () => {
    const PC = makeFakePCCtor({
      candidates: [
        { candidate: 'candidate:1 1 udp 1 192.168.1.42 54321 typ host' },
      ],
    });
    const subtle = globalThis.crypto.subtle;
    const a = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1000,
      navigator: makeNoGeoNavigator(),
    });
    const b = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 2000,
      navigator: makeNoGeoNavigator(),
    });

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.source).toBe('wifi');
    expect(b?.source).toBe('wifi');
    expect(a?.id).toBe(b?.id ?? '');
    expect(HEX64_RE.test(a?.id ?? '')).toBe(true);
  });

  test('different IPs produce different wifi fingerprints', async () => {
    const subtle = globalThis.crypto.subtle;

    const homePC = makeFakePCCtor({
      candidates: [{ candidate: 'candidate:1 1 udp 1 192.168.1.42 54321 typ host' }],
    });
    const cafePC = makeFakePCCtor({
      candidates: [{ candidate: 'candidate:1 1 udp 1 10.0.0.7 54321 typ host' }],
    });

    const home = await currentSpace({
      RTCPeerConnection: homePC,
      subtle,
      now: () => 1000,
      navigator: makeNoGeoNavigator(),
    });
    const cafe = await currentSpace({
      RTCPeerConnection: cafePC,
      subtle,
      now: () => 2000,
      navigator: makeNoGeoNavigator(),
    });

    expect(home?.id).not.toBe(cafe?.id ?? '');
    expect(home?.source).toBe('wifi');
    expect(cafe?.source).toBe('wifi');
  });

  test('skips mDNS hostnames and falls through to geo', async () => {
    const PC = makeFakePCCtor({
      candidates: [
        { candidate: 'candidate:1 1 udp 1 abcdef12-3456.local 54321 typ host' },
      ],
    });
    const nav = makeGeoNavigator({ latitude: 52.3702, longitude: 4.8952 });
    const subtle = globalThis.crypto.subtle;

    const space = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 5000,
      navigator: nav,
      wifiTimeoutMs: 50,
    });

    expect(space).not.toBeNull();
    expect(space?.source).toBe('geo');
    expect(HEX64_RE.test(space?.id ?? '')).toBe(true);
  });

  test('returns null when both wifi and geo are unavailable', async () => {
    const PC = makeFakePCCtor({ candidates: [], failCreateOffer: true });
    const subtle = globalThis.crypto.subtle;
    const nav = makeNoGeoNavigator();

    const space = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1,
      navigator: nav,
      wifiTimeoutMs: 30,
    });

    expect(space).toBeNull();
  });

  test('returns null when geolocation errors and wifi is absent', async () => {
    const subtle = globalThis.crypto.subtle;
    // No RTCPeerConnection injected and none on globalThis (in this happy-dom-free
    // bun runtime the global is undefined). Pass an explicit failing PC ctor.
    const PC = makeFakePCCtor({ candidates: [], failCreateOffer: true });
    const nav = makeGeoNavigator({
      latitude: 0,
      longitude: 0,
      failWith: { code: 1, message: 'denied' },
    });

    const space = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1,
      navigator: nav,
      wifiTimeoutMs: 30,
      geoTimeoutMs: 30,
    });

    expect(space).toBeNull();
  });

  test('raw IP never appears in the returned id', async () => {
    const ip = '192.168.1.42';
    const PC = makeFakePCCtor({
      candidates: [{ candidate: `candidate:1 1 udp 1 ${ip} 54321 typ host` }],
    });
    const subtle = globalThis.crypto.subtle;

    const space = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1000,
      navigator: makeNoGeoNavigator(),
    });

    expect(space).not.toBeNull();
    const id = space?.id ?? '';
    expect(id.length).toBe(64);
    expect(HEX64_RE.test(id)).toBe(true);
    expect(id.includes(ip)).toBe(false);
    expect(id.includes('192')).toBe(false);
  });

  test('raw coords never appear in the returned id', async () => {
    const lat = 52.3702;
    const lon = 4.8952;
    const subtle = globalThis.crypto.subtle;
    const PC = makeFakePCCtor({ candidates: [], failCreateOffer: true });
    const nav = makeGeoNavigator({ latitude: lat, longitude: lon });

    const space = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1000,
      navigator: nav,
      wifiTimeoutMs: 30,
    });

    expect(space).not.toBeNull();
    const id = space?.id ?? '';
    expect(id.length).toBe(64);
    expect(HEX64_RE.test(id)).toBe(true);
    expect(id.includes('52.3')).toBe(false);
    expect(id.includes('4.8')).toBe(false);
    expect(id.includes('370')).toBe(false);
    expect(id.includes('895')).toBe(false);
  });

  test('observations counter increments on subsequent calls', async () => {
    const PC = makeFakePCCtor({
      candidates: [{ candidate: 'candidate:1 1 udp 1 192.168.1.99 54321 typ host' }],
    });
    const subtle = globalThis.crypto.subtle;

    const a = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1000,
      navigator: makeNoGeoNavigator(),
    });
    expect(a?.observations).toBe(1);
    expect(a?.firstSeenAt).toBe(1000);
    expect(a?.lastSeenAt).toBe(1000);

    const b = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 7500,
      navigator: makeNoGeoNavigator(),
    });
    expect(b?.id).toBe(a?.id ?? '');
    expect(b?.observations).toBe(2);
    expect(b?.firstSeenAt).toBe(1000);
    expect(b?.lastSeenAt).toBe(7500);

    const c = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 9000,
      navigator: makeNoGeoNavigator(),
    });
    expect(c?.observations).toBe(3);
    expect(c?.firstSeenAt).toBe(1000);
    expect(c?.lastSeenAt).toBe(9000);
  });

  test('setSpaceLabel persists the label on subsequent reads', async () => {
    const PC = makeFakePCCtor({
      candidates: [{ candidate: 'candidate:1 1 udp 1 192.168.5.5 54321 typ host' }],
    });
    const subtle = globalThis.crypto.subtle;

    const first = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 1000,
      navigator: makeNoGeoNavigator(),
    });
    expect(first?.label).toBeNull();

    await setSpaceLabel(first?.id ?? '', 'kitchen');

    const peeked = await _peekSpace(first?.id ?? '');
    expect(peeked?.label).toBe('kitchen');

    // A second observation preserves the label.
    const again = await currentSpace({
      RTCPeerConnection: PC,
      subtle,
      now: () => 2000,
      navigator: makeNoGeoNavigator(),
    });
    expect(again?.label).toBe('kitchen');
    expect(again?.observations).toBe(2);
  });

  test('setSpaceLabel on an unknown id is a no-op (no row created)', async () => {
    await setSpaceLabel('a'.repeat(64), 'phantom');
    const peeked = await _peekSpace('a'.repeat(64));
    expect(peeked).toBeNull();
  });
});
