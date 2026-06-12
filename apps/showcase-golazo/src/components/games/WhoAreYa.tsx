import { useState } from "react";
import { drawTrivia } from "../../data/trivia";
import { Quiz, type QuizItem } from "./Quiz";

const N = 8;

function makeItems(): QuizItem[] {
  return drawTrivia(N).map((t) => ({ prompt: <span className="trivia-q">{t.q}</span>, options: t.options, answer: t.answer }));
}

/** Who Are Ya? — evergreen World Cup trivia. */
export function WhoAreYa() {
  const [items, setItems] = useState<QuizItem[]>(makeItems);
  return <Quiz items={items} emoji="🧠" title="Who Are Ya?" onReplay={() => setItems(makeItems())} />;
}
