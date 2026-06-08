import { useEffect, useMemo, useRef, useState } from "react";
import { pickTrivia } from "../../data/trivia";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";

const SECONDS = 30;

/**
 * Beat the Clock — rapid-fire World Cup trivia. As many as you can in 30 seconds.
 * Right answer = +1 and straight to the next; wrong costs you 2 seconds. Local,
 * no accounts — pure pub-quiz speed run.
 */
export function BeatTheClock() {
  const [phase, setPhase] = useState<"ready" | "play" | "over">("ready");
  const [round, setRound] = useState(0);
  const [t, setT] = useState(SECONDS);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const tRef = useRef(SECONDS);

  const deck = useMemo(() => pickTrivia(80), [round]);
  const item = deck[i % deck.length];

  useEffect(() => {
    if (phase !== "play") return;
    tRef.current = SECONDS;
    const id = window.setInterval(() => {
      tRef.current = Math.max(0, tRef.current - 1);
      setT(tRef.current);
      if (tRef.current <= 0) { window.clearInterval(id); setPhase("over"); }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  function start() {
    setScore(0); setI(0); setT(SECONDS); tRef.current = SECONDS; setPicked(null);
    setRound((r) => r + 1); setPhase("play");
  }

  function pick(idx: number) {
    if (picked !== null || phase !== "play") return;
    hapticTap();
    const right = idx === item.answer;
    if (right) { setScore((s) => s + 1); celebrate(); }
    else { confirmBuzz(); tRef.current = Math.max(0, tRef.current - 2); setT(tRef.current); }
    setPicked(idx);
    window.setTimeout(() => { setPicked(null); setI((n) => n + 1); }, 260);
  }

  if (phase === "ready") {
    return (
      <div className="game-stage quiz-over">
        <span className="game-emoji">⏱️</span>
        <h3>Beat the Clock</h3>
        <p className="quiz-final-sub">As many as you can in 30 seconds. Wrong answer costs you 2.</p>
        <button className="cta wide" onClick={start}>Start the clock</button>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <div className="game-stage quiz-over">
        <span className="game-emoji">{score >= 12 ? "🏆" : "⏱️"}</span>
        <h3 className="quiz-final">{score}</h3>
        <p className="quiz-final-sub">{score >= 15 ? "Lightning. Anorak." : score >= 8 ? "Sharp." : "Warm up and go again."}</p>
        <p className="quiz-forfeit">🍺 Lowest score in the room gets the round in.</p>
        <button className="cta wide" onClick={start}>Go again</button>
      </div>
    );
  }

  const pct = (tRef.current / SECONDS) * 100;
  return (
    <div className="game-stage quiz-stage">
      <div className="quiz-head">
        <span className="quiz-step">Beat the Clock</span>
        <span className={`quiz-clock${t <= 5 ? " low" : ""}`}>{t}s</span>
        <span className="quiz-score">{score}</span>
      </div>
      <div className="clock-bar"><span style={{ width: `${pct}%` }} className={t <= 5 ? "low" : ""} /></div>
      <div className="quiz-prompt"><span className="trivia-q">{item.q}</span></div>
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
