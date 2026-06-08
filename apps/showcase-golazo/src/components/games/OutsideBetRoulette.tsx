import { useRef, useState } from "react";
import { TEAMS, team } from "../../data/teams";
import { spinNation } from "../../lib/outsidebet";
import { sweepCardBlob } from "../../lib/sharecard";
import { tap, celebrate } from "../../lib/haptics";

// The full 48-team field — long-shots are exactly the point.
const FIELD = TEAMS.map((t) => t.id);

/**
 * Outside Bet Roulette — spin to be handed a random nation. Your whole tournament
 * then rides on their run. Shareable "I got Saudi Arabia 😬" card on the spin.
 */
export function OutsideBetRoulette({ playerName }: { playerName: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<string>(FIELD[0]);
  const seedRef = useRef(0);
  const [copied, setCopied] = useState(false);

  function spin() {
    if (spinning) return;
    tap();
    setSpinning(true);
    setPicked(null);
    let ticks = 0;
    const total = 22 + Math.floor(Math.random() * 8);
    const iv = window.setInterval(() => {
      ticks++;
      seedRef.current += 1;
      setReel(spinNation(seedRef.current * 2654435761, FIELD));
      if (ticks >= total) {
        window.clearInterval(iv);
        const final = spinNation((seedRef.current + Date.now()) >>> 0, FIELD);
        setReel(final);
        setPicked(final);
        setSpinning(false);
        celebrate();
      }
    }, 70);
  }

  async function share() {
    if (!picked) return;
    tap();
    const t = team(picked);
    const text = `🎲 The roulette gave me ${t.flag} ${t.name} for the World Cup. Pray for me. — Golazo`;
    const blob = await sweepCardBlob({
      playerName,
      teamId: picked,
      sweepName: "Outside Bet Roulette",
    });
    if (blob) {
      const file = new File([blob], "golazo-roulette.png", { type: "image/png" });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
      } catch {
        /* fall through */
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* */
    }
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* */
    }
  }

  const reelTeam = team(reel);
  return (
    <div className="game-stage roulette-setup obr">
      <span className="game-emoji">🎲</span>
      <h3>Outside Bet Roulette</h3>
      <p className="roulette-intro">
        Spin the wheel. Whatever nation it lands on is yours for the whole
        tournament — your glory or your shame rides entirely on them.
      </p>

      <div className={`obr-reel${spinning ? " is-spinning" : ""}${picked ? " is-locked" : ""}`}>
        <span className="obr-flag">{reelTeam.flag}</span>
        <span className="obr-name">{reelTeam.name}</span>
      </div>

      {picked ? (
        <>
          <p className="obr-verdict">
            You got <strong>{team(picked).name}</strong>. {verdictLine(picked)}
          </p>
          <button className="cta wide" onClick={share}>
            {copied ? "Copied ✓" : "I got " + team(picked).short + " 😬 — share it"}
          </button>
          <button className="ghost-btn sm" onClick={spin}>
            Spin again
          </button>
        </>
      ) : (
        <button className="cta wide" disabled={spinning} onClick={spin}>
          {spinning ? "Spinning…" : "Spin the wheel"}
        </button>
      )}
    </div>
  );
}

function verdictLine(id: string): string {
  const seed = team(id).seed;
  if (seed <= 6) return "Lucked out there — proper contenders.";
  if (seed <= 16) return "Could go either way. Outside shout.";
  if (seed <= 32) return "Brave. Strap in.";
  return "Oof. Say your goodbyes now.";
}
