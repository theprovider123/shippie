import { json, type RequestHandler } from '@sveltejs/kit';
import { fetchFootballDataMatches } from '$lib/server/match-room/football-data-client';
import { fallbackTodayScores, readTodayScores, ttlForScores, writeTodayScores } from '$lib/server/match-room/score-cache';

export const GET: RequestHandler = async ({ platform }) => {
  const cached = await readTodayScores(platform?.env.CACHE);
  if (cached) return json({ ...cached, delayed: true });

  const token = platform?.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    const fallback = fallbackTodayScores();
    return json({
      ...fallback,
      delayed: true,
      note: 'No provider token configured; clients should use room confirmation for live results.',
    });
  }

  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  try {
    const scores = await fetchFootballDataMatches({ token, dateFrom: date, dateTo: date });
    await writeTodayScores(platform?.env.CACHE, scores, ttlForScores(scores));
    return json({ scores, cache: 'miss', delayed: true });
  } catch (err) {
    const fallback = fallbackTodayScores();
    return json({
      ...fallback,
      delayed: true,
      error: err instanceof Error ? err.message : 'score provider unavailable',
    }, { status: 200 });
  }
};
