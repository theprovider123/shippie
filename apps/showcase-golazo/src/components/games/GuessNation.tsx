import { useMemo, useState } from "react";
import { TEAMS } from "../../data/teams";
import { Quiz, type QuizItem } from "./Quiz";

const N = 8;

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

/** Guess the Nation — see a flag, pick the country. */
export function GuessNation() {
  const [round, setRound] = useState(0);
  const items: QuizItem[] = useMemo(() => {
    const pool = shuffle(TEAMS);
    return pool.slice(0, N).map((answer) => {
      const distractors = shuffle(TEAMS.filter((t) => t.id !== answer.id)).slice(0, 3);
      const opts = shuffle([answer, ...distractors]);
      return {
        prompt: <span className="guess-flag">{answer.flag}</span>,
        options: opts.map((t) => t.name),
        answer: opts.findIndex((t) => t.id === answer.id),
      };
    });
  }, [round]);
  return <Quiz items={items} emoji="🌍" title="Guess the Nation" onReplay={() => setRound((r) => r + 1)} />;
}
