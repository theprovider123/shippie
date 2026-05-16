import { useEffect, useState } from 'react';
import { fallbackLiveScore, loadTodayScores, type LiveScore } from './live-scores-client.ts';

export function useOpeningLiveScore(): LiveScore {
  const [score, setScore] = useState<LiveScore>(() => fallbackLiveScore());

  useEffect(() => {
    let cancelled = false;
    void loadTodayScores().then((scores) => {
      if (cancelled) return;
      setScore(scores.find((item) => item.id === 'match-001') ?? scores[0] ?? fallbackLiveScore());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return score;
}
