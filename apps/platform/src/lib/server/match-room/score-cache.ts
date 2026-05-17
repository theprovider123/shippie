import type { KVNamespace } from '@cloudflare/workers-types';
import { fallbackScore, type MatchRoomScore } from './normalise';

export interface ScoreCacheResult {
  scores: MatchRoomScore[];
  cache: 'hit' | 'miss' | 'fallback';
}

const TODAY_KEY = 'match-room:scores:today';

export async function readTodayScores(kv: KVNamespace | undefined): Promise<ScoreCacheResult | null> {
  if (!kv) return null;
  const cached = await kv.get(TODAY_KEY);
  if (!cached) return null;
  try {
    return { scores: JSON.parse(cached) as MatchRoomScore[], cache: 'hit' };
  } catch {
    return null;
  }
}

export async function writeTodayScores(kv: KVNamespace | undefined, scores: MatchRoomScore[], ttlSeconds: number): Promise<void> {
  if (!kv) return;
  await kv.put(TODAY_KEY, JSON.stringify(scores), { expirationTtl: ttlSeconds });
}

export function fallbackTodayScores(): ScoreCacheResult {
  return { scores: [fallbackScore('match-001')], cache: 'fallback' };
}

export function ttlForScores(scores: readonly MatchRoomScore[]): number {
  if (scores.some((score) => score.status === 'live')) return 45;
  if (scores.some((score) => score.status === 'paused')) return 120;
  if (scores.some((score) => score.status === 'finished')) return 600;
  return 900;
}
