import type { RouteBanter, RouteBanterPoll } from '../data/parade-2026';

const VOTES_KEY = 'parade-companion:banter-votes:v1';
const CHEERS_KEY = 'parade-companion:banter-cheers:v1';

export type CheerId =
  | 'champions'
  | 'coyg'
  | 'north-london'
  | 'mikel'
  | 'reds'
  | 'one-more-song';

export interface CheerTile {
  id: CheerId;
  label: string;
  detail: string;
}

export interface BanterVote {
  pollId: string;
  optionId: string;
  updatedAt: string;
}

export const CHEER_TILES: CheerTile[] = [
  { id: 'champions', label: 'Champions', detail: 'Big trophy energy.' },
  { id: 'coyg', label: 'COYG', detail: 'Short and loud.' },
  { id: 'north-london', label: 'North London', detail: 'For the chorus moments.' },
  { id: 'mikel', label: 'Mikel', detail: 'Manager roar.' },
  { id: 'reds', label: 'Reds', detail: 'Simple clap cue.' },
  { id: 'one-more-song', label: 'One more song', detail: 'When the bus slows.' },
];

export const FALLBACK_BANTER: RouteBanter = {
  chants: [],
  polls: [],
};

export function banterFromPack(pack: { banter?: RouteBanter }): RouteBanter {
  const chants = Array.isArray(pack.banter?.chants) ? pack.banter.chants : [];
  const polls = Array.isArray(pack.banter?.polls) ? pack.banter.polls : [];
  return { chants, polls };
}

export function listBanterVotes(): BanterVote[] {
  return readJson<unknown[]>(VOTES_KEY, []).filter(isBanterVote);
}

export function voteInPoll(poll: RouteBanterPoll, optionId: string): BanterVote | null {
  if (!poll.options.some((option) => option.id === optionId)) return null;
  const next: BanterVote = { pollId: poll.id, optionId, updatedAt: new Date().toISOString() };
  const votes = listBanterVotes().filter((vote) => vote.pollId !== poll.id);
  writeJson(VOTES_KEY, [next, ...votes]);
  return next;
}

export function selectedOptionId(pollId: string): string | null {
  return listBanterVotes().find((vote) => vote.pollId === pollId)?.optionId ?? null;
}

// pollOptionCount + totalPollVotes were removed in round 8 — they returned
// 1/0 based purely on the local vote, so the UI bars used to read as
// "100% for your pick", which lied to the user. Until a relay aggregator
// ships, the screen surfaces only "Your pick" + an honest "local only"
// note. See docs/superpowers/plans/2026-05-24-parade-companion-round8...

export function listCheerCounts(): Record<CheerId, number> {
  const raw = readJson<Record<string, unknown>>(CHEERS_KEY, {});
  return Object.fromEntries(
    CHEER_TILES.map((tile) => [tile.id, safeCount(raw[tile.id])]),
  ) as Record<CheerId, number>;
}

export function tapCheer(id: CheerId): Record<CheerId, number> {
  const counts = listCheerCounts();
  counts[id] = Math.min(999, counts[id] + 1);
  writeJson(CHEERS_KEY, counts);
  return counts;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Banter is a nice-to-have; never block parade utilities on storage errors.
  }
}

function isBanterVote(value: unknown): value is BanterVote {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BanterVote>;
  return (
    typeof record.pollId === 'string' &&
    typeof record.optionId === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

function safeCount(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.min(999, Math.floor(numberValue));
}
