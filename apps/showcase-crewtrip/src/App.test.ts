/**
 * Smoke test — confirms the App export resolves and is a callable.
 * Generated showcases ship this file so `bun test` always finds at
 * least one entry. Replace or augment as the showcase grows.
 */
import { describe, expect, test } from 'bun:test';
import { App, mergeCrewtripState } from './App.tsx';
import type { CrewtripState } from './App.tsx';

describe('App', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });

  test('merges concurrent realtime snapshots by collection', () => {
    const base = makeState();
    const local: CrewtripState = {
      ...base,
      updatedAt: 20,
      updatedBy: 'local',
      memories: [{ id: 'm-new', author: 'Alex', kind: 'text', text: 'Bonjour', at: '12:00' }, ...base.memories],
    };
    const remote: CrewtripState = {
      ...base,
      updatedAt: 21,
      updatedBy: 'remote',
      requests: [{ id: 'r-new', authorId: 'sam', authorName: 'Sam', text: 'Add a beach stop', status: 'new', at: '12:01' }, ...base.requests],
    };

    const merged = mergeCrewtripState(remote, local);

    expect(merged.memories.some((memory) => memory.id === 'm-new')).toBe(true);
    expect(merged.requests.some((request) => request.id === 'r-new')).toBe(true);
    expect(merged.activePlayerId).toBe(local.activePlayerId);
  });

  test('unions challenge completions and poll voters', () => {
    const base = makeState();
    const local: CrewtripState = {
      ...base,
      updatedAt: 20,
      updatedBy: 'local',
      challenges: [{ ...base.challenges[0]!, doneBy: ['alex'] }],
      polls: [{ ...base.polls[0]!, options: [{ ...base.polls[0]!.options[0]!, votes: 1, voterIds: ['alex'] }] }],
    };
    const remote: CrewtripState = {
      ...base,
      updatedAt: 21,
      updatedBy: 'remote',
      challenges: [{ ...base.challenges[0]!, doneBy: ['sam'] }],
      polls: [{ ...base.polls[0]!, options: [{ ...base.polls[0]!.options[0]!, votes: 1, voterIds: ['sam'] }] }],
    };

    const merged = mergeCrewtripState(remote, local);

    expect(merged.challenges[0]?.doneBy.sort()).toEqual(['alex', 'sam']);
    expect(merged.polls[0]?.options[0]?.voterIds?.sort()).toEqual(['alex', 'sam']);
    expect(merged.polls[0]?.options[0]?.votes).toBe(2);
  });

  test('merges game entries and cheers without dropping media proof', () => {
    const base = makeState();
    const local: CrewtripState = {
      ...base,
      updatedAt: 20,
      updatedBy: 'local',
      challenges: [{
        ...base.challenges[0]!,
        doneBy: ['alex'],
        submissions: [{ id: 'entry-1', playerId: 'alex', playerName: 'Alex', text: 'Best outfit proof', at: '12:00', mediaDataUrl: 'data:image/png;base64,abc', mediaKind: 'image', cheers: ['sam'] }],
      }],
    };
    const remote: CrewtripState = {
      ...base,
      updatedAt: 21,
      updatedBy: 'remote',
      challenges: [{
        ...base.challenges[0]!,
        doneBy: ['sam'],
        submissions: [{ id: 'entry-1', playerId: 'alex', playerName: 'Alex', text: 'Best outfit proof', at: '12:00', mediaDataUrl: 'data:image/png;base64,abc', mediaKind: 'image', cheers: ['host'] }],
      }],
    };

    const merged = mergeCrewtripState(remote, local);
    const entry = merged.challenges[0]?.submissions?.[0];

    expect(merged.challenges[0]?.doneBy.sort()).toEqual(['alex', 'sam']);
    expect(entry?.mediaDataUrl).toBe('data:image/png;base64,abc');
    expect(entry?.cheers.sort()).toEqual(['host', 'sam']);
  });

  test('keeps newer player profile edits during realtime merges', () => {
    const base = makeState();
    const local: CrewtripState = {
      ...base,
      updatedAt: 22,
      updatedBy: 'local',
      players: [{ ...base.players[0]!, team: 'Beach crew', groupId: 'beach', avatarDataUrl: 'data:image/jpeg;base64,local-avatar', avatarName: 'alex.jpg' }],
    };
    const remote: CrewtripState = {
      ...base,
      updatedAt: 20,
      updatedBy: 'remote',
      players: [{ ...base.players[0]!, score: 12 }],
    };

    const merged = mergeCrewtripState(remote, local);

    expect(merged.players[0]?.team).toBe('Beach crew');
    expect(merged.players[0]?.groupId).toBe('beach');
    expect(merged.players[0]?.avatarDataUrl).toBe('data:image/jpeg;base64,local-avatar');
    expect(merged.players[0]?.score).toBe(12);
  });
});

function makeState(): CrewtripState {
  return {
    updatedAt: 1,
    updatedBy: 'seed',
    eventName: 'Crewtrip',
    location: 'Trip HQ',
    eventCode: 'CREW-TEST',
    description: 'Test trip',
    hostNote: 'Host note',
    energy: 50,
    activePlayerId: 'alex',
    days: [{ id: 'day-1', label: 'Day 1', date: 'Fri' }],
    groups: [{ id: 'all', name: 'All crew', color: '#f0bd55' }],
    stops: [{ id: 's1', dayId: 'day-1', time: 'Now', title: 'Start', place: 'HQ', status: 'now' }],
    polls: [{ id: 'p1', question: 'Pick one', closes: 'Open', open: true, options: [{ id: 'o1', label: 'Yes', votes: 0 }] }],
    players: [{ id: 'alex', name: 'Alex', team: 'All crew', groupId: 'all', color: '#4E7C9A', score: 0 }],
    challenges: [{ id: 'c1', kind: 'challenge', dayId: 'day-1', title: 'Do it', points: 8, doneBy: [] }],
    memories: [],
    broadcasts: [],
    requests: [],
    messages: [],
    pulses: [],
    surprises: [],
    wrapUp: {
      published: false,
      title: 'Wrapped',
      note: 'Done',
      includeGames: true,
      includePolls: true,
      includeTimeline: true,
    },
    features: {
      crew: true,
      plan: true,
      polls: true,
      games: true,
      requests: true,
      memories: true,
      chat: true,
      wrap: true,
      scores: true,
    },
    language: 'en',
    theme: 'sunset',
  };
}
