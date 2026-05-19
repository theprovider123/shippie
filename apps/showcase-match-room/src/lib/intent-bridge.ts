/**
 * Cross-app intent bridge for Match Room.
 *
 * Wraps `@shippie/iframe-sdk` so the room's predictions can be heard
 * by World Cup Fantasy (and any other consumer), and so saved-fantasy
 * announcements from Fantasy can surface here.
 *
 * Match Room's intra-room sync is gossip-based — separate channel. This
 * bridge is strictly cross-app (one device, multiple Shippie windows).
 */
import { createShippieIframeSdk, type IntentBroadcast } from '@shippie/iframe-sdk';
import type { PollDescriptor, PollTally } from '@shippie/proximity';
import type { ScoreTally } from '../shared/types.ts';

export const shippie = createShippieIframeSdk({ appId: 'app_match_room' });

export interface FantasySavedArrival {
  manager: string;
  squadSize: number;
  captainName: string | null;
  chip: string | null;
  budgetSpent: number | null;
  valid: boolean;
  updatedAt: string;
  receivedAt: number;
}

export function broadcastPredictionStats(opts: {
  fixture: string | undefined;
  tallies: ReadonlyArray<PollTally>;
  scoreTallies: ReadonlyArray<ScoreTally>;
  polls: ReadonlyArray<PollDescriptor>;
}): void {
  const pollIndex = new Map(opts.polls.map((p) => [p.id, p]));
  const tallyRows = opts.tallies
    .slice(0, 4)
    .filter((t) => (t.totalVotes ?? 0) > 0)
    .map((t) => {
      const leaderIndex = t.perBucket.reduce(
        (best, count, index) => (count > (t.perBucket[best] ?? 0) ? index : best),
        0,
      );
      const poll = pollIndex.get(t.pollId);
      const leaderName = poll?.options?.[leaderIndex] ?? `Option ${leaderIndex + 1}`;
      return {
        fixture: opts.fixture,
        question: poll?.question ?? t.pollId,
        leaderName,
        leaderShare: t.totalVotes > 0 ? (t.perBucket[leaderIndex] ?? 0) / t.totalVotes : 0,
        total: t.totalVotes,
      };
    });
  const scoreRows = opts.scoreTallies
    .slice(0, 2)
    .filter((t) => (t.totalVotes ?? 0) > 0)
    .map((t) => {
      const top = t.leaders?.[0];
      return {
        fixture: opts.fixture,
        question: pollIndex.get(t.pollId)?.question ?? 'Final score',
        leaderName: top?.score ?? null,
        leaderShare: top && t.totalVotes > 0 ? top.count / t.totalVotes : 0,
        total: t.totalVotes,
      };
    });
  const rows = [...tallyRows, ...scoreRows];
  if (rows.length > 0) {
    shippie.intent.broadcast('matchday-prediction-stats', rows);
  }
}

export function subscribeFantasyArrivals(
  handler: (arrival: FantasySavedArrival) => void,
): () => void {
  shippie.requestIntent('fantasy-team.saved');
  return shippie.intent.subscribe('fantasy-team.saved', (broadcast: IntentBroadcast) => {
    for (const raw of broadcast.rows) {
      const row = raw as Partial<FantasySavedArrival> & {
        manager?: string;
        squad_size?: number;
        captain_name?: string | null;
        chip?: string | null;
        budget_spent?: number | null;
        valid?: boolean;
        updated_at?: string | null;
      };
      const arrival: FantasySavedArrival = {
        manager: typeof row.manager === 'string' ? row.manager : 'Manager',
        squadSize: typeof row.squad_size === 'number' ? row.squad_size : 0,
        captainName: typeof row.captain_name === 'string' ? row.captain_name : null,
        chip: typeof row.chip === 'string' ? row.chip : null,
        budgetSpent: typeof row.budget_spent === 'number' ? row.budget_spent : null,
        valid: row.valid === true,
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
        receivedAt: Date.now(),
      };
      handler(arrival);
    }
  });
}
