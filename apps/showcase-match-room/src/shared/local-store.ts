export interface PredictionReceipt {
  id: string;
  matchId: string;
  matchTitle: string;
  home: number;
  away: number;
  createdAt: string;
}

export interface SavedRoom {
  id: string;
  title: string;
  role: 'host' | 'play' | 'display';
  template: string;
  url: string;
  updatedAt: string;
}

export type MatchRoomThemeMode = 'team' | 'city' | 'paper' | 'pitch';

export interface UserProfile {
  displayName: string;
  primaryTeam: string;
  followedTeams: string[];
  locale: string;
  timeZone: string;
  themeMode: MatchRoomThemeMode;
  updatedAt: string;
}

export interface FollowedTeam {
  code: string;
  updatedAt: string;
}

export interface CommentaryPost {
  id: string;
  text: string;
  scope: 'room' | 'global';
  createdAt: string;
}

export interface PulseVote {
  questionId: string;
  option: string;
  updatedAt: string;
}

const KEY = 'shippie.matchRoom.receipts.v1';
const ROOMS_KEY = 'shippie.matchRoom.rooms.v1';
const FOLLOWED_TEAM_KEY = 'shippie.matchRoom.followedTeam.v1';
const COMMENTARY_KEY = 'shippie.matchRoom.commentary.v1';
const PULSE_KEY = 'shippie.matchRoom.pulse.v1';
const PROFILE_KEY = 'shippie.matchRoom.profile.v1';

export const DEFAULT_PROFILE: UserProfile = {
  displayName: '',
  primaryTeam: 'MEX',
  followedTeams: ['MEX'],
  locale: 'en-GB',
  timeZone: 'Europe/London',
  themeMode: 'team',
  updatedAt: '',
};

export function readPredictionReceipts(storage: Storage | undefined = storageForRuntime()): PredictionReceipt[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isReceipt) : [];
  } catch {
    return [];
  }
}

export function savePredictionReceipt(
  receipt: Omit<PredictionReceipt, 'id' | 'createdAt'>,
  storage: Storage | undefined = storageForRuntime(),
): PredictionReceipt {
  const next: PredictionReceipt = {
    ...receipt,
    id: `${receipt.matchId}:${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  if (!storage) return next;
  const existing = readPredictionReceipts(storage).filter((item) => item.matchId !== receipt.matchId);
  storage.setItem(KEY, JSON.stringify([next, ...existing].slice(0, 24)));
  return next;
}

export function readSavedRooms(storage: Storage | undefined = storageForRuntime()): SavedRoom[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ROOMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isSavedRoom) : [];
  } catch {
    return [];
  }
}

export function saveRoomShortcut(
  room: Omit<SavedRoom, 'updatedAt'>,
  storage: Storage | undefined = storageForRuntime(),
): SavedRoom {
  const next: SavedRoom = { ...room, updatedAt: new Date().toISOString() };
  if (!storage) return next;
  const existing = readSavedRooms(storage).filter((item) => item.id !== room.id || item.role !== room.role);
  storage.setItem(ROOMS_KEY, JSON.stringify([next, ...existing].slice(0, 18)));
  return next;
}

export function removeRoomShortcut(id: string, storage: Storage | undefined = storageForRuntime()): SavedRoom[] {
  if (!storage) return [];
  const next = readSavedRooms(storage).filter((item) => item.id !== id);
  storage.setItem(ROOMS_KEY, JSON.stringify(next));
  return next;
}

export function readUserProfile(storage: Storage | undefined = storageForRuntime()): UserProfile {
  if (!storage) return DEFAULT_PROFILE;
  try {
    const raw = storage.getItem(PROFILE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normaliseProfile(parsed);
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveUserProfile(
  profile: Partial<Omit<UserProfile, 'updatedAt'>>,
  storage: Storage | undefined = storageForRuntime(),
): UserProfile {
  const existing = readUserProfile(storage);
  const next = normaliseProfile({ ...existing, ...profile, updatedAt: new Date().toISOString() });
  storage?.setItem(PROFILE_KEY, JSON.stringify(next));
  if (next.primaryTeam) {
    saveFollowedTeam(next.primaryTeam, storage);
  }
  return next;
}

export function readFollowedTeam(storage: Storage | undefined = storageForRuntime()): FollowedTeam | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FOLLOWED_TEAM_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isFollowedTeam(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveFollowedTeam(code: string, storage: Storage | undefined = storageForRuntime()): FollowedTeam {
  const next: FollowedTeam = { code, updatedAt: new Date().toISOString() };
  storage?.setItem(FOLLOWED_TEAM_KEY, JSON.stringify(next));
  return next;
}

export function readCommentaryPosts(storage: Storage | undefined = storageForRuntime()): CommentaryPost[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(COMMENTARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isCommentaryPost) : [];
  } catch {
    return [];
  }
}

export function saveCommentaryPost(
  post: Omit<CommentaryPost, 'id' | 'createdAt'>,
  storage: Storage | undefined = storageForRuntime(),
): CommentaryPost {
  const next: CommentaryPost = {
    ...post,
    id: `${post.scope}:${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  if (!storage) return next;
  const existing = readCommentaryPosts(storage);
  storage.setItem(COMMENTARY_KEY, JSON.stringify([next, ...existing].slice(0, 16)));
  return next;
}

export function readPulseVote(questionId: string, storage: Storage | undefined = storageForRuntime()): PulseVote | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PULSE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isPulseVote).find((vote) => vote.questionId === questionId) ?? null;
  } catch {
    return null;
  }
}

export function savePulseVote(
  vote: Omit<PulseVote, 'updatedAt'>,
  storage: Storage | undefined = storageForRuntime(),
): PulseVote {
  const next: PulseVote = { ...vote, updatedAt: new Date().toISOString() };
  if (!storage) return next;
  const existing = (() => {
    try {
      const raw = storage.getItem(PULSE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isPulseVote) : [];
    } catch {
      return [];
    }
  })();
  storage.setItem(PULSE_KEY, JSON.stringify([next, ...existing.filter((item) => item.questionId !== vote.questionId)].slice(0, 20)));
  return next;
}

function storageForRuntime(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isFollowedTeam(value: unknown): value is FollowedTeam {
  if (!value || typeof value !== 'object') return false;
  const item = value as FollowedTeam;
  return typeof item.code === 'string' && typeof item.updatedAt === 'string';
}

function isCommentaryPost(value: unknown): value is CommentaryPost {
  if (!value || typeof value !== 'object') return false;
  const item = value as CommentaryPost;
  return (
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    (item.scope === 'room' || item.scope === 'global') &&
    typeof item.createdAt === 'string'
  );
}

function isPulseVote(value: unknown): value is PulseVote {
  if (!value || typeof value !== 'object') return false;
  const item = value as PulseVote;
  return typeof item.questionId === 'string' && typeof item.option === 'string' && typeof item.updatedAt === 'string';
}

function normaliseProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object') return DEFAULT_PROFILE;
  const item = value as Partial<UserProfile>;
  const primaryTeam = typeof item.primaryTeam === 'string' && item.primaryTeam.length > 0 ? item.primaryTeam : DEFAULT_PROFILE.primaryTeam;
  const followedTeams = Array.isArray(item.followedTeams)
    ? [...new Set(item.followedTeams.filter((code): code is string => typeof code === 'string' && code.length > 0))]
    : [];
  const themeMode = item.themeMode === 'team' || item.themeMode === 'city' || item.themeMode === 'paper' || item.themeMode === 'pitch'
    ? item.themeMode
    : DEFAULT_PROFILE.themeMode;
  return {
    displayName: typeof item.displayName === 'string' ? item.displayName.slice(0, 42) : DEFAULT_PROFILE.displayName,
    primaryTeam,
    followedTeams: [primaryTeam, ...followedTeams.filter((code) => code !== primaryTeam)].slice(0, 8),
    locale: typeof item.locale === 'string' ? item.locale : DEFAULT_PROFILE.locale,
    timeZone: typeof item.timeZone === 'string' ? item.timeZone : DEFAULT_PROFILE.timeZone,
    themeMode,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  };
}

function isReceipt(value: unknown): value is PredictionReceipt {
  if (!value || typeof value !== 'object') return false;
  const item = value as PredictionReceipt;
  return (
    typeof item.id === 'string' &&
    typeof item.matchId === 'string' &&
    typeof item.matchTitle === 'string' &&
    typeof item.home === 'number' &&
    typeof item.away === 'number' &&
    typeof item.createdAt === 'string'
  );
}

function isSavedRoom(value: unknown): value is SavedRoom {
  if (!value || typeof value !== 'object') return false;
  const item = value as SavedRoom;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    (item.role === 'host' || item.role === 'play' || item.role === 'display') &&
    typeof item.template === 'string' &&
    typeof item.url === 'string' &&
    typeof item.updatedAt === 'string'
  );
}
