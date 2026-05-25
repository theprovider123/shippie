import type { RouteBanterPoll } from '../data/parade-2026';
import type { BanterVote } from './banter';

export const BANTER_PULSE_ENDPOINT = '/__shippie/parade/banter-pulse';
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PUBLISH_VOTES = 8;

export interface BanterPulseVotePacket {
  pollId: string;
  optionId: string;
  sourceId: string;
  updatedAt: string;
}

export interface BanterPollAggregate {
  pollId: string;
  total: number;
  options: Record<string, number>;
  updatedAt: string | null;
}

export interface BanterPulseResponse {
  eventId?: string;
  aggregates?: BanterPollAggregate[];
}

export function voteToBanterPulsePacket(vote: BanterVote, polls: readonly RouteBanterPoll[]): BanterPulseVotePacket | null {
  if (!vote.sourceId || !pollAllowsOption(polls, vote.pollId, vote.optionId)) return null;
  return {
    pollId: vote.pollId,
    optionId: vote.optionId,
    sourceId: vote.sourceId,
    updatedAt: vote.updatedAt,
  };
}

export function selectBanterPulseVotes(
  votes: readonly BanterVote[],
  polls: readonly RouteBanterPoll[],
  limit = MAX_PUBLISH_VOTES,
): BanterPulseVotePacket[] {
  const byPoll = new Map<string, BanterPulseVotePacket>();
  for (const vote of votes) {
    const packet = voteToBanterPulsePacket(vote, polls);
    if (!packet) continue;
    const current = byPoll.get(packet.pollId);
    if (!current || Date.parse(packet.updatedAt) > Date.parse(current.updatedAt)) byPoll.set(packet.pollId, packet);
  }
  return [...byPoll.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

export async function publishBanterPulse(
  votes: readonly BanterVote[],
  polls: readonly RouteBanterPoll[],
  endpoint = BANTER_PULSE_ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const packets = selectBanterPulseVotes(votes, polls);
  if (packets.length === 0) return 0;
  try {
    const response = await fetchWithTimeout(fetchImpl, endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ votes: packets }),
    });
    if (!response.ok && response.status !== 429) throw new Error(`banter_pulse_${response.status}`);
    return response.ok ? packets.length : 0;
  } catch {
    return 0;
  }
}

export async function pullBanterPulse(
  polls: readonly RouteBanterPoll[],
  endpoint = BANTER_PULSE_ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<BanterPollAggregate[]> {
  const pollIds = polls.map((poll) => poll.id).filter(Boolean);
  if (pollIds.length === 0) return [];
  const response = await fetchWithTimeout(fetchImpl, `${endpoint}?polls=${encodeURIComponent(pollIds.join(','))}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`banter_pulse_${response.status}`);
  const body = (await response.json()) as BanterPulseResponse;
  return sanitizeAggregates(body.aggregates ?? [], polls);
}

export function mergeLocalVoteIntoAggregate(
  poll: RouteBanterPoll,
  aggregate: BanterPollAggregate | null,
  localOptionId: string | null,
): BanterPollAggregate {
  const options: Record<string, number> = {};
  for (const option of [...poll.options, ...(poll.otherOptions ?? [])]) {
    const count = Math.max(0, Math.round(aggregate?.options?.[option.id] ?? 0));
    if (count > 0) options[option.id] = count;
  }
  if (localOptionId && pollAllowsOption([poll], poll.id, localOptionId) && (options[localOptionId] ?? 0) === 0) {
    options[localOptionId] = 1;
  }
  return {
    pollId: poll.id,
    total: Object.values(options).reduce((sum, count) => sum + count, 0),
    options,
    updatedAt: aggregate?.updatedAt ?? null,
  };
}

function sanitizeAggregates(
  aggregates: readonly BanterPollAggregate[],
  polls: readonly RouteBanterPoll[],
): BanterPollAggregate[] {
  const byPoll = new Map(polls.map((poll) => [poll.id, poll]));
  return aggregates.flatMap((aggregate) => {
    const poll = byPoll.get(aggregate.pollId);
    if (!poll) return [];
    const options: Record<string, number> = {};
    for (const option of [...poll.options, ...(poll.otherOptions ?? [])]) {
      const count = Math.max(0, Math.round(Number(aggregate.options?.[option.id] ?? 0)));
      if (count > 0) options[option.id] = count;
    }
    return [{
      pollId: aggregate.pollId,
      total: Object.values(options).reduce((sum, count) => sum + count, 0),
      options,
      updatedAt: typeof aggregate.updatedAt === 'string' ? aggregate.updatedAt : null,
    }];
  });
}

function pollAllowsOption(polls: readonly RouteBanterPoll[], pollId: string, optionId: string): boolean {
  const poll = polls.find((item) => item.id === pollId);
  if (!poll) return false;
  return [...poll.options, ...(poll.otherOptions ?? [])].some((option) => option.id === optionId);
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
