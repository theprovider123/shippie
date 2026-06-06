import { useState } from "react";
import {
  GROUP_LETTERS,
  GROUPS,
  groupTeams,
  type GroupLetter,
} from "../data/tournament";
import { team } from "../data/teams";
import { useStore } from "../state";
import { Flag, teamVars } from "../ui/atoms";
import { confirmBuzz, tap } from "../lib/haptics";

const POS_LABEL = ["1st", "2nd", "3rd", "4th"];
const POS_TAG = ["QUALIFIED", "QUALIFIED", "3RD — WATCH", "OUT"];

export function GroupStage({ onAllDone }: { onAllDone?: () => void }) {
  const { prediction, setGroupOrder } = useStore();
  const firstIncomplete =
    GROUP_LETTERS.find((l) => (prediction.groups[l]?.length ?? 0) < 4) ?? "A";
  const [sel, setSel] = useState<GroupLetter>(firstIncomplete);

  const order = prediction.groups[sel] ?? [];
  const allTeams = groupTeams(sel).map((t) => t.id);
  const placed = order.filter((id) => allTeams.includes(id));
  const unplaced = allTeams.filter((id) => !placed.includes(id));
  const rows = [...placed, ...unplaced];

  function place(letter: GroupLetter, id: string) {
    const cur = (prediction.groups[letter] ?? []).filter((x) =>
      GROUPS[letter].includes(x),
    );
    if (cur.includes(id)) {
      // Un-rank: drop this team; everyone below shifts up.
      tap();
      setGroupOrder(letter, cur.filter((x) => x !== id));
      return;
    }
    const next = [...cur, id];
    setGroupOrder(letter, next);
    if (next.length === 4) {
      confirmBuzz();
      advance(letter);
    } else {
      tap();
    }
  }

  function advance(after: GroupLetter) {
    const idx = GROUP_LETTERS.indexOf(after);
    const rest = [...GROUP_LETTERS.slice(idx + 1), ...GROUP_LETTERS.slice(0, idx)];
    const nextIncomplete = rest.find(
      (l) => (prediction.groups[l]?.length ?? 0) < 4,
    );
    window.setTimeout(() => {
      if (nextIncomplete) setSel(nextIncomplete);
      else onAllDone?.();
    }, 420);
  }

  const doneCount = GROUP_LETTERS.filter(
    (l) => (prediction.groups[l]?.length ?? 0) === 4,
  ).length;

  return (
    <div className="groups">
      <div className="section-head">
        <div>
          <h2 className="section-title">The Groups</h2>
          <p className="section-hint">
            Tap teams into your finishing order. Top two go through.
          </p>
        </div>
        <div className="tally">
          <strong>{doneCount}</strong>
          <span>/ 12</span>
        </div>
      </div>

      <div className="letter-rail" role="tablist" aria-label="Groups">
        {GROUP_LETTERS.map((l) => {
          const done = (prediction.groups[l]?.length ?? 0) === 4;
          return (
            <button
              key={l}
              role="tab"
              aria-selected={l === sel}
              className={`letter ${l === sel ? "is-sel" : ""} ${done ? "is-done" : ""}`}
              onClick={() => {
                tap();
                setSel(l);
              }}
            >
              {l}
              {done && <span className="letter-tick" aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>

      <div className="group-card" key={sel}>
        <div className="group-card-head">
          <span className="group-name">Group {sel}</span>
          <span className="group-status">
            {placed.length === 4 ? "Called" : `${placed.length} of 4 placed`}
          </span>
        </div>

        <ul className="rank-list">
          {rows.map((id) => {
            const pos = placed.indexOf(id);
            const isPlaced = pos >= 0;
            const t = team(id);
            return (
              <li key={id}>
                <button
                  className={`rank-row pos-${isPlaced ? pos : "none"}`}
                  style={teamVars(t)}
                  onClick={() => place(sel, id)}
                >
                  <span className="rank-medal" aria-hidden>
                    {isPlaced ? pos + 1 : "+"}
                  </span>
                  <Flag id={id} size={30} />
                  <span className="rank-name">{t.name}</span>
                  {isPlaced ? (
                    <span className={`rank-tag tag-${pos}`}>{POS_TAG[pos]}</span>
                  ) : (
                    <span className="rank-tag tag-tap">TAP TO RANK</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="group-foot">
          <span className="group-legend">
            <i className="dot dot-q" /> Qualify &nbsp;·&nbsp;
            <i className="dot dot-3" /> Best-third watch
          </span>
          {placed.length > 0 && (
            <button
              className="ghost-btn"
              onClick={() => {
                tap();
                setGroupOrder(sel, []);
              }}
            >
              Clear group
            </button>
          )}
        </div>
      </div>

      <div className="pos-key">
        {POS_LABEL.map((p, i) => (
          <span key={p} className={`pos-key-item k-${i}`}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
