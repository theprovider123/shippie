import { useMemo, useState } from "react";
import { pickTrivia } from "../../data/trivia";
import { Quiz, type QuizItem } from "./Quiz";

const N = 8;

/** Who Are Ya? — evergreen World Cup trivia. */
export function WhoAreYa() {
  const [round, setRound] = useState(0);
  const items: QuizItem[] = useMemo(
    () => pickTrivia(N).map((t) => ({ prompt: <span className="trivia-q">{t.q}</span>, options: t.options, answer: t.answer })),
    [round],
  );
  return <Quiz items={items} emoji="🧠" title="Who Are Ya?" onReplay={() => setRound((r) => r + 1)} />;
}
