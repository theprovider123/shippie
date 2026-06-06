import { useState } from "react";
import { team } from "../data/teams";
import {
  BRACKET_SHAPE,
  GROUP_FIXTURES,
  GROUPS,
  GROUP_LETTERS,
  ROUNDS,
  ROUND_LABEL,
  type GroupLetter,
} from "../data/tournament";
import { hasResults, scorePrediction } from "../lib/scoring";
import { landed } from "../lib/outsidebet";
import { sampleNudge } from "../lib/notifications";
import { useStore } from "../state";
import { Flag, pad2, teamVars, useCountdown } from "../ui/atoms";
import { WatchFrom } from "./WatchFrom";

const NOTIFY_KEY = "golazo:notify";

/** The "You" tab: who you are, your nation, your streak, your stats + settings.
 *  No account — everything lives on this phone. */
export function Profile() {
  const store = useStore();
  const { profile, prediction, results, scores, reactions, streak, pubNight } = store;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [notify, setNotify] = useState<boolean>(() => {
    try { return localStorage.getItem(NOTIFY_KEY) === "1"; } catch { return false; }
  });

  if (!profile) return null;

  const scored = hasResults(results);
  const sc = scored ? scorePrediction(prediction, results) : null;
  const correct = sc?.correctCalls ?? 0;
  const obLanded = prediction.outsideBet && scored && landed(prediction.outsideBet, results);
  const reactionsSent = Object.values(reactions).reduce((n, list) => n + list.length, 0);
  const bestKeepy = scores.filter((e) => e.game === "keepy").reduce((m, e) => Math.max(m, e.score), 0);

  // Mini timeline: knockout slots you called right.
  const calledRight: { round: string; teamId: string }[] = [];
  for (const r of ROUNDS) {
    for (const slot of BRACKET_SHAPE[r]) {
      const pick = prediction.knockout[slot.id];
      if (pick && results.knockout[slot.id] === pick) {
        calledRight.push({ round: ROUND_LABEL[r], teamId: pick });
      }
    }
  }

  function saveName() {
    const clean = name.trim();
    if (clean) store.setProfile(clean, profile!.favTeam);
    setEditing(false);
  }
  function toggleNotify() {
    const next = !notify;
    setNotify(next);
    try { localStorage.setItem(NOTIFY_KEY, next ? "1" : "0"); } catch { /* */ }
  }

  return (
    <div className="home profile" style={profile.favTeam ? teamVars(team(profile.favTeam)) : undefined}>
      <header className="home-head">
        <div>
          <p className="home-greet">Your profile</p>
          {editing ? (
            <div className="pool-form-row" style={{ marginTop: 6 }}>
              <input
                className="field-input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <button className="cta sm" onClick={saveName}>Save</button>
            </div>
          ) : (
            <h1 className="home-name" onClick={() => { setName(profile.name); setEditing(true); }}>
              {profile.name} <span className="edit-hint">✎</span>
            </h1>
          )}
        </div>
        {profile.favTeam && (
          <span className="home-fav" style={teamVars(team(profile.favTeam))}>
            <Flag id={profile.favTeam} size={26} />
          </span>
        )}
      </header>

      {profile.favTeam && <NationCard teamId={profile.favTeam} />}

      <div className="stat-grid">
        <div className="stat-cell">
          <span className="stat-num">{streak}</span>
          <span className="stat-lab">day streak 🔥</span>
        </div>
        <div className="stat-cell">
          <span className="stat-num">{correct}</span>
          <span className="stat-lab">tips called right</span>
        </div>
        <div className="stat-cell">
          <span className="stat-num">{obLanded ? "✓" : prediction.outsideBet ? "…" : "—"}</span>
          <span className="stat-lab">outside bet {obLanded ? "landed" : "pending"}</span>
        </div>
        <div className="stat-cell">
          <span className="stat-num">{reactionsSent}</span>
          <span className="stat-lab">reactions dished out</span>
        </div>
      </div>

      {sc && (
        <div className="score-card">
          <div className="score-big"><strong>{sc.total}</strong><span>pts</span></div>
          <p className="score-sub">{correct} correct knockout call{correct === 1 ? "" : "s"} so far. {bestKeepy ? `Best keepy-uppy: ${bestKeepy}.` : ""}</p>
        </div>
      )}

      <div className="profile-section">
        <span className="field-label">Your tournament so far</span>
        {calledRight.length > 0 ? (
          <ul className="timeline">
            {calledRight.slice(0, 8).map((c, i) => (
              <li key={i} className="timeline-row">
                <Flag id={c.teamId} size={18} />
                <span className="timeline-team">{team(c.teamId).short}</span>
                <span className="timeline-round">{c.round} — called it</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="board-note">No calls have landed yet. {scored ? "Early days." : "Wait for kick-off."}</p>
        )}
      </div>

      <div className="profile-section">
        <span className="field-label">Settings</span>
        <div className="settings-row" onClick={toggleNotify} role="button" tabIndex={0}>
          <div>
            <strong>Match nudges</strong>
            <small>{notify ? `On — e.g. "${sampleNudge(streak)}"` : "Off — turn on for kick-off reminders. No spam, just banter."}</small>
          </div>
          <span className={`switch${notify ? " is-on" : ""}`} aria-hidden />
        </div>
        <div className="settings-row" onClick={() => store.togglePubNight()} role="button" tabIndex={0}>
          <div>
            <strong>Pub Night Mode</strong>
            <small>{pubNight ? "On — dimmed, calm, big taps for passing the phone." : "Off — flip on when the phone's going round the table."}</small>
          </div>
          <span className={`switch${pubNight ? " is-on" : ""}`} aria-hidden />
        </div>
        <div className="settings-row is-static">
          <div>
            <strong>Watching from</strong>
            <small>Kick-off times shown in your timezone.</small>
          </div>
          <WatchFrom value={profile.watchZone} onChange={(z) => store.setWatchZone(z)} />
        </div>
        <p className="board-note">Theme: dark (the only way to watch football). No account, no email — it's all on this phone.</p>
      </div>
    </div>
  );
}

function groupOf(teamId: string): GroupLetter | null {
  return GROUP_LETTERS.find((l) => GROUPS[l].includes(teamId)) ?? null;
}

/** Compact "your nation" card: flag, group, next-match countdown. */
function NationCard({ teamId }: { teamId: string }) {
  const t = team(teamId);
  const letter = groupOf(teamId);
  const fx = GROUP_FIXTURES.find((f) => f.home === teamId || f.away === teamId);
  const c = useCountdown(fx?.kickoff ?? "2026-06-11T16:00:00Z");
  const oppId = fx ? (fx.home === teamId ? fx.away : fx.home) : null;

  return (
    <div className="your-nation" style={teamVars(t)}>
      <div className="yn-head">
        <span className="yn-flag">{t.flag}</span>
        <div className="yn-id">
          <span className="yn-cap">Your nation</span>
          <strong className="yn-name">{t.name}</strong>
        </div>
        {letter && <span className="yn-group">Group {letter}</span>}
      </div>
      {fx && !c.done && (
        <div className="yn-next">
          <span className="yn-next-label">Next{oppId ? ` v ${team(oppId).short}` : ""} in</span>
          <span className="yn-next-clock">{c.days}d {pad2(c.hours)}h {pad2(c.mins)}m</span>
        </div>
      )}
    </div>
  );
}
