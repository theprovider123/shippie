import { useState } from "react";
import { TEAMS } from "../data/tournament";
import { team } from "../data/teams";
import { useStore } from "../state";
import { Flag, teamVars } from "../ui/atoms";
import { confirmBuzz, tap } from "../lib/haptics";

export function Onboarding() {
  const { setProfile } = useStore();
  const [name, setName] = useState("");
  const [fav, setFav] = useState<string | undefined>(undefined);

  const ranked = [...TEAMS].sort((a, b) => a.seed - b.seed);
  const canGo = name.trim().length > 0;

  function start() {
    if (!canGo) return;
    confirmBuzz();
    setProfile(name, fav);
  }

  return (
    <div className="onboard" style={fav ? teamVars(team(fav)) : undefined}>
      <div className="onboard-glow" aria-hidden />
      <header className="onboard-head">
        <div className="wordmark">
          GOLAZO<span className="wordmark-dot">.</span>
        </div>
        <h1 className="onboard-title">
          Call the <em>2026</em> World&nbsp;Cup.
        </h1>
        <p className="onboard-sub">
          Build your bracket. Share it by link. Settle it with your mates.
        </p>
      </header>

      <label className="field">
        <span className="field-label">What do they call you?</span>
        <input
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          placeholder="Your name"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && start()}
        />
      </label>

      <div className="field">
        <span className="field-label">
          Your country <span className="field-opt">— optional</span>
        </span>
        <div className="team-grid">
          {ranked.map((t) => {
            const active = fav === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`team-pill ${active ? "is-active" : ""}`}
                style={teamVars(t)}
                onClick={() => {
                  tap();
                  setFav(active ? undefined : t.id);
                }}
                aria-pressed={active}
              >
                <Flag id={t.id} size={22} />
                <span>{t.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="onboard-foot">
        <button className="cta" disabled={!canGo} onClick={start}>
          Start calling it
          <span className="cta-arrow" aria-hidden>
            →
          </span>
        </button>
        <p className="fineprint">
          No login. Works offline. Your call lives on your phone — not a server.
        </p>
      </div>
    </div>
  );
}
