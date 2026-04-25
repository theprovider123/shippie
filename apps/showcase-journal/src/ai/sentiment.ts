import type { SentimentLabel } from '../db/schema.ts';
import { getLocalAi } from './runtime.ts';

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
}

export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  const ai = getLocalAi();
  const result = await ai.sentiment(text);
  return { label: result.sentiment, score: clamp(result.score, -1, 1) };
}

export function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
