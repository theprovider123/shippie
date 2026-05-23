import { beforeEach, describe, expect, test } from 'bun:test';
import type { RouteBanterPoll } from '../data/parade-2026';
import {
  listBanterVotes,
  listCheerCounts,
  pollOptionCount,
  selectedOptionId,
  tapCheer,
  totalPollVotes,
  voteInPoll,
} from './banter';

const poll: RouteBanterPoll = {
  id: 'player',
  question: 'Player',
  options: [
    { id: 'saka', label: 'Saka' },
    { id: 'rice', label: 'Rice' },
  ],
};

function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe('banter', () => {
  beforeEach(() => installFakeLocalStorage());

  test('voteInPoll stores one local vote per poll', () => {
    expect(voteInPoll(poll, 'saka')?.optionId).toBe('saka');
    expect(voteInPoll(poll, 'rice')?.optionId).toBe('rice');
    expect(listBanterVotes()).toHaveLength(1);
    expect(selectedOptionId('player')).toBe('rice');
    expect(totalPollVotes('player')).toBe(1);
    expect(pollOptionCount('player', 'rice')).toBe(1);
  });

  test('voteInPoll rejects unknown options', () => {
    expect(voteInPoll(poll, 'unknown')).toBeNull();
    expect(listBanterVotes()).toHaveLength(0);
  });

  test('tapCheer increments and persists', () => {
    expect(listCheerCounts().champions).toBe(0);
    tapCheer('champions');
    tapCheer('champions');
    expect(listCheerCounts().champions).toBe(2);
  });
});
