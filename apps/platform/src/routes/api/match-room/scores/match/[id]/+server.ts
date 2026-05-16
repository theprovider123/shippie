import { json, type RequestHandler } from '@sveltejs/kit';
import { fallbackScore } from '$lib/server/match-room/normalise';

export const GET: RequestHandler = ({ params }) => {
  return json({
    score: fallbackScore(params.id ?? 'match-001'),
    delayed: true,
    note: 'Single-match provider lookup is wired for fallback first; room confirmation remains authoritative when live data is unavailable.',
  });
};
