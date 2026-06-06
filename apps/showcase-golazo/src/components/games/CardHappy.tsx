import { useMemo, useState } from "react";
import { CARD_INCIDENTS, type CardOutcome } from "../../data/incidents";
import { tap, confirmBuzz, celebrate } from "../../lib/haptics";

const OPTIONS: { v: CardOutcome; label: string; emoji: string }[] = [
  { v: "none", label: "No card", emoji: "🟢" },
  { v: "yellow", label: "Yellow", emoji: "🟨" },
  { v: "red", label: "Red", emoji: "🟥" },
];

/**
 * Card Happy — pass-the-phone. Read out the incident, each player calls the card.
 * Closest ref in the room wins. Pure local, no accounts.
 */
export function CardHappy() {
  const [names, setNames] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"setup" | "play" | "reveal" | "done">("setup");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [turn, setTurn] = useState(0); // index into the play order
  const [guess, setGuess] = useState<CardOutcome | null>(null);

  const deck = useMemo(
    () => [...CARD_INCIDENTS].sort(() => Math.random() - 0.5),
    [],
  );
  const rounds = Math.min(deck.length, Math.max(6, names.length * 2));

  function addName() {
    const n = input.trim();
    if (!n || names.includes(n)) { setInput(""); return; }
    setNames((ns) => [...ns, n.slice(0, 16)]); setInput(""); tap();
  }
  function start() {
    if (names.length < 1) return;
    setScores(Object.fromEntries(names.map((n) => [n, 0])));
    setTurn(0); setGuess(null); setPhase("play"); tap();
  }

  const player = names[turn % names.length];
  const incident = deck[turn];

  function lockGuess(v: CardOutcome) { tap(); setGuess(v); setPhase("reveal"); }
  function next() {
    const correct = guess === incident.outcome;
    if (correct) { celebrate(); setScores((s) => ({ ...s, [player]: (s[player] ?? 0) + 1 })); }
    else confirmBuzz();
    const nt = turn + 1;
    setGuess(null);
    if (nt >= rounds) setPhase("done");
    else { setTurn(nt); setPhase("play"); }
  }

  if (phase === "setup") {
    return (
      <div className="game-stage roulette-setup">
        <span className="game-emoji">🟨</span>
        <h3>Card Happy</h3>
        <p className="roulette-intro">Pass the phone. Read the incident out, everyone calls the card. Best ref in the room wins; worst gets the next round in.</p>
        <div className="name-chips">
          {names.map((n) => (
            <span key={n} className="name-chip">{n}<button aria-label={`Remove ${n}`} onClick={() => { tap(); setNames((ns) => ns.filter((x) => x !== n)); }}>✕</button></span>
          ))}
        </div>
        <div className="pool-form-row">
          <input className="field-input" value={input} placeholder="Add a player" autoCapitalize="words" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addName()} />
          <button className="cta sm" onClick={addName} disabled={!input.trim()}>Add</button>
        </div>
        <button className="cta wide" disabled={names.length < 1} onClick={start}>{names.length < 1 ? "Add a player" : `Start (${names.length})`}</button>
      </div>
    );
  }

  if (phase === "done") {
    const board = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = board[0];
    return (
      <div className="game-stage roulette-won">
        <span className="game-emoji">🧑‍⚖️</span>
        <span className="roulette-won-cap">Best ref in the room</span>
        <h3 className="roulette-won-name">{top ? top[0] : "Nobody"}</h3>
        <ol className="board game-board">
          {board.map(([n, s], i) => (
            <li key={n} className="board-row"><span className="board-rank">{i + 1}</span><span className="board-name">{n}</span><span className="board-score">{s}</span></li>
          ))}
        </ol>
        <button className="cta wide" onClick={() => { setPhase("setup"); }}>New game</button>
      </div>
    );
  }

  return (
    <div className="game-stage cardhappy">
      <div className="ch-turn">
        <span className="ch-turn-cap">{phase === "reveal" ? "Verdict" : "Your call"} · pass to</span>
        <h3 className="ch-turn-name">{player}</h3>
        <span className="ch-progress">{turn + 1} / {rounds}</span>
      </div>
      <p className="ch-incident">{incident.text}</p>
      {phase === "play" ? (
        <div className="ch-options">
          {OPTIONS.map((o) => (
            <button key={o.v} className="ch-option" onClick={() => lockGuess(o.v)}>
              <span className="ch-option-emoji">{o.emoji}</span>{o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="ch-reveal">
          <p className={`ch-result ${guess === incident.outcome ? "good" : "bad"}`}>
            {guess === incident.outcome ? "Spot on. +1" : "Not this time."}
          </p>
          <p className="ch-answer">
            Ref's call: <strong>{OPTIONS.find((o) => o.v === incident.outcome)?.emoji} {OPTIONS.find((o) => o.v === incident.outcome)?.label}</strong>
          </p>
          <button className="cta wide" onClick={next}>{turn + 1 >= rounds ? "See the table" : "Next one"}</button>
        </div>
      )}
    </div>
  );
}
