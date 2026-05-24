import type { RouteBanter, RouteBanterChant, RouteBanterPoll, RouteBanterTrivia } from '../data/parade-2026';

const VOTES_KEY = 'parade-companion:banter-votes:v1';
const TRIVIA_KEY = 'parade-companion:banter-trivia:v1';

export interface BanterVote {
  pollId: string;
  optionId: string;
  updatedAt: string;
  sourceId?: string;
  displayName?: string;
  supporterTag?: string;
}

export interface BanterVoter {
  sourceId: string;
  displayName: string;
  supporterTag: string;
}

export interface BanterTriviaAttempt {
  triviaId: string;
  optionId: string;
  correct: boolean;
  updatedAt: string;
}

export const FALLBACK_BANTER: RouteBanter = {
  chants: [],
  polls: [],
};

export function banterFromPack(pack: { banter?: RouteBanter }): RouteBanter {
  const chants = Array.isArray(pack.banter?.chants) ? pack.banter.chants.filter(isRouteBanterChant) : [];
  const polls = Array.isArray(pack.banter?.polls) ? pack.banter.polls.filter(isRouteBanterPoll) : [];
  const trivia = Array.isArray(pack.banter?.trivia) ? pack.banter.trivia.filter(isRouteBanterTrivia) : [];
  return { chants, polls, trivia };
}

export function listBanterVotes(): BanterVote[] {
  return readJson<unknown[]>(VOTES_KEY, []).filter(isBanterVote);
}

export function voteInPoll(poll: RouteBanterPoll, optionId: string, voter?: BanterVoter): BanterVote | null {
  if (!pollAllowsOption(poll, optionId)) return null;
  const next: BanterVote = {
    pollId: poll.id,
    optionId,
    updatedAt: new Date().toISOString(),
    sourceId: voter?.sourceId,
    displayName: voter?.displayName,
    supporterTag: voter?.supporterTag,
  };
  const votes = listBanterVotes().filter((vote) => vote.pollId !== poll.id);
  writeJson(VOTES_KEY, [next, ...votes]);
  return next;
}

export function selectedOptionId(pollId: string): string | null {
  return listBanterVotes().find((vote) => vote.pollId === pollId)?.optionId ?? null;
}

export function pollOptionLabel(poll: RouteBanterPoll, optionId: string | null): string | null {
  if (!optionId) return null;
  return [...poll.options, ...(poll.otherOptions ?? [])].find((option) => option.id === optionId)?.label ?? null;
}

export function pollAllowsOption(poll: RouteBanterPoll, optionId: string): boolean {
  return [...poll.options, ...(poll.otherOptions ?? [])].some((option) => option.id === optionId);
}

// pollOptionCount + totalPollVotes were removed in round 8 — they returned
// 1/0 based purely on the local vote, so the UI bars used to read as
// "100% for your pick", which lied to the user. Until a relay aggregator
// ships, the screen surfaces only "Your pick" + an honest "local only"
// note. See docs/superpowers/plans/2026-05-24-parade-companion-round8...

export function listTriviaAttempts(): BanterTriviaAttempt[] {
  return readJson<unknown[]>(TRIVIA_KEY, []).filter(isTriviaAttempt);
}

export function selectedTriviaAttempt(triviaId: string): BanterTriviaAttempt | null {
  return listTriviaAttempts().find((attempt) => attempt.triviaId === triviaId) ?? null;
}

export function answerTrivia(trivia: RouteBanterTrivia, optionId: string): BanterTriviaAttempt | null {
  if (!trivia.options.some((option) => option.id === optionId)) return null;
  const attempt: BanterTriviaAttempt = {
    triviaId: trivia.id,
    optionId,
    correct: optionId === trivia.answerId,
    updatedAt: new Date().toISOString(),
  };
  const attempts = listTriviaAttempts().filter((item) => item.triviaId !== trivia.id);
  writeJson(TRIVIA_KEY, [attempt, ...attempts]);
  return attempt;
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
    typeof record.updatedAt === 'string' &&
    (record.sourceId === undefined || typeof record.sourceId === 'string') &&
    (record.displayName === undefined || typeof record.displayName === 'string') &&
    (record.supporterTag === undefined || typeof record.supporterTag === 'string')
  );
}

function isRouteBanterChant(value: unknown): value is RouteBanterChant {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RouteBanterChant>;
  return isText(record.id) && isText(record.title) && isText(record.cue) && isText(record.detail);
}

function isRouteBanterPoll(value: unknown): value is RouteBanterPoll {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RouteBanterPoll>;
  return (
    isText(record.id) &&
    isText(record.question) &&
    Array.isArray(record.options) &&
    record.options.every(isBanterOption) &&
    (record.otherOptions === undefined || (Array.isArray(record.otherOptions) && record.otherOptions.every(isBanterOption)))
  );
}

function isRouteBanterTrivia(value: unknown): value is RouteBanterTrivia {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RouteBanterTrivia>;
  return (
    isText(record.id) &&
    isText(record.question) &&
    isText(record.answerId) &&
    isText(record.source) &&
    isText(record.explainer) &&
    Array.isArray(record.options) &&
    record.options.every(isBanterOption) &&
    record.options.some((option) => option.id === record.answerId)
  );
}

function isBanterOption(value: unknown): value is { id: string; label: string; detail?: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as { id?: unknown; label?: unknown; detail?: unknown };
  return isText(record.id) && isText(record.label) && (record.detail === undefined || typeof record.detail === 'string');
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTriviaAttempt(value: unknown): value is BanterTriviaAttempt {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BanterTriviaAttempt>;
  return (
    typeof record.triviaId === 'string' &&
    typeof record.optionId === 'string' &&
    typeof record.correct === 'boolean' &&
    typeof record.updatedAt === 'string'
  );
}
