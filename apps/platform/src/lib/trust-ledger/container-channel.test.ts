import { describe, expect, it, beforeEach } from 'vitest';
import {
  CONTAINER_CHANNEL_LS_KEY,
  PINNED_CHANNEL,
  getPinnedChannel,
  isChannelHealthy,
  pinContainerChannel,
  releaseContainerChannel,
} from './container-channel';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('container channel pinning', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('returns null when nothing is pinned', () => {
    expect(getPinnedChannel(storage)).toBeNull();
  });

  it('pin + read round-trip', () => {
    pinContainerChannel(PINNED_CHANNEL, storage);
    expect(getPinnedChannel(storage)).toBe(PINNED_CHANNEL);
    expect(storage.getItem(CONTAINER_CHANNEL_LS_KEY)).toBe(PINNED_CHANNEL);
  });

  it('release clears the pin', () => {
    pinContainerChannel(PINNED_CHANNEL, storage);
    releaseContainerChannel(storage);
    expect(getPinnedChannel(storage)).toBeNull();
  });
});

describe('isChannelHealthy', () => {
  it('rejects when halted', () => {
    expect(
      isChannelHealthy({
        channel: 'next',
        devices_seen: 10_000,
        fail_closed_rate: 0,
        window_hours: 24,
        is_halted: true,
      }),
    ).toBe(false);
  });

  it('rejects when devices below threshold', () => {
    expect(
      isChannelHealthy({
        channel: 'next',
        devices_seen: 10,
        fail_closed_rate: 0,
        window_hours: 24,
        is_halted: false,
      }),
    ).toBe(false);
  });

  it('rejects when fail-closed rate exceeds gate', () => {
    expect(
      isChannelHealthy({
        channel: 'next',
        devices_seen: 10_000,
        fail_closed_rate: 0.05,
        window_hours: 24,
        is_halted: false,
      }),
    ).toBe(false);
  });

  it('accepts a healthy channel', () => {
    expect(
      isChannelHealthy({
        channel: 'next',
        devices_seen: 10_000,
        fail_closed_rate: 0.005,
        window_hours: 24,
        is_halted: false,
      }),
    ).toBe(true);
  });

  it('respects custom gates', () => {
    const signal = {
      channel: 'next',
      devices_seen: 50,
      fail_closed_rate: 0.001,
      window_hours: 24,
      is_halted: false,
    };
    expect(isChannelHealthy(signal, { minDevices: 25 })).toBe(true);
    expect(isChannelHealthy(signal, { minDevices: 100 })).toBe(false);
  });
});
