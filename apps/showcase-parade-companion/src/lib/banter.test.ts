import { beforeEach, describe, expect, test } from 'bun:test';
import type { RouteBanterPoll } from '../data/parade-2026';
import {
  listBanterVotes,
  listCheerCounts,
  pollOptionLabel,
  resetCheerCounts,
  selectedOptionId,
  tapCheer,
  voteInPoll,
} from './banter';

const poll: RouteBanterPoll = {
  id: 'player',
  question: 'Player',
  options: [
    { id: 'saka', label: 'Saka' },
    { id: 'rice', label: 'Rice' },
    { id: 'other', label: 'Other' },
  ],
  otherOptions: [
    { id: 'martinelli', label: 'Martinelli' },
    { id: 'havertz', label: 'Havertz' },
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
    expect(voteInPoll(poll, 'rice', { sourceId: 'me_123', displayName: 'Leah', supporterTag: 'A7K2' })?.optionId).toBe('rice');
    expect(listBanterVotes()).toHaveLength(1);
    expect(selectedOptionId('player')).toBe('rice');
    expect(listBanterVotes()[0]?.supporterTag).toBe('A7K2');
  });

  test('voteInPoll rejects unknown options', () => {
    expect(voteInPoll(poll, 'unknown')).toBeNull();
    expect(listBanterVotes()).toHaveLength(0);
  });

  test('voteInPoll accepts explicit otherOptions and labels them', () => {
    expect(voteInPoll(poll, 'martinelli')?.optionId).toBe('martinelli');
    expect(selectedOptionId('player')).toBe('martinelli');
    expect(pollOptionLabel(poll, 'martinelli')).toBe('Martinelli');
  });

  test('tapCheer increments and persists', () => {
    expect(listCheerCounts().champions).toBe(0);
    tapCheer('champions');
    tapCheer('champions');
    expect(listCheerCounts().champions).toBe(2);
  });

  test('resetCheerCounts clears every cheer tile', () => {
    tapCheer('champions');
    tapCheer('coyg');
    const reset = resetCheerCounts();
    expect(reset.champions).toBe(0);
    expect(reset.coyg).toBe(0);
    expect(listCheerCounts().champions).toBe(0);
  });
});
