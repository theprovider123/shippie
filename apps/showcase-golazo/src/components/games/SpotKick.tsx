import { useState } from "react";
import { FreeKick } from "./FreeKick";
import { PenaltyDuel } from "./PenaltyDuel";
import type { Duel } from "../../lib/duel";
import { tap } from "../../lib/haptics";

type Mode = "pick" | "freekick" | "penalty";

/**
 * Spot Kick — a unified set-piece game. The player picks either a free kick
 * (swipe-to-curl mechanic, endless scoring) or a penalty shootout (aim and
 * keep, 5 kicks + sudden death vs AI or a mate by link). Both games share the
 * same entry point so the experience stays tightly packaged.
 */
export function SpotKick({
  onGameOver,
  playerName,
  duel,
  target,
  difficulty = 0.35,
}: {
  onGameOver: (score: number) => void;
  playerName: string;
  duel?: Duel | null;
  target?: number;
  difficulty?: number;
}) {
  const [mode, setMode] = useState<Mode>(duel ? "penalty" : "pick");

  if (mode === "freekick") {
    return (
      <div className="spotKick">
        <button className="spotKick-back" onClick={() => { tap(); setMode("pick"); }}>
          ← Set Pieces
        </button>
        <FreeKick onGameOver={onGameOver} target={target} difficulty={difficulty} />
      </div>
    );
  }

  if (mode === "penalty") {
    return (
      <div className="spotKick">
        {!duel && (
          <button className="spotKick-back" onClick={() => { tap(); setMode("pick"); }}>
            ← Set Pieces
          </button>
        )}
        <PenaltyDuel duel={duel} playerName={playerName} />
      </div>
    );
  }

  return (
    <div className="spotKick-picker">
      <div className="spotKick-modes">
        <button className="spotKick-mode" onClick={() => { tap(); setMode("freekick"); }}>
          <span className="spotKick-mode-emoji">🧱</span>
          <span className="spotKick-mode-name">Free Kick</span>
          <span className="spotKick-mode-how">Swipe to bend it past the wall — endless, gets harder</span>
          <span className="spotKick-mode-cta">Play →</span>
        </button>
        <button className="spotKick-mode" onClick={() => { tap(); setMode("penalty"); }}>
          <span className="spotKick-mode-emoji">🥅</span>
          <span className="spotKick-mode-name">Penalty Shootout</span>
          <span className="spotKick-mode-how">Keeper AND striker — 5 kicks each, then sudden death</span>
          <span className="spotKick-mode-cta">Play →</span>
        </button>
      </div>
    </div>
  );
}
