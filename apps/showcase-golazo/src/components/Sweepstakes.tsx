import { useMemo, useState } from "react";
import { team } from "../data/teams";
import {
  drawFor,
  sweepStandings,
  sweepWinners,
  isSettled,
  potTotal,
  classicOverflow,
  sweepMode,
  sweepScope,
  SCOPE_LABEL,
  type Sweep,
  type SweepMode,
  type SweepScope,
} from "../lib/sweeps";
import { sweepUrl } from "../lib/codec";
import { STAGE_LABEL } from "../lib/progress";
import { useStore } from "../state";
import { teamVars } from "../ui/atoms";
import { confirmBuzz, tap, celebrate } from "../lib/haptics";

const MODES: { id: SweepMode; label: string; hint: string }[] = [
  { id: "classic", label: "Classic", hint: "One nation each — furthest wins the pot" },
  { id: "draft", label: "Draft", hint: "Split the whole field between players" },
];
const SCOPES: SweepScope[] = ["all48", "top32", "top16"];
const CURRENCIES = ["£", "$", "€", "¥"];

/**
 * The office classic, done properly: pick a mode, set the pot, add the room,
 * draw. Everyone gets their nation, and as results land the standings show
 * whose team is still alive — settle the pot when there's a champion.
 * Deterministic + offline; the draw travels by link, no backend.
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
  const [mode, setMode] = useState<SweepMode>("classic");
  const [scope, setScope] = useState<SweepScope>("all48");
  const [stake, setStake] = useState("");
  const [currency, setCurrency] = useState("£");
  const [active, setActive] = useState<Sweep | null>(null);

  const preview: Sweep = useMemo(
    () => ({ id: "preview", name: "Sweepstake", seed: "preview", members: names, createdAt: 0, mode, scope }),
    [names, mode, scope],
  );
  const overflow = classicOverflow(preview);
  const stakeNum = Math.max(0, Math.round(Number(stake) || 0));

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
    if (names.length < 2 || overflow) return;
    const sweep = store.createSweep("Sweepstake", names, {
      mode,
      scope,
      stake: stakeNum || undefined,
      currency: stakeNum ? currency : undefined,
    });
    confirmBuzz();
    setActive(sweep);
  }

  if (active) {
    return (
      <SweepResult
        sweep={active}
        onRedraw={() => {
          store.removeSweep(active.id);
          const fresh = store.createSweep(active.name, active.members, {
            mode: active.mode,
            scope: active.scope,
            stake: active.stake,
            currency: active.currency,
          });
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
        The office classic. Set the pot, add the room, draw. As the cup unfolds,
        watch whose nation is still alive — settle when there's a champion.
      </p>

      <span className="field-label">Mode</span>
      <div className="sweep-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`sweep-mode${mode === m.id ? " is-sel" : ""}`}
            onClick={() => { tap(); setMode(m.id); }}
            aria-pressed={mode === m.id}
          >
            <span className="sweep-mode-name">{m.label}</span>
            <span className="sweep-mode-hint">{m.hint}</span>
          </button>
        ))}
      </div>

      <span className="field-label">Nations in the hat</span>
      <div className="chip-row">
        {SCOPES.map((s) => (
          <button
            key={s}
            className={`chip-toggle${scope === s ? " is-sel" : ""}`}
            onClick={() => { tap(); setScope(s); }}
          >
            {SCOPE_LABEL[s]}
          </button>
        ))}
      </div>

      <span className="field-label">Pot (optional)</span>
      <div className="pot-row">
        <div className="cur-row">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              className={`cur-toggle${currency === c ? " is-sel" : ""}`}
              onClick={() => { tap(); setCurrency(c); }}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          className="field-input"
          inputMode="numeric"
          value={stake}
          placeholder="Buy-in per player"
          onChange={(e) => setStake(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>
      {stakeNum > 0 && names.length > 0 && (
        <p className="pot-preview">
          Pot: <strong>{currency}{stakeNum * names.length}</strong> · {currency}{stakeNum} × {names.length}
        </p>
      )}

      <span className="field-label">Who's in</span>
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

      {overflow && (
        <p className="sweep-warn">
          More players than nations in {SCOPE_LABEL[scope].toLowerCase()}. Widen the
          scope or switch to Draft so everyone gets a fair shot.
        </p>
      )}

      <button className="cta wide" disabled={names.length < 2 || overflow} onClick={draw}>
        {names.length < 2 ? "Add at least 2 people" : `Draw for ${names.length}`}
      </button>

      {sweeps.length > 0 && (
        <>
          <span className="field-label" style={{ marginTop: 22 }}>Saved draws</span>
          <ul className="pool-list">
            {sweeps.map((s) => (
              <li key={s.id}>
                <button className="pool-row" onClick={() => { tap(); setActive(s); }}>
                  <span className="pool-row-name">{s.name}</span>
                  <span className="pool-row-meta">
                    {s.stake ? <span className="pool-pot">{s.currency}{potTotal(s)}</span> : null}
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
  const { results } = store;
  const draw = useMemo(() => drawFor(sweep), [sweep]);
  const standings = useMemo(() => sweepStandings(sweep, results), [sweep, results]);
  const started = standings.some((s) => s.bestStage !== "out");
  const settled = isSettled(results);
  const winners = settled ? sweepWinners(sweep, results) : [];
  const pot = potTotal(sweep);
  const classic = sweepMode(sweep) === "classic";

  async function share() {
    tap();
    const url = sweepUrl(sweep);
    const lines = sweep.members.map(
      (m) => `${m}: ${(draw[m] ?? []).map((id) => `${team(id).flag} ${team(id).short}`).join(", ")}`,
    );
    const potLine = pot ? `Pot ${sweep.currency}${pot} · winner takes all\n` : "";
    const text = `🎲 ${sweep.name}\n${potLine}${lines.join("\n")}\n\nOpen the draw → ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: sweep.name, text, url });
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
        {pot ? <span className="pool-pot lg">{sweep.currency}{pot}</span> : null}
      </div>
      <h2 className="section-title">{sweep.name}</h2>

      {settled && winners.length > 0 && (
        <div className="sweep-settle" onAnimationStart={() => celebrate()}>
          <span className="sweep-settle-cap">{pot ? "Takes the pot" : "Winner"}</span>
          <strong className="sweep-settle-name">{winners.join(" & ")}</strong>
          {pot ? <span className="sweep-settle-pot">{sweep.currency}{pot}</span> : null}
        </div>
      )}

      {started ? (
        <ul className="sweeps-list">
          {standings.map((s, i) => (
            <li key={s.member} className={`standing-row${winners.includes(s.member) ? " is-win" : ""}`}>
              <span className="standing-rank">{i + 1}</span>
              <span className="sweeps-person">{s.member}</span>
              <span className="standing-team">
                {s.bestTeam && (
                  <span className="sweeps-team" style={teamVars(team(s.bestTeam))}>
                    {team(s.bestTeam).flag} {team(s.bestTeam).short}
                  </span>
                )}
                <span className="standing-stage">{STAGE_LABEL[s.bestStage]}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="sweeps-list">
          {sweep.members.map((m) => (
            <li key={m} className="sweeps-row">
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
      )}

      <p className="sweeps-seed">
        {classic ? "One nation each" : "Field split"} · {SCOPE_LABEL[sweepScope(sweep)].toLowerCase()} · seed {sweep.seed}
      </p>

      <button className="cta wide" onClick={share}>Share the draw</button>
      <div className="pool-detail-actions">
        <button className="ghost-btn" onClick={() => { tap(); onRedraw(); }}>Re-draw</button>
        <button
          className="ghost-btn"
          onClick={() => { tap(); store.removeSweep(sweep.id); onClose(); }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
