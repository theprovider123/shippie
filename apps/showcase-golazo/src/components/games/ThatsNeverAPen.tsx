import { useMemo, useState } from "react";
import { PEN_SHOUTS } from "../../data/incidents";
import { tap, confirmBuzz } from "../../lib/haptics";

/**
 * That's Never A Penalty — pass-the-phone vote. Everyone calls it pen or no pen,
 * the room's majority decides, then you argue about it. The arguing IS the game.
 */
export function ThatsNeverAPen() {
  const [names, setNames] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"setup" | "vote" | "result">("setup");
  const [round, setRound] = useState(0);
  const [voter, setVoter] = useState(0);
  const [votes, setVotes] = useState<("pen" | "no")[]>([]);

  const deck = useMemo(() => [...PEN_SHOUTS].sort(() => Math.random() - 0.5), []);
  const shout = deck[round % deck.length];

  function addName() {
    const n = input.trim();
    if (!n || names.includes(n)) { setInput(""); return; }
    setNames((ns) => [...ns, n.slice(0, 16)]); setInput(""); tap();
  }
  function start() {
    if (names.length < 2) return;
    setRound(0); setVoter(0); setVotes([]); setPhase("vote"); tap();
  }
  function castVote(v: "pen" | "no") {
    tap();
    const next = [...votes, v];
    if (next.length >= names.length) { setVotes(next); setPhase("result"); confirmBuzz(); }
    else { setVotes(next); setVoter((i) => i + 1); }
  }
  function nextShout() {
    setRound((r) => r + 1); setVoter(0); setVotes([]); setPhase("vote"); tap();
  }

  if (phase === "setup") {
    return (
      <div className="game-stage roulette-setup">
        <span className="game-emoji">🤌</span>
        <h3>That's Never A Pen</h3>
        <p className="roulette-intro">Pass the phone round. Everyone votes pen or no pen. The room decides — then you argue about it for ten minutes. That's the game.</p>
        <div className="name-chips">
          {names.map((n) => (
            <span key={n} className="name-chip">{n}<button aria-label={`Remove ${n}`} onClick={() => { tap(); setNames((ns) => ns.filter((x) => x !== n)); }}>✕</button></span>
          ))}
        </div>
        <div className="pool-form-row">
          <input className="field-input" value={input} placeholder="Add a player" autoCapitalize="words" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addName()} />
          <button className="cta sm" onClick={addName} disabled={!input.trim()}>Add</button>
        </div>
        <button className="cta wide" disabled={names.length < 2} onClick={start}>{names.length < 2 ? "Add at least 2" : `Start (${names.length})`}</button>
      </div>
    );
  }

  if (phase === "vote") {
    return (
      <div className="game-stage tnap">
        <div className="ch-turn">
          <span className="ch-turn-cap">Vote in secret · pass to</span>
          <h3 className="ch-turn-name">{names[voter]}</h3>
          <span className="ch-progress">{votes.length} / {names.length} voted</span>
        </div>
        <p className="ch-incident">{shout.text}</p>
        <div className="tnap-vote">
          <button className="tnap-btn pen" onClick={() => castVote("pen")}>Penalty 👍</button>
          <button className="tnap-btn no" onClick={() => castVote("no")}>Never! 👎</button>
        </div>
      </div>
    );
  }

  // result
  const pen = votes.filter((v) => v === "pen").length;
  const no = votes.length - pen;
  const roomSays = pen === no ? "split" : pen > no ? "pen" : "no";
  return (
    <div className="game-stage tnap-result">
      <p className="ch-incident">{shout.text}</p>
      <div className="tnap-tally">
        <div className={`tnap-side ${roomSays === "pen" ? "win" : ""}`}>
          <span className="tnap-n">{pen}</span><span className="tnap-l">Penalty</span>
        </div>
        <div className={`tnap-side ${roomSays === "no" ? "win" : ""}`}>
          <span className="tnap-n">{no}</span><span className="tnap-l">Never</span>
        </div>
      </div>
      <p className="tnap-verdict">
        {roomSays === "split"
          ? "Dead split. Fight about it."
          : `The room says ${roomSays === "pen" ? "PENALTY" : "NO PEN"}.`}
        {" "}
        <span className="tnap-ref">Ref gave: <strong>{shout.verdict === "pen" ? "Penalty" : "No pen"}</strong> — argue away.</span>
      </p>
      <button className="cta wide" onClick={nextShout}>Next shout</button>
    </div>
  );
}
