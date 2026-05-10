import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createSoundBank, isMuted, setMuted, toggleMuted } from './sound';

// Mock localStorage for the muted persistence helpers.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  length: 0,
  key: () => null,
} as unknown as Storage;

beforeEach(() => store.clear());
afterEach(() => store.clear());

describe('mute persistence', () => {
  test('isMuted defaults false when no flag', () => {
    expect(isMuted()).toBe(false);
  });

  test('setMuted(true) persists', () => {
    setMuted(true);
    expect(store.get('shippie:juice:mute')).toBe('1');
    expect(isMuted()).toBe(true);
  });

  test('setMuted(false) clears the flag', () => {
    setMuted(true);
    setMuted(false);
    expect(store.has('shippie:juice:mute')).toBe(false);
    expect(isMuted()).toBe(false);
  });

  test('toggleMuted flips and returns the new state', () => {
    expect(toggleMuted()).toBe(true);
    expect(isMuted()).toBe(true);
    expect(toggleMuted()).toBe(false);
    expect(isMuted()).toBe(false);
  });
});

describe('createSoundBank', () => {
  test('returns a play()/warm() shape', () => {
    const bank = createSoundBank({ tap: { freq: 440, durationMs: 50 } });
    expect(typeof bank.play).toBe('function');
    expect(typeof bank.warm).toBe('function');
  });

  test('play does not throw when AudioContext is unavailable (server-side)', () => {
    const bank = createSoundBank({ tap: { freq: 440, durationMs: 50 } });
    // No window object → ctx() returns null and play is a no-op.
    expect(() => bank.play('tap')).not.toThrow();
  });

  test('play does not throw when muted', () => {
    setMuted(true);
    const bank = createSoundBank({ tap: { freq: 440, durationMs: 50 } });
    expect(() => bank.play('tap')).not.toThrow();
  });

  test('play with unknown name is silent (no-op)', () => {
    const bank = createSoundBank<'tap'>({ tap: { freq: 440, durationMs: 50 } });
    // Force-cast for the test; runtime should ignore unknown keys.
    expect(() => bank.play('unknown' as 'tap')).not.toThrow();
  });
});
