import { useState } from "react";
import {
  BRACKET_SHAPE,
  ROUND_LABEL,
  ROUNDS,
  TEAMS,
  type RoundId,
} from "../data/tournament";
import { team } from "../data/teams";
import { championOf, isComplete, resolveBracket } from "../lib/bracket";
import { tipsLocked } from "../lib/locktimer";
import { useStore } from "../state";
import { Confetti, Flag, teamVars } from "../ui/atoms";
import { celebrate, tap } from "../lib/haptics";
import { ShareSheet } from "./ShareSheet";

export function BracketView({ onChampion }: { onChampion?: () => void }) {
  const { profile, prediction, pickWinner, setTopScorer, setOutsideBet } = useStore();
  const [round, setRound] = useState<RoundId>("R32");
  const [fire, setFire] = useState(0);
  const [share, setShare] = useState(false);
  const locked = tipsLocked(Date.now());

  const { participants, r32 } = resolveBracket(
    prediction.groups,
    prediction.knockout,
  );
  const r32Ready = r32.filter(Boolean).length;
  const champ = championOf(prediction);
  const complete = isComplete(prediction);

  function pick(slotId: string, teamId: string | null) {
    if (!teamId || locked) return;
    const wasFinal = slotId === "F-0";
    const before = prediction.knockout["F-0"];
    pickWinner(slotId, teamId);
    if (wasFinal && before !== teamId) {
      celebrate();
      setFire((f) => f + 1);
      onChampion?.();
    } else {
      tap();
    }
  }

  return (
    <div className="bracket">
      <Confetti fire={fire} />
      <div className="section-head">
        <div>
          <h2 className="section-title">Route to the Final</h2>
          <p className="section-hint">Tap a team to send them through.</p>
        </div>
      </div>

      {r32Ready < 8 && (
        <div className="lock-note">
          Finish your groups to fill your route to the final. {r32Ready}/32 spots set.
        </div>
      )}

      {champ && (
        <div className="champ-banner" style={teamVars(team(champ))}>
          <span className="champ-banner-label">Your champion</span>
          <span className="champ-banner-team">
            <Flag id={champ} size={34} /> {team(champ).name}
          </span>
          <span className="champ-banner-cup" aria-hidden>🏆</span>
        </div>
      )}

      {champ && (
        <GoldenBoot
          selected={prediction.topScorer}
          onPick={(id) => { if (locked) return; tap(); setTopScorer(prediction.topScorer === id ? undefined : id); }}
        />
      )}

      {champ && (
        <OutsideBet
          selected={prediction.outsideBet}
          onPick={(id) => { if (locked) return; tap(); setOutsideBet(prediction.outsideBet === id ? undefined : id); }}
        />
      )}

      {/* Round-by-round (mobile + default) */}
      <div className="bracket-rounds">
        <div className="round-rail">
          {ROUNDS.map((r) => {
            const slots = BRACKET_SHAPE[r];
            const done = slots.filter((s) => prediction.knockout[s.id]).length;
            return (
              <button
                key={r}
                className={`round-chip ${r === round ? "is-sel" : ""}`}
                onClick={() => { tap(); setRound(r); }}
              >
                <span className="round-chip-name">{r === "F" ? "Final" : r}</span>
                <span className="round-chip-count">{done}/{slots.length}</span>
              </button>
            );
          })}
        </div>

        <h3 className="round-title">{ROUND_LABEL[round]}</h3>

        <div className={`match-list ${round === "F" ? "is-final" : ""}`}>
          {BRACKET_SHAPE[round].map((slot) => {
            const [a, b] = participants[slot.id] ?? [null, null];
            const winner = prediction.knockout[slot.id];
            return (
              <div className="match" key={slot.id}>
                <SlotSide teamId={a} picked={winner === a} dimmed={Boolean(winner) && winner !== a} onPick={() => pick(slot.id, a)} />
                <span className="match-v" aria-hidden>v</span>
                <SlotSide teamId={b} picked={winner === b} dimmed={Boolean(winner) && winner !== b} onPick={() => pick(slot.id, b)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Whole-bracket tree (desktop ≥1024px) */}
      <div className="bracket-tree" aria-hidden={false}>
        {ROUNDS.map((r) => (
          <div className={`tree-col tree-${r}`} key={r}>
            <span className="tree-col-head">{r === "F" ? "Final" : r}</span>
            <div className="tree-matches">
              {BRACKET_SHAPE[r].map((slot) => {
                const [a, b] = participants[slot.id] ?? [null, null];
                const winner = prediction.knockout[slot.id];
                return (
                  <div className={`tree-match${winner ? " is-done" : ""}`} key={slot.id}>
                    <SlotSide teamId={a} picked={winner === a} dimmed={Boolean(winner) && winner !== a} onPick={() => pick(slot.id, a)} />
                    <SlotSide teamId={b} picked={winner === b} dimmed={Boolean(winner) && winner !== b} onPick={() => pick(slot.id, b)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {complete && (
        <button className="cta wide mycall-cta" onClick={() => { tap(); setShare(true); }}>
          🔒 That's my call — share it
        </button>
      )}

      {share && profile && (
        <ShareSheet
          profile={profile}
          prediction={prediction}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

function OutsideBet({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (id: string) => void;
}) {
  // Long-shots first: the weakest seeds are the spicy outside bets.
  const teams = [...TEAMS].sort((a, b) => b.seed - a.seed);
  const picked = selected ? team(selected) : null;
  const bonus = picked ? outsideBetBonus(picked.seed) : 0;
  return (
    <div className="golden-boot outside-bet">
      <div className="golden-boot-head">
        <span className="golden-boot-cap">🐴 Outside Bet · bonus points</span>
        <span className="golden-boot-sub">
          {picked ? (
            <>Your bolter: <strong>{picked.flag} {picked.name}</strong></>
          ) : (
            "Back a long-shot to reach the last 16. The braver the call, the bigger the bonus."
          )}
        </span>
      </div>
      {picked && (
        <div className="ob-stakes">
          <span className="ob-stakes-num">+{bonus}</span>
          <span className="ob-stakes-txt">
            pts if <strong>{picked.short}</strong> reach the knockouts.{" "}
            {picked.seed >= 33 ? "Proper brave." : picked.seed >= 17 ? "Outside shout." : "Safe-ish."}
          </span>
        </div>
      )}
      <div className="boot-rail">
        {teams.map((t) => (
          <button
            key={t.id}
            className={`boot-chip${selected === t.id ? " is-sel" : ""}`}
            style={teamVars(t)}
            onClick={() => onPick(t.id)}
            aria-pressed={selected === t.id}
          >
            <Flag id={t.id} size={22} />
            <span>{t.short}</span>
            <em className="boot-bonus">+{outsideBetBonus(t.seed)}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The weaker the nation (higher seed), the bigger the bonus for backing them. */
function outsideBetBonus(seed: number): number {
  return 15 + Math.round((seed / 48) * 55); // ~16 (favourite) → 70 (rank outsider)
}

function GoldenBoot({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (id: string) => void;
}) {
  const teams = [...TEAMS].sort((a, b) => a.seed - b.seed);
  const picked = selected ? team(selected) : null;
  return (
    <div className="golden-boot">
      <div className="golden-boot-head">
        <span className="golden-boot-cap">⚽️ Golden Boot</span>
        <span className="golden-boot-sub">
          {picked ? (
            <>Your pick: <strong>{picked.flag} {picked.name}</strong></>
          ) : (
            "Which nation's striker tops the charts?"
          )}
        </span>
      </div>
      <div className="boot-rail">
        {teams.map((t) => (
          <button
            key={t.id}
            className={`boot-chip${selected === t.id ? " is-sel" : ""}`}
            style={teamVars(t)}
            onClick={() => onPick(t.id)}
            aria-pressed={selected === t.id}
          >
            <Flag id={t.id} size={22} />
            <span>{t.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotSide({
  teamId,
  picked,
  dimmed,
  onPick,
}: {
  teamId: string | null;
  picked: boolean;
  dimmed: boolean;
  onPick: () => void;
}) {
  const t = teamId ? team(teamId) : null;
  return (
    <button
      className={`slot ${picked ? "is-picked" : ""} ${dimmed ? "is-dim" : ""}`}
      style={t ? teamVars(t) : undefined}
      disabled={!teamId}
      onClick={onPick}
    >
      <Flag id={teamId} size={30} />
      <span className="slot-name">{t ? t.short : "TBD"}</span>
      {picked && (
        <span className="slot-check" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}
