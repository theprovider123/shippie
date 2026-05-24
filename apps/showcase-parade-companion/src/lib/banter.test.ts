import { beforeEach, describe, expect, test } from 'bun:test';
import type { RouteBanterPoll } from '../data/parade-2026';
import {
  answerTrivia,
  banterFromPack,
  listBanterVotes,
  listTriviaAttempts,
  pollOptionLabel,
  selectedOptionId,
  selectedTriviaAttempt,
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

const trivia = {
  id: 'minutes',
  question: 'Who played the most?',
  answerId: 'rice',
  source: 'test',
  explainer: 'Rice was everywhere.',
  options: [
    { id: 'rice', label: 'Rice' },
    { id: 'saka', label: 'Saka' },
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

  test('answerTrivia stores one local attempt per card', () => {
    expect(answerTrivia(trivia, 'saka')?.correct).toBe(false);
    expect(selectedTriviaAttempt('minutes')?.optionId).toBe('saka');
    expect(answerTrivia(trivia, 'rice')?.correct).toBe(true);
    expect(listTriviaAttempts()).toHaveLength(1);
    expect(selectedTriviaAttempt('minutes')?.optionId).toBe('rice');
  });

  test('answerTrivia rejects unknown options', () => {
    expect(answerTrivia(trivia, 'unknown')).toBeNull();
    expect(listTriviaAttempts()).toHaveLength(0);
  });

  test('banterFromPack drops malformed live-pack banter rows', () => {
    const banter = banterFromPack({
      banter: {
        chants: [{ id: 'ok', title: 'OK', cue: 'OK', detail: 'Line one\nLine two' }, { id: '', title: 'Bad', cue: 'Bad', detail: 'Bad' }],
        polls: [poll, { id: 'bad', question: 'Bad', options: [{ id: 'x' }] } as never],
        trivia: [trivia, { ...trivia, id: 'bad', answerId: 'missing' }],
      },
    });

    expect(banter.chants).toHaveLength(1);
    expect(banter.polls).toHaveLength(1);
    expect(banter.trivia).toHaveLength(1);
  });
});
