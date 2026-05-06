import { describe, expect, test, beforeEach } from 'bun:test';
import {
  generatePairCode,
  isValidPairCode,
  normalisePairCode,
  roomIdFor,
  generateDeviceId,
  loadPairing,
  savePairing,
  clearPairing,
  type Pairing,
} from './pairing.ts';

describe('generatePairCode', () => {
  test('produces a WORD-WORD-NUMBER shape', () => {
    for (let i = 0; i < 32; i++) {
      const code = generatePairCode();
      expect(isValidPairCode(code)).toBe(true);
      expect(code).toMatch(/^[A-Z]+-[A-Z]+-\d{4}$/);
    }
  });
});

describe('isValidPairCode', () => {
  test('accepts well-formed codes', () => {
    expect(isValidPairCode('BIRCH-NORTH-3849')).toBe(true);
    expect(isValidPairCode('OPEN-KEY-1000')).toBe(true);
  });

  test('case-insensitive — lowercased input is valid (it gets normalised internally)', () => {
    expect(isValidPairCode('birch-north-3849')).toBe(true);
  });

  test('rejects malformed codes', () => {
    expect(isValidPairCode('BIRCH-3849')).toBe(false);
    expect(isValidPairCode('BIRCH-NORTH-99')).toBe(false);
    expect(isValidPairCode('BIRCH NORTH 3849')).toBe(false);
    expect(isValidPairCode('')).toBe(false);
  });
});

describe('normalisePairCode', () => {
  test('uppercases and trims', () => {
    expect(normalisePairCode('  birch-north-3849  ')).toBe('BIRCH-NORTH-3849');
  });
});

describe('roomIdFor', () => {
  test('two phones with the same code derive the same room id', () => {
    const code = 'BIRCH-NORTH-3849';
    expect(roomIdFor(code)).toBe(roomIdFor(code));
  });

  test('different codes produce different room ids', () => {
    expect(roomIdFor('BIRCH-NORTH-3849')).not.toBe(roomIdFor('BIRCH-NORTH-3850'));
    expect(roomIdFor('BIRCH-NORTH-3849')).not.toBe(roomIdFor('CALM-PATH-3849'));
  });

  test('always namespaces with co-pilot prefix', () => {
    expect(roomIdFor('BIRCH-NORTH-3849').startsWith('co-pilot-')).toBe(true);
  });
});

describe('generateDeviceId', () => {
  test('produces a unique-ish stable id', () => {
    const a = generateDeviceId();
    const b = generateDeviceId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });
});

describe('persistence', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  test('saves and loads a pairing', () => {
    if (typeof localStorage === 'undefined') return; // bun test runs without DOM by default
    const pairing: Pairing = {
      pairCode: 'BIRCH-NORTH-3849',
      deviceId: 'dev-abc123',
      role: 'a',
      pairedAt: 1_700_000_000_000,
    };
    savePairing(pairing);
    expect(loadPairing()).toEqual(pairing);
  });

  test('clearPairing removes the saved record', () => {
    if (typeof localStorage === 'undefined') return;
    const pairing: Pairing = {
      pairCode: 'CALM-PATH-1234',
      deviceId: 'dev-xyz',
      role: 'b',
      pairedAt: 1_700_000_000_000,
    };
    savePairing(pairing);
    clearPairing();
    expect(loadPairing()).toBe(null);
  });

  test('returns null when nothing saved', () => {
    if (typeof localStorage === 'undefined') return;
    expect(loadPairing()).toBe(null);
  });
});
