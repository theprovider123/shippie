import { useMemo } from "react";
import { team } from "../data/teams";
import { drawFor, potTotal, sweepMode, sweepScope, SCOPE_LABEL, type Sweep } from "../lib/sweeps";
import { useStore } from "../state";
import { teamVars } from "../ui/atoms";
import { confirmBuzz, tap } from "../lib/haptics";

/**
 * Someone shared a sweepstake link. The draw is deterministic, so we recompute
 * the exact same allocation here — no backend. If the viewer's name is in the
 * draw we spotlight their nation. Saving drops it into their saved draws.
 */
export function IncomingSweep({ sweep, onClose }: { sweep: Sweep; onClose: () => void }) {
  const store = useStore();
  const { profile } = store;
  const draw = useMemo(() => drawFor(sweep), [sweep]);
  const pot = potTotal(sweep);

  const myName = profile?.name?.trim();
  const myEntry = myName
    ? Object.keys(draw).find((m) => m.toLowerCase() === myName.toLowerCase())
    : undefined;
  const myTeams = myEntry ? draw[myEntry] ?? [] : [];

  return (
    <div className="incoming sweep-incoming" role="dialog" aria-modal="true">
      <button className="incoming-x" onClick={() => { tap(); onClose(); }} aria-label="Close">✕</button>
      <p className="incoming-kicker">🎲 You're in the sweepstake</p>
      <h1 className="incoming-name">{sweep.name}</h1>
      <p className="incoming-sub">
        {sweep.members.length} players · {sweepMode(sweep) === "classic" ? "one nation each" : "field split"} ·{" "}
        {SCOPE_LABEL[sweepScope(sweep)].toLowerCase()}
        {pot ? ` · pot ${sweep.currency}${pot}` : ""}
      </p>

        {myTeams.length > 0 && (
          <div className="my-draw">
            <span className="my-draw-cap">You drew</span>
            <div className="my-draw-teams">
              {myTeams.map((id) => (
                <span key={id} className="my-draw-team" style={teamVars(team(id))}>
                  <span className="my-draw-flag">{team(id).flag}</span>
                  {team(id).name}
                </span>
              ))}
            </div>
          </div>
        )}

        <ul className="sweeps-list compact">
          {sweep.members.map((m) => (
            <li key={m} className={`sweeps-row${m === myEntry ? " is-me" : ""}`}>
              <span className="sweeps-person">{m}</span>
              <span className="sweeps-teams">
                {(draw[m] ?? []).map((id) => (
                  <span key={id} className="sweeps-team" style={teamVars(team(id))}>
                    {team(id).flag} {team(id).short}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <button
          className="cta wide"
          onClick={() => { confirmBuzz(); store.importSweep(sweep); onClose(); }}
        >
          Save this sweepstake
        </button>
        <button className="ghost-btn" onClick={() => { tap(); onClose(); }}>
          Not now
        </button>
    </div>
  );
}
