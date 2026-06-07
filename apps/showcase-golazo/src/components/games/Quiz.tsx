import { useState, type ReactNode } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";

export interface QuizItem {
  prompt: ReactNode;
  options: string[];
  answer: number;
}

const GOOD = ["Get in!", "Knew that.", "Easy.", "Anorak."];
const BAD = ["Off you go.", "Have a word.", "Nope.", "Pub quiz beckons."];

/** Shared multiple-choice quiz runner used by Who Are Ya? + Guess the Nation. */
export function Quiz({
  items,
  emoji,
  title,
  onReplay,
}: {
  items: QuizItem[];
  emoji: string;
  title: string;
  onReplay: () => void;
}) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [quip, setQuip] = useState("");

  const item = items[i];
  const done = i >= items.length;

  function pick(idx: number) {
    if (picked !== null) return;
    hapticTap();
    const right = idx === item.answer;
    if (right) { setScore((s) => s + 1); celebrate(); setQuip(GOOD[Math.floor(Math.random() * GOOD.length)]); }
    else { confirmBuzz(); setQuip(BAD[Math.floor(Math.random() * BAD.length)]); }
    setPicked(idx);
    setTimeout(() => {
      setPicked(null);
      setQuip("");
      setI((n) => n + 1);
    }, 850);
  }

  if (done) {
    const pct = Math.round((score / items.length) * 100);
    return (
      <div className="game-stage quiz-over">
        <span className="game-emoji">{score >= items.length * 0.7 ? "🏆" : emoji}</span>
        <h3 className="quiz-final">{score} / {items.length}</h3>
        <p className="quiz-final-sub">{pct >= 80 ? "Proper anorak." : pct >= 50 ? "Not bad." : "Back to the pub quiz."}</p>
        <p className="quiz-forfeit">🍺 Lowest score gets the round in. House rules.</p>
        <button className="cta wide" onClick={onReplay}>Play again</button>
      </div>
    );
  }

  return (
    <div className="game-stage quiz-stage">
      <div className="quiz-head">
        <span className="quiz-step">{title} · {i + 1}/{items.length}</span>
        <span className="quiz-score">{score}</span>
      </div>
      <div className="quiz-prompt">{item.prompt}</div>
      {quip && <div className={`quiz-quip${picked === item.answer ? " good" : " bad"}`}>{quip}</div>}
      <div className="quiz-options">
        {item.options.map((o, idx) => {
          const state = picked === null ? "" : idx === item.answer ? " right" : idx === picked ? " wrong" : " dim";
          return (
            <button key={idx} className={`quiz-opt${state}`} disabled={picked !== null} onClick={() => pick(idx)}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
