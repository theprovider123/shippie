import { useMemo, useState } from "react";
import { team } from "../data/teams";
import { drawSweep, type Sweep } from "../lib/sweeps";
import { useStore } from "../state";
import { teamVars } from "../ui/atoms";
import { confirmBuzz, tap } from "../lib/haptics";

/**
 * The office classic: enter who's in, tap Draw, everyone gets random nations.
 * Deterministic from the saved seed, so the draw is fair + reproducible and a
 * re-open shows the same result. Optionally pre-filled from a pool's members.
 */
export function Sweepstakes({
  initialMembers,
  onBack,
}: {
  initialMembers?: string[];
  onBack: () => void;
}) {
  const store = useStore();
  const { sweeps } = store;
  const [names, setNames] = useState<string[]>(initialMembers ?? []);
  const [input, setInput] = useState("");
  const [active, setActive] = useState<Sweep | null>(null);

  function addName() {
    const n = input.trim();
    if (!n || names.includes(n)) {
      setInput("");
      return;
    }
    setNames((ns) => [...ns, n.slice(0, 24)]);
    setInput("");
    tap();
  }

  function draw() {
    if (names.length < 2) return;
    const sweep = store.createSweep("Sweepstake", names);
    confirmBuzz();
    setActive(sweep);
  }

  if (active) {
    return (
      <SweepResult
        sweep={active}
        onRedraw={() => {
          store.removeSweep(active.id);
          const fresh = store.createSweep(active.name, active.members);
          setActive(fresh);
        }}
        onClose={() => setActive(null)}
      />
    );
  }

  return (
    <div className="sweeps">
      <div className="pool-detail-head">
        <button className="back-btn" onClick={() => { tap(); onBack(); }}>
          ← Back
        </button>
      </div>
      <h2 className="section-title">Sweepstake</h2>
      <p className="sweeps-intro">
        Add everyone in the room. One tap deals all 48 nations out at random —
        fair, reproducible, no money handling, no accounts.
      </p>

      <div className="name-chips">
        {names.map((n) => (
          <span key={n} className="name-chip">
            {n}
            <button
              aria-label={`Remove ${n}`}
              onClick={() => { tap(); setNames((ns) => ns.filter((x) => x !== n)); }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="pool-form-row">
        <input
          className="field-input"
          value={input}
          placeholder="Add a name"
          autoCapitalize="words"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addName()}
        />
        <button className="cta sm" onClick={addName} disabled={!input.trim()}>
          Add
        </button>
      </div>

      <button className="cta wide" disabled={names.length < 2} onClick={draw}>
        {names.length < 2 ? "Add at least 2 people" : `Draw for ${names.length}`}
      </button>

      {sweeps.length > 0 && (
        <>
          <span className="field-label" style={{ marginTop: 22 }}>
            Saved draws
          </span>
          <ul className="pool-list">
            {sweeps.map((s) => (
              <li key={s.id}>
                <button className="pool-row" onClick={() => { tap(); setActive(s); }}>
                  <span className="pool-row-name">{s.name}</span>
                  <span className="pool-row-meta">
                    <span className="pool-code">{s.seed}</span>
                    <span className="pool-count">{s.members.length} in</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SweepResult({
  sweep,
  onRedraw,
  onClose,
}: {
  sweep: Sweep;
  onRedraw: () => void;
  onClose: () => void;
}) {
  const store = useStore();
  const draw = useMemo(
    () => drawSweep(sweep.members, sweep.seed),
    [sweep.members, sweep.seed],
  );

  async function share() {
    tap();
    const lines = sweep.members.map(
      (m) =>
        `${m}: ${(draw[m] ?? [])
          .map((id) => `${team(id).flag} ${team(id).short}`)
          .join(", ")}`,
    );
    const text = `🎲 Golazo sweepstake (seed ${sweep.seed})\n${lines.join("\n")}\n\nMake your own → shippie.app/run/golazo`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Golazo sweepstake", text });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="sweeps">
      <div className="pool-detail-head">
        <button className="back-btn" onClick={() => { tap(); onClose(); }}>
          ← Sweepstakes
        </button>
        <span className="pool-code lg">{sweep.seed}</span>
      </div>
      <h2 className="section-title">The draw</h2>

      <ul className="sweeps-list">
        {sweep.members.map((m) => {
          const teams = draw[m] ?? [];
          return (
            <li key={m} className="sweeps-row">
              <span className="sweeps-person">{m}</span>
              <span className="sweeps-teams">
                {teams.map((id) => (
                  <span key={id} className="sweeps-team" style={teamVars(team(id))}>
                    {team(id).flag} {team(id).short}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="sweeps-seed">
        seed {sweep.seed} · same names + seed always deal the same draw
      </p>

      <button className="cta wide" onClick={share}>
        Share the draw
      </button>
      <div className="pool-detail-actions">
        <button className="ghost-btn" onClick={() => { tap(); onRedraw(); }}>
          Re-draw
        </button>
        <button
          className="ghost-btn"
          onClick={() => {
            tap();
            store.removeSweep(sweep.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
