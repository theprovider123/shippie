import { describe, expect, test } from 'bun:test';
import { discoverPublicIp, isPrivateAddress, parseSrflxIp } from './stun.ts';

describe('parseSrflxIp', () => {
  test('extracts srflx IPv4', () => {
    const c = 'candidate:1 1 udp 2122260223 203.0.113.42 12345 typ srflx raddr 0.0.0.0 rport 0';
    expect(parseSrflxIp(c)).toBe('203.0.113.42');
  });

  test('extracts srflx IPv6', () => {
    const c = 'candidate:1 1 udp 2122260223 2001:db8::1 12345 typ srflx';
    expect(parseSrflxIp(c)).toBe('2001:db8::1');
  });

  test('ignores host candidates', () => {
    const c = 'candidate:1 1 udp 2122260223 192.168.1.5 12345 typ host';
    expect(parseSrflxIp(c)).toBeNull();
  });

  test('ignores mDNS placeholder', () => {
    const c =
      'candidate:1 1 udp 2122260223 deadbeef-1234.local 12345 typ srflx';
    expect(parseSrflxIp(c)).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  const cases: ReadonlyArray<readonly [string, boolean]> = [
    ['10.0.0.1', true],
    ['192.168.1.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['127.0.0.1', true],
    ['8.8.8.8', false],
    ['203.0.113.5', false],
    ['fe80::1', true],
    ['fd12:3456:789a::1', true],
    ['2001:db8::1', false],
  ];
  for (const [ip, expected] of cases) {
    test(`${ip} → ${expected}`, () => {
      expect(isPrivateAddress(ip)).toBe(expected);
    });
  }
});

describe('discoverPublicIp', () => {
  test('resolves first public srflx candidate', async () => {
    class FakePC {
      onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
      createDataChannel() {}
      async createOffer() {
        // Schedule candidate emission after offer creation
        queueMicrotask(() => {
          this.onicecandidate?.({
            candidate: {
              candidate:
                'candidate:1 1 udp 2122260223 192.168.1.5 12345 typ host',
            },
          });
          this.onicecandidate?.({
            candidate: {
              candidate:
                'candidate:1 1 udp 2122260223 203.0.113.42 12345 typ srflx',
            },
          });
        });
        return { sdp: '', type: 'offer' as const };
      }
      async setLocalDescription() {}
      close() {}
    }
    const ip = await discoverPublicIp({
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
      timeoutMs: 1000,
    });
    expect(ip).toBe('203.0.113.42');
  });

  test('returns null when no public candidate surfaces before timeout', async () => {
    class FakePC {
      onicecandidate: ((e: { candidate: null }) => void) | null = null;
      createDataChannel() {}
      async createOffer() {
        queueMicrotask(() => this.onicecandidate?.({ candidate: null }));
        return { sdp: '', type: 'offer' as const };
      }
      async setLocalDescription() {}
      close() {}
    }
    const ip = await discoverPublicIp({
      RTCPeerConnection: FakePC as unknown as typeof RTCPeerConnection,
      timeoutMs: 100,
    });
    expect(ip).toBeNull();
  });

  test('returns null when RTCPeerConnection is unavailable', async () => {
    const ip = await discoverPublicIp({
      RTCPeerConnection: undefined as unknown as typeof RTCPeerConnection,
    });
    expect(ip).toBeNull();
  });
});
