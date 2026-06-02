import { useState } from "react";
import { tap as hapticTap, confirmBuzz, celebrate } from "../../lib/haptics";

type Zone = -1 | 0 | 1;
const ZONES: { z: Zone; label: string }[] = [
  { z: -1, label: "Left" },
  { z: 0, label: "Middle" },
  { z: 1, label: "Right" },
];

/**
 * Penalty Roulette — pass-the-phone group knockout. Everyone takes a pen; the
 * keeper guesses a side, and if it saves yours you're out. Last one standing wins.
 * Pure local, no accounts — the pub game.
 */
export function PenaltyRoulette() {
  const [names, setNames] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [alive, setAlive] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"setup" | "play" | "won">("setup");
  const [flash, setFlash] = useState<"goal" | "saved" | null>(null);
  const [busy, setBusy] = useState(false);

  function addName() {
    const n = input.trim();
    if (!n || names.includes(n)) { setInput(""); return; }
    setNames((ns) => [...ns, n.slice(0, 16)]); setInput(""); hapticTap();
  }
  function start() {
    if (names.length < 2) return;
    setAlive(names); setIdx(0); setPhase("play"); hapticTap();
  }

  function kick(z: Zone) {
    if (busy) return;
    setBusy(true);
    const keeper = [-1, 0, 1][Math.floor(Math.random() * 3)] as Zone;
    const saved = keeper === z;
    setFlash(saved ? "saved" : "goal");
    if (saved) confirmBuzz(); else celebrate();
    setTimeout(() => {
      setFlash(null);
      setBusy(false);
      if (saved) {
        const out = alive[idx];
        const next = alive.filter((n) => n !== out);
        if (next.length <= 1) { setAlive(next); setPhase("won"); return; }
        setAlive(next);
        setIdx((i) => i % next.length);
      } else {
        setIdx((i) => (i + 1) % alive.length);
      }
    }, 900);
  }

  if (phase === "setup") {
    return (
      <div className="game-stage roulette-setup">
        <span className="game-emoji">🎯</span>
        <h3>Penalty Roulette</h3>
        <p className="roulette-intro">Pass the phone round the table. Take a pen — get saved and you're out. Last one standing wins (or buys the round).</p>
        <div className="name-chips">
          {names.map((n) => (
            <span key={n} className="name-chip">{n}<button aria-label={`Remove ${n}`} onClick={() => { hapticTap(); setNames((ns) => ns.filter((x) => x !== n)); }}>✕</button></span>
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

  if (phase === "won") {
    return (
      <div className="game-stage roulette-won">
        <span className="game-emoji">🏆</span>
        <span className="roulette-won-cap">Last one standing</span>
        <h3 className="roulette-won-name">{alive[0] ?? "Nobody"}</h3>
        <button className="cta wide" onClick={() => { setNames(names); setAlive([]); setIdx(0); setPhase("setup"); }}>New round</button>
        <button className="ghost-btn sm" onClick={() => { setAlive(names); setIdx(0); setPhase("play"); }}>Same players, again</button>
      </div>
    );
  }

  const current = alive[idx];
  return (
    <div className="game-stage roulette-play">
      <div className="roulette-alive">{alive.map((n) => <span key={n} className={`alive-chip${n === current ? " is-up" : ""}`}>{n}</span>)}</div>
      <div className="roulette-turn">
        <span className="roulette-up-cap">Step up</span>
        <h3 className="roulette-up-name">{current}</h3>
        {flash && <span className={`roulette-flash ${flash}`}>{flash === "goal" ? "SCORED! ✅" : "SAVED! ❌ out"}</span>}
      </div>
      <div className="zone-bar static">
        <span className="zone-cap">Pick a corner</span>
        {ZONES.map(({ z, label }) => (
          <button key={z} className="zone-btn" disabled={busy} onClick={() => kick(z)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
