import type {
  AwardEffect,
  CrewtripState,
  PollOption,
  Memory,
  Challenge,
  Player,
  GameSubmission,
  Poll,
  CrewGroup,
  TripDay,
  Role,
  ItineraryStop,
  SyncState,
  WrapUpSettings,
  CrewAward,
  Tab,
  TripTimelineItem,
  Language,
  ThemeKey,
  SurpriseDrop,
  RecoveryPack,
  LocalBackup,
  CrewPulse,
  SoundtrackSlot,
  Tournament,
  TournamentEvent,
  TournamentMatch,
} from '../types';
import { newId, newEventCode, timeNow, timeRank } from './ids';
import { paletteFor } from '../data/themes';

export const STORAGE_KEY = 'shippie-crewtrip-v3';
export const BACKUP_KEY = 'shippie-crewtrip-v3-backups';
export const DEVICE_KEY = 'shippie-crewtrip-device-id';
export const HOST_CLAIM_KEY_PREFIX = 'shippie-crewtrip-host-v1:';
export const LOCAL_PLAYER_KEY_PREFIX = 'shippie-crewtrip-player-v1:';
export const BACKUP_LIMIT_PER_EVENT = 8;
export const BACKUP_INTERVAL_MS = 45_000;
export const PUBLIC_CREWTRIP_URL = 'https://shippie.app/run/crewtrip/';

export function defaultGroupEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('beach') || lower.includes('sea') || lower.includes('pool')) return '☀';
  if (lower.includes('food') || lower.includes('dinner') || lower.includes('brunch')) return '◆';
  if (lower.includes('party') || lower.includes('dance')) return '✦';
  return '★';
}

export function crewColorAt(theme: ThemeKey, index: number): string {
  const palette = paletteFor(theme);
  const colors = palette.crewColors;
  return colors[index % colors.length]!;
}

export const initialState: CrewtripState = {
  updatedAt: 1,
  updatedBy: 'seed',
  eventName: 'Crewtrip',
  location: 'Trip HQ',
  eventCode: newEventCode(),
  description: 'The trip is what you make of it. Plans, votes, playlists, games, the moments worth keeping.',
  hostNote: 'Set the vibe. Invite the crew. The day is whatever you make of it together.',
  energy: 64,
  activePlayerId: 'host',
  days: [
    { id: 'day-1', label: 'Day 1', date: 'Fri' },
    { id: 'day-2', label: 'Day 2', date: 'Sat' },
  ],
  groups: [
    { id: 'all', name: 'All crew', color: '#F0BD55', emoji: '★' },
    { id: 'beach', name: 'Beach crew', color: '#5F91A3', emoji: '☀' },
    { id: 'food', name: 'Food squad', color: '#7B9868', emoji: '◆' },
  ],
  stops: [
    { id: 's1', dayId: 'day-1', time: '10:00', title: 'Host opens the trip', place: 'Join by link or QR', status: 'now' },
    { id: 's2', dayId: 'day-1', time: '11:30', title: 'Crew vote', place: 'Pick the first group move', status: 'next' },
    { id: 's3', dayId: 'day-2', time: '18:00', title: 'Memory drop', place: 'Best moments, photos, videos, quotes', status: 'later' },
  ],
  soundtracks: [
    { id: 'dj-1', dayId: 'day-1', time: '21:00', title: 'Sunset warm-up', dj: 'Host', link: 'https://open.spotify.com/', note: 'Crew playlist opens before dinner.', status: 'later' },
  ],
  polls: [
    {
      id: 'p1',
      question: 'What should the crew choose first?',
      closes: 'Open',
      open: true,
      options: [
        { id: 'o1', label: 'Food', votes: 2 },
        { id: 'o2', label: 'Drinks', votes: 3 },
        { id: 'o3', label: 'A game', votes: 1 },
      ],
    },
  ],
  players: [
    { id: 'host', name: 'Host', team: 'HQ', color: '#E8603C', score: 12 },
    { id: 'crew-1', name: 'Alex', team: 'Beach crew', groupId: 'beach', color: '#4E7C9A', score: 8 },
    { id: 'crew-2', name: 'Sam', team: 'Food squad', groupId: 'food', color: '#5E7B5C', score: 5 },
  ],
  challenges: [
    { id: 'c1', kind: 'photo', dayId: 'day-1', deadline: '14:00', status: 'open', title: 'Add the first group photo', points: 10, doneBy: [] },
    { id: 'c2', kind: 'mission', dayId: 'day-1', deadline: '16:00', status: 'open', title: 'Suggest a plan the host shares back', points: 8, doneBy: ['crew-1'] },
    { id: 'c3', kind: 'prediction', dayId: 'day-2', deadline: '12:00', status: 'open', title: 'Predict the winning group vote', points: 6, doneBy: [] },
  ],
  memories: [
    { id: 'm1', author: 'Host', kind: 'award', dayId: 'day-1', at: '10:05', text: 'First award goes to whoever gets everyone into the app.' },
    { id: 'm2', author: 'Alex', kind: 'text', dayId: 'day-1', at: '10:12', text: 'The trip starts when the first questionable plan gets approved.' },
  ],
  broadcasts: [
    { id: 'b1', text: 'Crewtrip is live. Add your name, vote, request, and drop memories.', at: '10:00' },
  ],
  requests: [
    { id: 'r1', authorId: 'crew-1', authorName: 'Alex', text: 'Can we add a food stop before the main plan?', status: 'new', at: '10:18' },
  ],
    messages: [
    { id: 'msg-1', authorId: 'host', authorName: 'Host', scope: 'all', text: 'Use chat for quick meet-up notes. Host updates stay pinned on Today.', at: '10:01' },
    { id: 'msg-2', authorId: 'crew-1', authorName: 'Alex', scope: 'group', groupId: 'beach', text: 'Beach crew checking in.', at: '10:09' },
  ],
    pulses: [
    { id: 'pulse-1', playerId: 'crew-1', playerName: 'Alex', groupId: 'beach', kind: 'hype', label: 'Hype', at: '10:16' },
    { id: 'pulse-2', playerId: 'crew-2', playerName: 'Sam', groupId: 'food', kind: 'hungry', label: 'Hungry', at: '10:20' },
  ],
  surprises: [
    { id: 'drop-1', title: 'First secret mission', message: 'Find the best proof that the crew has officially arrived.', unlockType: 'first-photo', unlockValue: 'first photo', createdAt: '10:00' },
  ],
  tournaments: [],
  tournamentEvents: [],
  tournamentMatches: [],
  wrapUp: {
    published: false,
    title: 'Crewtrip wrapped',
    note: 'Best moments, winners, votes, and the plan that actually happened.',
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
    tournaments: false,
    requests: true,
    memories: true,
    chat: false,
    wrap: true,
    scores: true,
    soundtrack: true,
    surprises: true,
  },
  language: 'en',
  theme: 'sunset',
};

export function createFreshCrewtripState(options: { eventCode?: string; language?: Language; theme?: ThemeKey } = {}): CrewtripState {
  const eventCode = options.eventCode ?? newEventCode();
  return {
    updatedAt: 1,
    updatedBy: 'seed',
    eventName: 'Crewtrip',
    location: 'Trip HQ',
    eventCode,
    description: 'A shared trip hub for plans, votes, games, playlists, requests, and memories.',
    hostNote: 'Set the vibe, invite the crew, then let everyone help shape the day.',
    energy: 50,
    language: options.language ?? initialState.language,
    theme: options.theme ?? initialState.theme,
    activePlayerId: 'host',
    days: [{ id: 'day-1', label: 'Day 1', date: 'Today' }],
    groups: [{ id: 'all', name: 'All crew', color: '#F0BD55', emoji: '★' }],
    stops: [{ id: 's1', dayId: 'day-1', time: 'TBC', title: 'Start planning', place: 'Add the first plan item', status: 'now' }],
    polls: [],
    players: [{ id: 'host', name: 'Host', team: 'All crew', groupId: 'all', color: '#E8603C', score: 0 }],
    challenges: [],
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
    wrapUp: { ...initialState.wrapUp, published: false },
    features: { ...initialState.features },
  };
}

export function markLocalUpdate(state: CrewtripState, deviceId: string): CrewtripState {
  return { ...state, updatedAt: Date.now(), updatedBy: deviceId };
}

export function legacyVoteIds(option?: PollOption): string[] {
  return Array.from({ length: option?.votes ?? 0 }, (_, index) => `legacy-${option?.id ?? 'option'}-${index}`);
}

export function normalizeCrewtripState(state: CrewtripState): CrewtripState {
  const days = state.days?.length ? state.days : initialState.days;
  const sourceGroups = state.groups?.length ? state.groups : initialState.groups;
  const groups = sourceGroups.map((group) => ({
    ...group,
    color: group.color ?? '#F0BD55',
    emoji: group.emoji ?? defaultGroupEmoji(group.name),
  }));
  return {
    ...initialState,
    ...state,
    days,
    groups,
    features: { ...initialState.features, ...(state.features ?? {}) },
    messages: state.messages ?? initialState.messages,
    pulses: state.pulses ?? initialState.pulses,
    surprises: state.surprises ?? initialState.surprises,
    soundtracks: state.soundtracks ?? initialState.soundtracks,
    tournaments: (state.tournaments ?? []).map((tournament) => ({
      ...tournament,
      status: tournament.status ?? 'setup',
      leaderboardView: tournament.leaderboardView ?? 'points',
    })),
    tournamentEvents: (state.tournamentEvents ?? []).map((event) => ({
      ...event,
      status: ((event.status as string) === 'upcoming' ? 'setup' : event.status ?? 'setup') as TournamentEvent['status'],
      scoringMode: event.scoringMode ?? 'placement',
    })),
    tournamentMatches: (state.tournamentMatches ?? []).map((match) => ({
      ...match,
      status: match.status ?? 'pending',
      readyParticipantIds: match.readyParticipantIds ?? [],
    })),
    wrapUp: { ...initialState.wrapUp, ...(state.wrapUp ?? {}), assignedAwards: (state.wrapUp?.assignedAwards ?? []).map(normalizeAssignedAward) },
    language: state.language ?? initialState.language,
    theme: state.theme ?? initialState.theme,
    stops: state.stops.map((stop, index) => ({ ...stop, dayId: stop.dayId ?? days[Math.min(index, days.length - 1)]?.id ?? days[0]!.id })),
    polls: state.polls.map((poll) => ({
      ...poll,
      options: poll.options.map((option) => ({ ...option, voterIds: option.voterIds ?? legacyVoteIds(option) })),
    })),
    challenges: state.challenges.map((challenge) => ({
      ...challenge,
      status: challenge.status ?? 'open',
      doneBy: challenge.doneBy ?? [],
      submissions: (challenge.submissions ?? []).map((submission) => ({ ...submission, cheers: submission.cheers ?? [] })),
    })),
    memories: state.memories.map((memory) => ({ ...memory, dayId: memory.dayId ?? days[0]!.id, at: memory.at ?? 'Now' })),
  };
}

function isRemoteNewer(remote: CrewtripState, current: CrewtripState): boolean {
  if (remote.updatedAt !== current.updatedAt) return remote.updatedAt > current.updatedAt;
  return remote.updatedBy > current.updatedBy;
}

function mergeById<T extends { id: string }>(current: T[], remote: T[], remoteWins: boolean): T[] {
  const map = new Map<string, T>();
  const first = remoteWins ? current : remote;
  const second = remoteWins ? remote : current;
  for (const item of first) map.set(item.id, item);
  for (const item of second) map.set(item.id, { ...(map.get(item.id) ?? item), ...item });
  return Array.from(map.values());
}

function mergeByUpdatedAtField<T extends { id: string; updatedAt: number; updatedBy: string }>(current: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of current) map.set(item.id, item);
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    const incomingWins = item.updatedAt !== existing.updatedAt
      ? item.updatedAt > existing.updatedAt
      : item.updatedBy > existing.updatedBy;
    if (incomingWins) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function sortTournaments(items: Tournament[]): Tournament[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function sortTournamentEvents(items: TournamentEvent[]): TournamentEvent[] {
  return [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function sortTournamentMatches(items: TournamentMatch[]): TournamentMatch[] {
  return [...items].sort((a, b) => a.roundIndex - b.roundIndex || a.index - b.index || a.id.localeCompare(b.id));
}

function normalizeAssignedAward(award: WrapUpSettings['assignedAwards'][number]): WrapUpSettings['assignedAwards'][number] {
  return {
    ...award,
    trophy: award.trophy ?? '🏆',
    effect: award.effect ?? 'gold',
  };
}

function mergePollOptions(current: PollOption[], remote: PollOption[], remoteWins: boolean): PollOption[] {
  return mergeById(current, remote, remoteWins).map((option) => {
    const local = current.find((item) => item.id === option.id);
    const incoming = remote.find((item) => item.id === option.id);
    const voters = Array.from(new Set([...(local?.voterIds ?? legacyVoteIds(local)), ...(incoming?.voterIds ?? legacyVoteIds(incoming))]));
    return {
      ...option,
      voterIds: voters,
      votes: Math.max(local?.votes ?? 0, incoming?.votes ?? 0, voters.length),
    };
  });
}

function mergePolls(current: Poll[], remote: Poll[], remoteWins: boolean): Poll[] {
  return mergeById(current, remote, remoteWins).map((poll) => {
    const localPoll = current.find((item) => item.id === poll.id);
    const remotePoll = remote.find((item) => item.id === poll.id);
    return {
      ...poll,
      options: mergePollOptions(localPoll?.options ?? [], remotePoll?.options ?? [], remoteWins),
    };
  });
}

function mergePlayers(current: Player[], remote: Player[], remoteWins: boolean): Player[] {
  return mergeById(current, remote, remoteWins).map((player) => {
    const local = current.find((item) => item.id === player.id);
    const incoming = remote.find((item) => item.id === player.id);
    return { ...player, score: Math.max(local?.score ?? 0, incoming?.score ?? 0) };
  });
}

function mergeGameSubmissions(current: GameSubmission[], remote: GameSubmission[], remoteWins: boolean): GameSubmission[] {
  return sortRecent(mergeById(current, remote, remoteWins).map((submission) => {
    const local = current.find((item) => item.id === submission.id);
    const incoming = remote.find((item) => item.id === submission.id);
    return {
      ...submission,
      cheers: Array.from(new Set([...(local?.cheers ?? []), ...(incoming?.cheers ?? [])])),
    };
  }));
}

function mergeChallenges(current: Challenge[], remote: Challenge[], remoteWins: boolean): Challenge[] {
  return mergeById(current, remote, remoteWins).map((challenge) => {
    const local = current.find((item) => item.id === challenge.id);
    const incoming = remote.find((item) => item.id === challenge.id);
    return {
      ...challenge,
      doneBy: Array.from(new Set([...(local?.doneBy ?? []), ...(incoming?.doneBy ?? [])])),
      submissions: mergeGameSubmissions(local?.submissions ?? [], incoming?.submissions ?? [], remoteWins),
      points: remoteWins ? (incoming?.points ?? local?.points ?? challenge.points) : (local?.points ?? incoming?.points ?? challenge.points),
    };
  });
}

export function sortRecent<T extends { id: string; at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => timeRank(b.at) - timeRank(a.at));
}

export function mergeCrewtripState(remoteRaw: CrewtripState, currentRaw: CrewtripState): CrewtripState {
  const remote = normalizeCrewtripState(remoteRaw);
  const current = normalizeCrewtripState(currentRaw);
  const remoteWins = isRemoteNewer(remote, current);
  const base = remoteWins ? remote : current;
  return {
    ...base,
    activePlayerId: current.activePlayerId,
    days: mergeById(current.days, remote.days, remoteWins),
    groups: mergeById(current.groups, remote.groups, remoteWins),
    stops: mergeById(current.stops, remote.stops, remoteWins),
    polls: mergePolls(current.polls, remote.polls, remoteWins),
    players: mergePlayers(current.players, remote.players, remoteWins),
    challenges: mergeChallenges(current.challenges, remote.challenges, remoteWins),
    memories: sortRecent(mergeById(current.memories, remote.memories, remoteWins)),
    broadcasts: sortRecent(mergeById(current.broadcasts, remote.broadcasts, remoteWins)),
    requests: sortRecent(mergeById(current.requests, remote.requests, remoteWins)),
    messages: sortRecent(mergeById(current.messages ?? [], remote.messages ?? [], remoteWins)),
    pulses: sortRecent(mergeById(current.pulses ?? [], remote.pulses ?? [], remoteWins)).slice(0, 36),
    surprises: sortRecent(mergeById(current.surprises ?? [], remote.surprises ?? [], remoteWins)),
    soundtracks: mergeById(current.soundtracks ?? [], remote.soundtracks ?? [], remoteWins),
    tournaments: sortTournaments(mergeByUpdatedAtField(current.tournaments ?? [], remote.tournaments ?? [])),
    tournamentEvents: sortTournamentEvents(mergeByUpdatedAtField(current.tournamentEvents ?? [], remote.tournamentEvents ?? [])),
    tournamentMatches: sortTournamentMatches(mergeByUpdatedAtField(current.tournamentMatches ?? [], remote.tournamentMatches ?? [])),
    features: { ...current.features, ...remote.features },
    wrapUp: remoteWins ? { ...current.wrapUp, ...remote.wrapUp } : { ...remote.wrapUp, ...current.wrapUp },
    updatedAt: Math.max(current.updatedAt, remote.updatedAt),
    updatedBy: remoteWins ? remote.updatedBy : current.updatedBy,
  };
}

export function buildShareUrl(eventCode: string, role: 'crew' | 'join-host' = 'crew'): string {
  if (typeof window === 'undefined') return '';
  const current = new URL(window.location.href);
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(current.hostname);
  const url = isLocal ? new URL(PUBLIC_CREWTRIP_URL) : current;
  if (!isLocal && !url.pathname.includes('/run/crewtrip')) {
    url.pathname = '/run/crewtrip/';
  }
  url.searchParams.set('role', role);
  url.searchParams.set('event', eventCode);
  return url.toString();
}

export function readJoinedEventCode(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('event');
}

export function readLocalHostClaim(eventCode: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`${HOST_CLAIM_KEY_PREFIX}${eventCode}`) === '1';
  } catch {
    return false;
  }
}

export function writeLocalHostClaim(eventCode: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${HOST_CLAIM_KEY_PREFIX}${eventCode}`, '1');
  } catch {
    // Host access is a local enhancement; ignore storage failures.
  }
}

export function readLocalPlayerId(eventCode: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${LOCAL_PLAYER_KEY_PREFIX}${eventCode}`);
  } catch {
    return null;
  }
}

export function writeLocalPlayerId(eventCode: string, playerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_PLAYER_KEY_PREFIX}${eventCode}`, playerId);
  } catch {
    // Local identity can still live in React state if persistence fails.
  }
}

export function initialRole(currentEventCode?: string): Role | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  const eventCode = params.get('event') ?? currentEventCode ?? '';
  if ((role === 'host' || role === 'join-host') && eventCode && readLocalHostClaim(eventCode)) return 'host';
  if (role === 'crew' || params.has('event')) return 'eventee';
  return null;
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const next = newId('device');
    localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return newId('device');
  }
}

export function firstCrewPlayerId(players: Player[]): string {
  return players.find((player) => player.id !== 'host')?.id ?? players[0]?.id ?? 'host';
}

export function totalScore(players: Player[]): number {
  return players.reduce((sum, player) => sum + player.score, 0);
}

export function canSeeChallenge(challenge: Challenge, role: Role | null, player: Player): boolean {
  if (role === 'host') return true;
  if (!challenge.groupId || challenge.groupId === 'all') return true;
  return player.groupId === challenge.groupId;
}

export function isSurpriseUnlocked(drop: SurpriseDrop, state: CrewtripState): boolean {
  if (drop.revealedAt) return true;
  if (drop.unlockType === 'manual') return false;
  if (drop.unlockType === 'first-photo') {
    return state.memories.some((memory) => memory.kind === 'image' || memory.kind === 'video')
      || state.challenges.some((challenge) => (challenge.submissions ?? []).some((submission) => submission.mediaKind === 'image' || submission.mediaKind === 'video'));
  }
  if (drop.unlockType === 'submissions') {
    const target = Math.max(1, Number(drop.unlockValue) || 1);
    const submissions = state.challenges.reduce((sum, challenge) => sum + (challenge.submissions?.length ?? 0), 0);
    return submissions >= target;
  }
  const unlockTime = timeRank(drop.unlockValue);
  return Number.isFinite(unlockTime) && timeRank(timeNow()) >= unlockTime;
}

export function unlockLabel(drop: SurpriseDrop): string {
  if (drop.unlockType === 'manual') return 'host reveal';
  if (drop.unlockType === 'first-photo') return 'first photo';
  if (drop.unlockType === 'submissions') return `${drop.unlockValue} submissions`;
  return `opens ${drop.unlockValue}`;
}

export function normalizePlaylistUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function playlistProviderLabel(raw?: string): string {
  if (!raw) return 'Open playlist';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('spotify.com')) return 'Open Spotify';
    if (host.includes('soundcloud.com')) return 'Open SoundCloud';
    if (host.includes('music.apple.com')) return 'Open Apple Music';
  } catch {
    return 'Open playlist';
  }
  return 'Open playlist';
}

function newestRank(items: Array<{ at?: string }>): number {
  const newest = Math.min(...items.map((item) => timeRank(item.at)));
  const now = timeRank(timeNow());
  return Number.isFinite(newest) ? Math.abs(now - newest) : Number.MAX_SAFE_INTEGER;
}

function formatClockMs(value?: number): string {
  if (!value) return 'TBC';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function participantLabel(id: string, state: CrewtripState, groups: CrewGroup[]): string {
  if (id === '__bye__' || id === '__score_entry__') return 'Bye';
  return state.players.find((player) => player.id === id)?.name
    ?? groups.find((group) => group.id === id)?.name
    ?? id;
}

function matchLabel(match: TournamentMatch, state: CrewtripState, groups: CrewGroup[]): string {
  return `${participantLabel(match.sideA.participantId, state, groups)} vs ${participantLabel(match.sideB.participantId, state, groups)}`;
}

export function buildLiveActivities(state: CrewtripState, sync: SyncState, groups: CrewGroup[]) {
  const now = Date.now();
  const tournamentActivities = (state.tournamentEvents ?? []).flatMap((event) => {
    const items: Array<{ id: string; text: string; at: string; kind: 'tournament' }> = [];
    const label = `${event.emoji ? `${event.emoji} ` : ''}${event.name}`;
    const minutesUntil = event.scheduledAt ? Math.round((event.scheduledAt - now) / 60000) : null;
    if (minutesUntil !== null && minutesUntil >= 0 && minutesUntil <= 20 && event.status !== 'done') {
      items.push({ id: `tournament-soon-${event.id}`, text: `${label} starts ${minutesUntil <= 1 ? 'now' : `in ${minutesUntil} min`}`, at: formatClockMs(event.scheduledAt), kind: 'tournament' });
    }
    const live = (state.tournamentMatches ?? []).find((match) => match.eventId === event.id && match.status === 'live');
    if (live) items.push({ id: `tournament-live-${live.id}`, text: `${label}: ${matchLabel(live, state, groups)}`, at: live.startedAt ? formatClockMs(live.startedAt) : 'Now', kind: 'tournament' });
    const ready = (state.tournamentMatches ?? []).find((match) => match.eventId === event.id && match.status === 'pending' && (match.readyParticipantIds?.length ?? 0) > 0);
    if (ready) items.push({ id: `tournament-ready-${ready.id}`, text: `${label}: ${matchLabel(ready, state, groups)} is getting ready`, at: 'Now', kind: 'tournament' });
    return items;
  });
  const activities = [
    {
      id: 'presence',
      text: sync.status === 'open' ? `${sync.peers + 1} crew live` : `${state.eventName || 'Crewtrip'} ready`,
      at: 'Now',
      kind: 'presence' as const,
    },
    ...state.pulses.slice(0, 5).map((pulse) => ({
      id: `pulse-${pulse.id}`,
      text: `${pulse.playerName}: ${pulse.label}${pulse.groupId ? ` / ${groups.find((group) => group.id === pulse.groupId)?.name ?? 'group'}` : ''}`,
      at: pulse.at,
      kind: 'pulse' as const,
    })),
    ...state.broadcasts.slice(0, 5).map((broadcast) => ({ id: `broadcast-${broadcast.id}`, text: broadcast.text, at: broadcast.at, kind: 'host' as const })),
    ...state.memories.slice(0, 4).map((memory) => ({ id: `memory-${memory.id}`, text: `${memory.author} added ${memory.kind === 'text' ? 'a memory' : memory.kind}`, at: memory.at ?? 'Now', kind: 'memory' as const })),
    ...state.challenges.flatMap((challenge) => (challenge.submissions ?? []).slice(0, 2).map((submission) => ({ id: `entry-${challenge.id}-${submission.id}`, text: `${submission.playerName} submitted proof`, at: submission.at, kind: 'game' as const }))),
    ...tournamentActivities,
    ...state.surprises.filter((drop) => isSurpriseUnlocked(drop, state)).slice(0, 2).map((drop) => ({ id: `drop-${drop.id}`, text: `Surprise unlocked: ${drop.title}`, at: drop.revealedAt ?? drop.createdAt, kind: 'surprise' as const })),
    ...(state.soundtracks ?? []).slice(0, 2).map((slot) => ({ id: `soundtrack-${slot.id}`, text: `${slot.dj}: ${slot.title}`, at: slot.time, kind: 'soundtrack' as const })),
  ];
  return sortRecent(activities).slice(0, 10);
}

export function buildPulseStats(pulses: CrewPulse[], groups: CrewGroup[]) {
  const recent = pulses.slice(0, 18);
  const counts = recent.reduce<Record<string, number>>((acc, pulse) => {
    acc[pulse.label] = (acc[pulse.label] ?? 0) + 1;
    return acc;
  }, {});
  const topLabel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Crew pulse';
  return {
    total: recent.length,
    topLabel,
    groups: groups.map((group) => {
      const groupPulses = recent.filter((pulse) => pulse.groupId === group.id);
      const label = groupPulses[0]?.label ?? group.name;
      return { id: group.id, color: group.color, label: `${group.name}: ${label}`, count: groupPulses.length };
    }).filter((group) => group.count > 0),
  };
}

export interface TripPhase {
  label: string;
  title: string;
  detail: string;
  primaryAction: string;
  primaryTab: Tab;
}

export function buildTripPhase(
  state: CrewtripState,
  role: Role | null,
  sync: SyncState,
  currentStop: ItineraryStop,
  nextStop: ItineraryStop | undefined,
  wrapUp: WrapUpSettings,
  unlockedDrops: number,
): TripPhase {
  const hasTemplateOnly = state.players.length <= 1 && state.memories.length === 0 && state.polls.length === 0 && state.challenges.length === 0;
  if (wrapUp.published) {
    return {
      label: 'Trip wrapped',
      title: 'The recap is ready',
      detail: `${state.memories.length} memories, ${totalScore(state.players)} points, and everyone gets an award.`,
      primaryAction: 'Open wrap',
      primaryTab: 'wrap',
    };
  }
  if (hasTemplateOnly) {
    return {
      label: role === 'host' ? 'Host setup' : 'Invite received',
      title: role === 'host' ? 'Set up the trip' : 'Join the crew',
      detail: role === 'host' ? 'Add the cover, first plan, playlist, teams, and invite link.' : 'Add your name, send a pulse, and follow the first plan.',
      primaryAction: role === 'host' ? 'Open settings' : 'Add crew',
      primaryTab: role === 'host' ? 'host' : 'crew',
    };
  }
  if (currentStop.time === 'Now' || currentStop.status === 'now') {
    if (role !== 'host' && currentStop.title === 'Start planning') {
      const canRequest = state.features?.requests ?? initialState.features.requests;
      const canRemember = state.features?.memories ?? initialState.features.memories;
      return {
        label: 'Crew mode',
        title: 'Waiting for the host plan',
        detail: canRequest
          ? 'Send a request, save a memory, or follow updates while the host sets the first plan.'
          : 'Save a memory or follow updates while the host sets the first plan.',
        primaryAction: canRequest ? 'Ask host' : canRemember ? 'Add memory' : 'Open crew',
        primaryTab: canRequest ? 'requests' : canRemember ? 'memories' : 'crew',
      };
    }
    return {
      label: sync.status === 'open' ? `${sync.peers + 1} live now` : 'Arrival mode',
      title: currentStop.title,
      detail: nextStop ? `Now: ${currentStop.place}. Next up: ${nextStop.title}.` : `${currentStop.place}. Keep the crew moving lightly.`,
      primaryAction: unlockedDrops ? 'Open surprise' : 'What is next?',
      primaryTab: 'now',
    };
  }
  return {
    label: new Date().getHours() >= 22 ? 'Late mode' : 'Live trip',
    title: nextStop?.title ?? currentStop.title,
    detail: `${state.pulses.length ? 'The crew is active.' : 'Send a pulse to bring the crew in.'} ${state.memories.length ? 'The scrapbook is building.' : 'Prompt the first memory.'}`,
    primaryAction: 'Play or vote',
    primaryTab: state.polls.some((poll) => poll.open) ? 'vote' : 'games',
  };
}

export function buildHostPrompts(state: CrewtripState, sync: SyncState, wrapUp: WrapUpSettings, features: CrewtripState['features'] = initialState.features): string[] {
  const prompts: string[] = [];
  if (features.polls && state.players.length > 3 && !state.polls.some((poll) => poll.open)) prompts.push(`${state.players.length} people joined. Start a quick vote.`);
  if (features.memories && (state.memories.length === 0 || newestRank(state.memories) > 180)) prompts.push('No fresh memory yet. Prompt a quote, photo, or award.');
  if (features.requests && state.requests.some((request) => request.status === 'new')) prompts.push('New crew requests are waiting to be shared back.');
  if (features.games && state.challenges.length && !state.challenges.some((challenge) => challenge.submissions?.length)) prompts.push('Games are live but need proof. Boost the first one.');
  if (features.soundtrack && !state.soundtracks?.length) prompts.push('Add a playlist or DJ set so the night has a soundtrack.');
  if (features.surprises && sync.status === 'open' && sync.peers > 2) prompts.push(`${sync.peers + 1} devices are live. Drop something while everyone is here.`);
  if (features.wrap && !wrapUp.published && state.memories.length >= 3) prompts.push('The trip has enough material for a wrap ceremony.');
  return prompts;
}

export function buildPersonalTrip(player: Player, state: CrewtripState, groups: CrewGroup[]) {
  const entries = state.challenges.flatMap((challenge) => challenge.submissions ?? []).filter((submission) => submission.playerId === player.id).length;
  const memories = state.memories.filter((memory) => memory.author === player.name).length;
  const award = buildCrewAwards([player], state.memories, state.challenges, groups)[0]?.title ?? 'Trip original';
  return { score: player.score, entries, memories, award };
}

export function buildGameHighlights(challenges: Challenge[], players: Player[], groups: CrewGroup[]) {
  return challenges.map((challenge) => {
    const submissions = challenge.submissions ?? [];
    const mostCheered = [...submissions].sort((a, b) => b.cheers.length - a.cheers.length)[0];
    const firstDone = challenge.doneBy[0] ? players.find((player) => player.id === challenge.doneBy[0]) : undefined;
    const group = mostCheered?.groupId ? groups.find((item) => item.id === mostCheered.groupId) : undefined;
    return {
      challengeId: challenge.id,
      label: challenge.status === 'closed' ? 'Winner card' : `${challenge.points} pts`,
      title: challenge.title,
      detail: mostCheered
        ? `${mostCheered.playerName} leads with ${mostCheered.cheers.length} cheers${group ? ` / ${group.name}` : ''}`
        : firstDone
          ? `${firstDone.name} scored first`
          : 'Waiting for proof',
    };
  });
}

function automaticAwardMark(title: string): { trophy: string; effect: AwardEffect } {
  if (title === 'Top scorer') return { trophy: '🏆', effect: 'gold' };
  if (title === 'Memory maker') return { trophy: '📸', effect: 'camera' };
  if (title === 'Cheer magnet') return { trophy: '📣', effect: 'heart' };
  if (title === 'Game finisher') return { trophy: '⭐', effect: 'star' };
  return { trophy: '✨', effect: 'spark' };
}

export function buildCrewAwards(players: Player[], memories: Memory[], challenges: Challenge[], groups: CrewGroup[], features: CrewtripState['features'] = initialState.features, assignedAwards: WrapUpSettings['assignedAwards'] = []): CrewAward[] {
  const topScore = Math.max(...players.map((player) => player.score), 0);
  const assignedByPlayer = new Map(assignedAwards.map((award) => [award.playerId, award]));
  const awards = players.map((player) => {
    const groupName = groups.find((group) => group.id === player.groupId)?.name ?? player.team;
    const memoryCount = memories.filter((memory) => memory.author === player.name).length;
    const gameEntries = challenges.flatMap((challenge) => challenge.submissions ?? []).filter((submission) => submission.playerId === player.id);
    const cheers = gameEntries.reduce((sum, submission) => sum + submission.cheers.length, 0);
    const completed = challenges.filter((challenge) => challenge.doneBy.includes(player.id)).length;
    const assigned = assignedByPlayer.get(player.id);
    let title = 'Trip original';
    let detail = 'Checked in and became part of the story.';
    if (assigned?.title.trim()) {
      title = assigned.title.trim();
      detail = assigned.detail.trim() || 'Host-assigned crew award.';
    } else if (features.scores && player.score === topScore && topScore > 0) {
      title = 'Top scorer';
      detail = `${player.score} points across the trip.`;
    } else if (features.memories && memoryCount > 0) {
      title = 'Memory maker';
      detail = `${memoryCount} saved moment${memoryCount === 1 ? '' : 's'} for the crew.`;
    } else if (features.games && cheers > 0) {
      title = 'Cheer magnet';
      detail = `${cheers} cheer${cheers === 1 ? '' : 's'} on game proof.`;
    } else if (features.games && completed > 0) {
      title = 'Game finisher';
      detail = `${completed} completed game${completed === 1 ? '' : 's'}.`;
    }
    const mark = assigned?.title.trim()
      ? { trophy: assigned.trophy ?? '🏆', effect: assigned.effect ?? 'gold' }
      : automaticAwardMark(title);
    return {
      playerId: player.id,
      name: player.name,
      groupName,
      color: player.color,
      title,
      detail,
      score: player.score,
      trophy: mark.trophy,
      effect: mark.effect,
    };
  });
  return features.scores
    ? awards.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    : awards.sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name));
}

export function buildWrapHighlights(state: CrewtripState, awards: CrewAward[], gameHighlights: ReturnType<typeof buildGameHighlights>, features: CrewtripState['features'] = initialState.features) {
  const topAward = features.scores ? awards[0] : undefined;
  const topGame = features.games ? gameHighlights.find((highlight) => !highlight.detail.includes('Waiting')) : undefined;
  const funniestRequest = features.requests ? state.requests[0]?.text : undefined;
  const soundtrack = features.soundtrack ? state.soundtracks?.[0] : undefined;
  const title = `${state.eventName || 'Crewtrip'} wrapped`;
  const detail = topAward
    ? `${topAward.name} led the trip with ${topAward.score} points. ${state.memories.length} memories made it into the reel.`
    : `${state.memories.length} memories made it into the reel.`;
  return {
    title,
    detail,
    items: [
      topAward ? `Top crew: ${topAward.name}` : '',
      soundtrack ? `Soundtrack: ${soundtrack.title}` : '',
      topGame ? `Game moment: ${topGame.detail}` : '',
      funniestRequest ? `Request of the trip: ${funniestRequest}` : '',
      features.polls && state.polls.length ? `${state.polls.length} crew vote${state.polls.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean),
  };
}

export function buildTripTimelineItems(state: CrewtripState, activeDayId: string, days: TripDay[], groups: CrewGroup[], role: Role | null, activePlayer: Player): TripTimelineItem[] {
  const dayLabel = days.find((day) => day.id === activeDayId)?.label ?? 'Day';
  const stopItems: TripTimelineItem[] = state.stops
    .filter((stop) => (stop.dayId ?? days[0]?.id) === activeDayId)
    .map((stop) => ({
      id: `stop-${stop.id}`,
      time: stop.time || 'TBC',
      kind: 'plan',
      title: role !== 'host' && stop.title === 'Start planning' ? 'Host plan pending' : stop.title,
      detail: role !== 'host' && stop.title === 'Start planning'
        ? 'Send a request or save a memory while the host adds the first plan.'
        : stop.groupId ? `${stop.place} / ${groups.find((group) => group.id === stop.groupId)?.name ?? 'Group'}` : stop.place,
      status: stop.status,
    }));
  const broadcastItems: TripTimelineItem[] = state.broadcasts.slice(0, 3).map((broadcast) => ({
    id: `broadcast-${broadcast.id}`,
    time: broadcast.at || 'TBC',
    kind: 'host',
    title: broadcast.text,
    detail: dayLabel,
    tab: 'host',
  }));
  const pollItems: TripTimelineItem[] = state.polls
    .filter((poll) => poll.open)
    .slice(0, 2)
    .map((poll) => ({
      id: `poll-${poll.id}`,
      time: poll.closes || 'Open',
      kind: 'poll',
      title: poll.question,
      detail: `${poll.options.reduce((sum, option) => sum + option.votes, 0)} votes`,
      tab: 'vote',
    }));
  const gameItems: TripTimelineItem[] = state.challenges
    .filter((challenge) => (challenge.dayId ?? activeDayId) === activeDayId && canSeeChallenge(challenge, role, activePlayer))
    .map((challenge) => ({
      id: `game-${challenge.id}`,
      time: challenge.deadline ?? 'TBC',
      kind: 'game',
      title: challenge.title,
      detail: `${challenge.points} pts / ${challenge.doneBy.length} done / ${challenge.submissions?.length ?? 0} entries`,
      status: challenge.status === 'closed' ? 'closed' : undefined,
      tab: 'games',
      challengeId: challenge.id,
    }));
  const soundtrackItems: TripTimelineItem[] = (state.soundtracks ?? [])
    .filter((slot) => (slot.dayId ?? activeDayId) === activeDayId)
    .map((slot) => ({
      id: `soundtrack-${slot.id}`,
      time: slot.time || 'TBC',
      kind: 'soundtrack' as const,
      title: slot.title,
      detail: `${slot.dj}${slot.note ? ` / ${slot.note}` : ''}`,
      status: slot.status,
    }));
  const tournamentItems: TripTimelineItem[] = (state.tournamentEvents ?? [])
    .filter(() => state.features?.tournaments || role === 'host')
    .filter((event) => (event.unlockDayId ?? activeDayId) === activeDayId)
    .map((event) => {
      const tournament = state.tournaments.find((item) => item.id === event.tournamentId);
      const eventMatches = (state.tournamentMatches ?? [])
        .filter((match) => match.eventId === event.id)
        .sort((a, b) => a.roundIndex - b.roundIndex || a.index - b.index);
      const liveMatch = eventMatches.find((match) => match.status === 'live');
      const readyMatch = eventMatches.find((match) => match.status === 'pending' && (match.readyParticipantIds?.length ?? 0) > 0);
      const pendingMatch = eventMatches.find((match) => match.status === 'pending');
      const focusMatch = liveMatch ?? readyMatch ?? pendingMatch;
      const locked = tournament?.status === 'setup' || event.status === 'setup';
      const minutesUntil = event.scheduledAt ? Math.round((event.scheduledAt - Date.now()) / 60000) : null;
      const status = locked
        ? 'locked'
        : liveMatch
          ? 'live'
          : readyMatch
            ? 'ready'
            : minutesUntil !== null && minutesUntil >= 0 && minutesUntil <= 20
              ? 'starts soon'
              : event.scheduledAt && Date.now() < event.scheduledAt
                ? 'scheduled'
                : event.status;
      const participantText = `${event.participantIds.length || 'No'} ${event.mode === 'team' ? 'teams' : 'players'}`;
      const detail = focusMatch
        ? `Next: ${matchLabel(focusMatch, state, groups)}`
        : participantText;
      return {
        id: `tournament-${event.id}`,
        time: formatClockMs(event.scheduledAt),
        kind: 'tournament' as const,
        title: `${event.emoji ? `${event.emoji} ` : ''}${event.name}`,
        detail: `${detail} / ${event.scheduledAt ? `starts ${formatClockMs(event.scheduledAt)}` : 'unscheduled'}`,
        status,
        tab: 'games' as const,
        tournamentEventId: event.id,
        matchId: focusMatch?.id,
        locked,
      };
    });
  const memoryItems: TripTimelineItem[] = state.memories
    .filter((memory) => (memory.dayId ?? days[0]?.id) === activeDayId)
    .slice(0, 4)
    .map((memory) => ({
      id: `memory-${memory.id}`,
      time: memory.at ?? 'TBC',
      kind: 'memory',
      title: memory.text,
      detail: memory.author,
      tab: 'memories',
    }));
  return [...stopItems, ...broadcastItems, ...pollItems, ...gameItems, ...tournamentItems, ...soundtrackItems, ...memoryItems]
    .sort((a, b) => timeRank(a.time) - timeRank(b.time));
}

export function syncLabel(sync: SyncState, language: Language = 'en'): string {
  const live = language === 'fr' ? 'Synchro live' : 'Live sync';
  const ready = language === 'fr' ? 'Synchro prête' : 'Live sync ready';
  const connecting = language === 'fr' ? 'Connexion synchro' : 'Sync connecting';
  const local = language === 'fr' ? 'Mode local' : 'Local mode';
  if (sync.status === 'open') {
    return sync.peers > 0 ? `${live} / ${sync.peers} peer${sync.peers === 1 ? '' : 's'}` : ready;
  }
  if (sync.status === 'connecting') return connecting;
  if (sync.status === 'closed') return local;
  return local;
}

export function syncLabelShort(sync: SyncState, language: Language): string {
  if (sync.status === 'open') return sync.peers > 0 ? `Live · ${sync.peers + 1}` : 'Live';
  if (sync.status === 'connecting') return language === 'fr' ? 'Connexion' : 'Connecting';
  return language === 'fr' ? 'Local' : 'Local';
}

export function createRecoveryPack(state: CrewtripState): RecoveryPack {
  return {
    app: 'crewtrip',
    version: 1,
    exportedAt: new Date().toISOString(),
    state: normalizeCrewtripState(state),
  };
}

export function stringifyRecoveryPack(state: CrewtripState): string {
  return JSON.stringify(createRecoveryPack(state), null, 2);
}

export function parseRecoveryPack(raw: string): RecoveryPack {
  const parsed = JSON.parse(raw) as Partial<RecoveryPack>;
  if (parsed.app !== 'crewtrip' || parsed.version !== 1 || !parsed.state?.eventCode) {
    throw new Error('Invalid Crewtrip recovery pack');
  }
  return {
    app: 'crewtrip',
    version: 1,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    state: normalizeCrewtripState(parsed.state),
  };
}

function isLocalBackup(value: unknown): value is LocalBackup {
  const backup = value as LocalBackup;
  return Boolean(backup?.id && backup.eventCode && backup.pack?.app === 'crewtrip' && backup.pack.version === 1 && backup.pack.state?.eventCode);
}

export function readLocalBackups(): LocalBackup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalBackup);
  } catch {
    return [];
  }
}

export function writeLocalBackup(
  state: CrewtripState,
  reason: LocalBackup['reason'],
  force = false,
): { saved: boolean; error?: boolean } {
  if (typeof window === 'undefined') return { saved: false };
  try {
    const existing = readLocalBackups();
    const now = Date.now();
    const latestForEvent = existing
      .filter((backup) => backup.eventCode === state.eventCode)
      .sort((a, b) => b.at - a.at)[0];
    if (!force && latestForEvent && now - latestForEvent.at < BACKUP_INTERVAL_MS) {
      return { saved: false };
    }
    const pack = createRecoveryPack(state);
    const serialized = JSON.stringify(pack);
    const nextBackup: LocalBackup = {
      id: newId('backup'),
      eventCode: state.eventCode,
      eventName: state.eventName || 'Crewtrip',
      at: now,
      reason,
      bytes: new Blob([serialized]).size,
      pack,
    };
    const sameEvent = [nextBackup, ...existing.filter((backup) => backup.eventCode === state.eventCode)]
      .sort((a, b) => b.at - a.at)
      .slice(0, BACKUP_LIMIT_PER_EVENT);
    const otherEvents = existing.filter((backup) => backup.eventCode !== state.eventCode).slice(0, 18);
    localStorage.setItem(BACKUP_KEY, JSON.stringify([...sameEvent, ...otherEvents]));
    return { saved: true };
  } catch {
    return { saved: false, error: true };
  }
}

export function downloadTextFile(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function recoveryPackFileName(state: CrewtripState): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${state.eventName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'crewtrip'}-${state.eventCode.toLowerCase()}-${date}.json`;
}

export function formatBackupTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
