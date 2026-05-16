/**
 * Smoke test — confirms the App export resolves and is a callable.
 * Generated showcases ship this file so `bun test` always finds at
 * least one entry. Replace or augment as the showcase grows.
 */
import { describe, expect, test } from 'bun:test';
import { App, mergeCrewtripState } from './App.tsx';
import {
  BACKUP_KEY,
  STORAGE_KEY,
  buildCrewReturnUrl,
  buildShareUrl,
  buildTripTimelineItems,
  clearPollVote,
  createRecoveryPack,
  initialRole,
  isMeaningfulBroadcast,
  latestLocalBackupForEvent,
  normalizeEventCode,
  normalizeCrewtripState,
  normalizePlaylistUrl,
  playlistProviderLabel,
  pollSelectionForPlayer,
  readHostedLocalBackups,
  resolveInitialCrewtripState,
  setPollVote,
} from './utils/state.ts';
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

  test('keeps soundtrack slots during realtime merges', () => {
    const base = makeState();
    const local: CrewtripState = {
      ...base,
      updatedAt: 20,
      updatedBy: 'local',
      soundtracks: [{ id: 'dj-local', time: '21:00', title: 'Warm-up', dj: 'Alex', status: 'later' }],
    };
    const remote: CrewtripState = {
      ...base,
      updatedAt: 21,
      updatedBy: 'remote',
      soundtracks: [{ id: 'dj-remote', time: '23:00', title: 'After-hours', dj: 'Sam', status: 'later' }],
    };

    const merged = mergeCrewtripState(remote, local);

    expect(merged.soundtracks.map((slot) => slot.id).sort()).toEqual(['dj-local', 'dj-remote']);
  });

  test('normalizes playlist URLs and labels known services', () => {
    expect(normalizePlaylistUrl('open.spotify.com/playlist/abc')).toBe('https://open.spotify.com/playlist/abc');
    expect(normalizePlaylistUrl('javascript:alert(1)')).toBeUndefined();
    expect(playlistProviderLabel('https://soundcloud.com/crew/set')).toBe('Open SoundCloud');
    expect(playlistProviderLabel('https://music.apple.com/gb/playlist/demo')).toBe('Open Apple Music');
  });

  test('keeps poll votes tied to saved player identity across refreshes', () => {
    const poll = makeState().polls[0]!;
    const firstVote = setPollVote(poll, 'o1', 'alex');
    const repeatVote = setPollVote(firstVote, 'o1', 'alex');
    const cleared = clearPollVote(repeatVote, 'alex');

    expect(pollSelectionForPlayer(firstVote, 'alex')).toBe('o1');
    expect(repeatVote.options[0]?.votes).toBe(1);
    expect(repeatVote.options[0]?.voterIds).toEqual(['alex']);
    expect(pollSelectionForPlayer(cleared, 'alex')).toBeUndefined();
    expect(cleared.options[0]?.votes).toBe(0);
  });

  test('moves a player vote instead of double-counting it', () => {
    const poll = {
      ...makeState().polls[0]!,
      options: [
        { id: 'o1', label: 'Yes', votes: 0 },
        { id: 'o2', label: 'No', votes: 0 },
      ],
    };

    const moved = setPollVote(setPollVote(poll, 'o1', 'alex'), 'o2', 'alex');

    expect(pollSelectionForPlayer(moved, 'alex')).toBe('o2');
    expect(moved.options.map((option) => option.votes)).toEqual([0, 1]);
  });

  test('keeps crew invite links crew-scoped even on a host device', () => {
    withWindow('https://shippie.app/run/crewtrip/?event=CREW-TEST&role=crew', {}, () => {
      expect(initialRole('CREW-TEST')).toBe('eventee');
    });
    withWindow('https://shippie.app/run/crewtrip/?event=CREW-TEST&role=join-host', {}, () => {
      expect(initialRole('CREW-TEST')).toBe('eventee');
    });
    withWindow('https://shippie.app/run/crewtrip/?event=CREW-TEST&role=join-host', {
      'shippie-crewtrip-host-v1:CREW-TEST': '1',
    }, () => {
      expect(initialRole('CREW-TEST')).toBe('host');
    });
    withWindow('https://shippie.app/run/crewtrip/?event=CREW-TEST&role=crew', {
      'shippie-crewtrip-host-v1:CREW-TEST': '1',
    }, () => {
      expect(initialRole('CREW-TEST')).toBe('eventee');
    });
    withWindow('https://shippie.app/run/crewtrip/', {
      'shippie-crewtrip-host-v1:CREW-TEST': '1',
    }, () => {
      expect(initialRole('CREW-TEST')).toBe('host');
    });
  });

  test('normalizes typed and linked trip codes', () => {
    expect(normalizeEventCode(' olive porch 07 ')).toBe('OLIVE-PORCH-07');
    expect(normalizeEventCode('olive/porch/07')).toBe('OLIVE-PORCH-07');
    withWindow('https://shippie.app/run/crewtrip/?event=olive%20porch%2007&role=crew', {}, () => {
      expect(initialRole('OLIVE-PORCH-07')).toBe('eventee');
    });
  });

  test('keeps host return links as separate bearer links', () => {
    withWindow('https://shippie.app/run/crewtrip/', {}, () => {
      const hostLink = new URL(buildShareUrl('CREW-TEST', 'join-host', 'host-token-test'));
      expect(hostLink.searchParams.get('role')).toBe('join-host');
      expect(hostLink.searchParams.get('event')).toBe('CREW-TEST');
      expect(hostLink.searchParams.get('host')).toBe('host-token-test');

      const crewLink = new URL(buildShareUrl('CREW-TEST', 'crew', 'host-token-test'));
      expect(crewLink.searchParams.get('role')).toBe('crew');
      expect(crewLink.searchParams.has('host')).toBe(false);
    });
  });

  test('builds crew device switch links without leaking host access', () => {
    withWindow('https://shippie.app/run/crewtrip/', {}, () => {
      const crewLink = new URL(buildCrewReturnUrl('CREW-TEST', 'crew-123'));
      expect(crewLink.searchParams.get('role')).toBe('crew');
      expect(crewLink.searchParams.get('event')).toBe('CREW-TEST');
      expect(crewLink.searchParams.get('player')).toBe('crew-123');
      expect(crewLink.searchParams.has('host')).toBe(false);
    });
  });

  test('exposes plan stop ids so hosts can edit posted plan items', () => {
    const state = makeState();
    const items = buildTripTimelineItems(state, 'day-1', state.days, state.groups, 'host', state.players[0]!);
    const planItem = items.find((item) => item.kind === 'plan');

    expect(planItem?.stopId).toBe('s1');
  });

  test('keeps generic host broadcasts out of day timelines', () => {
    const state: CrewtripState = {
      ...makeState(),
      days: [
        { id: 'day-1', label: 'Day 1', date: 'Fri' },
        { id: 'day-2', label: 'Day 2', date: 'Sat' },
      ],
      stops: [
        { id: 's1', dayId: 'day-1', time: '10:00', title: 'Breakfast', place: 'Cafe', status: 'now' },
        { id: 's2', dayId: 'day-2', time: '12:00', title: 'Beach', place: 'Pier', status: 'later' },
      ],
      broadcasts: [{ id: 'b1', text: 'Host updated the plan: Breakfast', at: '11:00' }],
    };

    const dayOne = buildTripTimelineItems(state, 'day-1', state.days, state.groups, 'eventee', state.players[0]!);
    const dayTwo = buildTripTimelineItems(state, 'day-2', state.days, state.groups, 'eventee', state.players[0]!);

    expect(dayOne.some((item) => item.kind === 'host')).toBe(false);
    expect(dayTwo.some((item) => item.kind === 'host')).toBe(false);
    expect(dayOne.some((item) => item.stopId === 's1')).toBe(true);
    expect(dayOne.some((item) => item.stopId === 's2')).toBe(false);
    expect(dayTwo.some((item) => item.stopId === 's2')).toBe(true);
    expect(dayTwo.some((item) => item.stopId === 's1')).toBe(false);
  });

  test('keeps legacy dayless timeline items on the first trip day only', () => {
    const state: CrewtripState = {
      ...makeState(),
      days: [
        { id: 'day-1', label: 'Day 1', date: 'Fri' },
        { id: 'day-2', label: 'Day 2', date: 'Sat' },
      ],
      stops: [],
      polls: [{ id: 'p-legacy', question: 'Legacy poll', closes: 'Open', open: true, options: [{ id: 'o1', label: 'Yes', votes: 0 }] }],
      challenges: [{ id: 'c-legacy', kind: 'mission', title: 'Legacy challenge', points: 5, doneBy: [] }],
      soundtracks: [{ id: 'dj-legacy', time: '20:00', title: 'Legacy set', dj: 'Host', status: 'later' }],
      tournaments: [{
        id: 'tour-legacy',
        name: 'Legacy tournament',
        hostId: 'host',
        createdAt: 1,
        status: 'setup',
        leaderboardView: 'points',
        updatedAt: 1,
        updatedBy: 'seed',
      }],
      tournamentEvents: [{
        id: 'event-legacy',
        tournamentId: 'tour-legacy',
        name: 'Legacy event',
        format: 'bracket',
        mode: 'individual',
        participantIds: ['alex'],
        status: 'setup',
        scoringMode: 'placement',
        order: 1,
        updatedAt: 1,
        updatedBy: 'seed',
      }],
    };

    const dayOne = buildTripTimelineItems(state, 'day-1', state.days, state.groups, 'host', state.players[0]!);
    const dayTwo = buildTripTimelineItems(state, 'day-2', state.days, state.groups, 'host', state.players[0]!);

    expect(new Set(dayOne.map((item) => item.id))).toEqual(new Set([
      'poll-p-legacy',
      'tournament-event-legacy',
      'game-c-legacy',
      'soundtrack-dj-legacy',
    ]));
    expect(dayTwo).toEqual([]);
  });

  test('normalizes legacy dayless trip records onto the first day', () => {
    const normalized = normalizeCrewtripState({
      ...makeState(),
      polls: [{ id: 'p-legacy', question: 'Legacy poll', closes: 'Open', open: true, options: [{ id: 'o1', label: 'Yes', votes: 0 }] }],
      challenges: [{ id: 'c-legacy', title: 'Legacy challenge', points: 5, doneBy: [] }],
      soundtracks: [{ id: 'dj-legacy', time: '20:00', title: 'Legacy set', dj: 'Host', status: 'later' }],
    });

    expect(normalized.polls[0]?.dayId).toBe('day-1');
    expect(normalized.challenges[0]?.dayId).toBe('day-1');
    expect(normalized.soundtracks[0]?.dayId).toBe('day-1');
  });

  test('filters generated broadcast noise from pinned update surfaces', () => {
    expect(isMeaningfulBroadcast({ id: 'b1', text: 'Host updated the plan: Breakfast', at: '11:00' })).toBe(false);
    expect(isMeaningfulBroadcast({ id: 'b2', text: 'Alex voted.', at: '11:01' })).toBe(false);
    expect(isMeaningfulBroadcast({ id: 'b3', text: 'Dinner moved to 19:30. Meet outside.', at: '11:02' })).toBe(true);
  });

  test('restores the joined event from a local backup when active storage was replaced', () => {
    const active = { ...makeState(), eventCode: 'OTHER-TRIP-01', eventName: 'Other trip' };
    const hosted = {
      ...makeState(),
      eventCode: 'HOST-TRIP-01',
      eventName: 'Hosted weekend',
      memories: [{ id: 'm-hosted', author: 'Host', kind: 'text' as const, text: 'Original plan', at: '12:00' }],
    };
    const backup = {
      id: 'backup_1',
      eventCode: hosted.eventCode,
      eventName: hosted.eventName,
      at: 123,
      reason: 'auto' as const,
      bytes: 100,
      pack: createRecoveryPack(hosted),
    };

    withWindow('https://shippie.app/run/crewtrip/?event=host%20trip%2001&role=join-host', {
      [STORAGE_KEY]: JSON.stringify(active),
      [BACKUP_KEY]: JSON.stringify([backup]),
      'shippie-crewtrip-host-v1:HOST-TRIP-01': '1',
    }, () => {
      const restored = resolveInitialCrewtripState(localStorage.getItem(STORAGE_KEY), 'host trip 01');

      expect(latestLocalBackupForEvent('host trip 01')?.eventName).toBe('Hosted weekend');
      expect(readHostedLocalBackups()[0]?.eventCode).toBe('HOST-TRIP-01');
      expect(restored.eventCode).toBe('HOST-TRIP-01');
      expect(restored.eventName).toBe('Hosted weekend');
      expect(restored.memories.some((memory) => memory.id === 'm-hosted')).toBe(true);
    });
  });
});

function withWindow(url: string, store: Record<string, string>, fn: () => void) {
  const previous = (globalThis as typeof globalThis & { window?: unknown }).window;
  const storage: Storage = {
    length: Object.keys(store).length,
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  (globalThis as { window?: unknown }).window = {
    location: new URL(url),
    localStorage: storage,
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  try {
    fn();
  } finally {
    (globalThis as { window?: unknown }).window = previous;
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
  }
}

function makeState(): CrewtripState {
  return {
    updatedAt: 1,
    updatedBy: 'seed',
    eventName: 'Crewtrip',
    location: 'Trip HQ',
    eventCode: 'CREW-TEST',
    hostAccessToken: 'host-token-test',
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
    soundtracks: [],
    tournaments: [],
    tournamentEvents: [],
    tournamentMatches: [],
    wrapUp: {
      published: false,
      title: 'Wrapped',
      note: 'Done',
      includeGames: true,
      includePolls: true,
      includeTimeline: true,
      assignedAwards: [],
    },
    features: {
      crew: true,
      plan: true,
      polls: true,
      games: true,
      tournaments: true,
      requests: true,
      memories: true,
      chat: true,
      wrap: true,
      scores: true,
      soundtrack: true,
      surprises: true,
    },
    language: 'en',
    theme: 'sunset',
  };
}
