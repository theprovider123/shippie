import { useState } from "react";
import { team } from "../../data/teams";
import {
  PLAYERS,
  MANAGER_BUDGET,
  squadCost,
  squadRating,
  validXI,
  managerUrl,
  type Player,
  type Position,
} from "../../lib/manager";
import { Flag } from "../../ui/atoms";
import { tap, celebrate } from "../../lib/haptics";

const POS_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];
const POS_LABEL: Record<Position, string> = {
  GK: "Keepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

/**
 * Manager Mode — pick a starting XI from a fixed budget, share the team sheet,
 * duel a mate by link. With no live performances yet, a duel is settled on squad
 * star power. Pure local, no accounts.
 */
export function ManagerMode({ playerName, opponent }: { playerName: string; opponent?: string[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const cost = squadCost(picked);
  const left = MANAGER_BUDGET - cost;
  const full = picked.length === 11;
  const legal = validXI(picked);

  function toggle(p: Player) {
    if (picked.includes(p.id)) {
      tap();
      setPicked((s) => s.filter((id) => id !== p.id));
      return;
    }
    if (picked.length >= 11) return;
    if (cost + p.cost > MANAGER_BUDGET) return;
    tap();
    setPicked((s) => [...s, p.id]);
    if (picked.length + 1 === 11) celebrate();
  }

  async function challenge() {
    tap();
    const url = managerUrl(picked);
    const text = `⚽️ My Golazo Manager Mode XI is picked (${squadRating(picked)} star rating). Build yours and beat it → ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
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

  const myRating = squadRating(picked);
  const oppRating = opponent ? squadRating(opponent) : null;

  return (
    <div className="game-stage manager">
      <span className="game-emoji">📋</span>
      <h3>Manager Mode</h3>
      {opponent ? (
        <p className="roulette-intro">A mate set their XI ({oppRating} rating). Pick yours from the budget and see whose sheet is stronger.</p>
      ) : (
        <p className="roulette-intro">Pick your XI from a £{MANAGER_BUDGET} budget. Share the sheet, duel a mate by link.</p>
      )}

      <div className="mgr-bank">
        <div className="mgr-bank-stat"><span>{picked.length}/11</span><small>picked</small></div>
        <div className={`mgr-bank-stat${left < 0 ? " over" : ""}`}><span>{left}</span><small>budget left</small></div>
        <div className="mgr-bank-stat"><span>{myRating}</span><small>rating</small></div>
      </div>

      {POS_ORDER.map((pos) => (
        <div className="mgr-group" key={pos}>
          <span className="field-label">{POS_LABEL[pos]}</span>
          <div className="mgr-rail">
            {PLAYERS.filter((p) => p.pos === pos).map((p) => {
              const on = picked.includes(p.id);
              const afford = on || (picked.length < 11 && cost + p.cost <= MANAGER_BUDGET);
              return (
                <button
                  key={p.id}
                  className={`mgr-chip${on ? " is-sel" : ""}`}
                  disabled={!afford}
                  onClick={() => toggle(p)}
                  aria-pressed={on}
                >
                  <Flag id={p.nation} size={18} />
                  <span className="mgr-chip-name">{p.name}</span>
                  <span className="mgr-chip-cost">{team(p.nation).short} · {p.cost}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {full && opponent && oppRating !== null && (
        <p className={`mgr-duel ${myRating >= oppRating ? "win" : "lose"}`}>
          {myRating > oppRating
            ? `Your sheet edges it, ${playerName} — ${myRating} to ${oppRating}.`
            : myRating === oppRating
              ? `Dead level on ${myRating}. It'll come down to the football.`
              : `Their sheet's stronger — ${oppRating} to ${myRating}. Back to the drawing board.`}
        </p>
      )}

      <button className="cta wide" disabled={!legal} onClick={challenge}>
        {!full ? `Pick ${11 - picked.length} more` : copied ? "Copied ✓" : opponent ? "Lock it in & share" : "Challenge a mate"}
      </button>
    </div>
  );
}
