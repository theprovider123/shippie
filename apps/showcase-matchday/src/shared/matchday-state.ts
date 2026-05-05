import type { ScorePoll, ScoreTally, ScoreVote, Shoutout } from './types.ts';

export function normaliseScore(home: number, away: number): { home: number; away: number } | null {
  if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
  if (home < 0 || away < 0 || home > 12 || away > 12) return null;
  return { home, away };
}

export function computeScoreTally(poll: ScorePoll, votes: Iterable<ScoreVote>): ScoreTally {
  const byVoter = new Map<string, ScoreVote>();
  for (const vote of votes) {
    if (vote.pollId !== poll.id) continue;
    if (vote.ts > poll.closesAt) continue;
    if (!normaliseScore(vote.home, vote.away)) continue;
    const existing = byVoter.get(vote.voterId);
    if (!existing || existing.ts < vote.ts) byVoter.set(vote.voterId, vote);
  }

  const histogram = new Map<string, { score: string; count: number; latest: number }>();
  let updatedAt = 0;
  for (const vote of byVoter.values()) {
    const score = `${vote.home}-${vote.away}`;
    const existing = histogram.get(score) ?? { score, count: 0, latest: 0 };
    existing.count += 1;
    existing.latest = Math.max(existing.latest, vote.ts);
    histogram.set(score, existing);
    updatedAt = Math.max(updatedAt, vote.ts);
  }

  const leaders = [...histogram.values()]
    .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score))
    .slice(0, 5)
    .map(({ score, count }) => ({ score, count }));

  return { pollId: poll.id, totalVotes: byVoter.size, leaders, updatedAt };
}

export function cleanShoutoutText(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 90) return null;
  return text;
}

export function sortedShoutouts(items: Iterable<Shoutout>): Shoutout[] {
  return [...items].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
}
