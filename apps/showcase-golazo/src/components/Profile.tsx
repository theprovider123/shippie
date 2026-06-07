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
import { formatKickoff } from "../lib/zones";
import {
  deleteGlobalScores,
  isGlobalEnabled,
  profileLeaderboardKey,
  syncGlobalScores,
} from "../lib/leaderboard";
import { useStore } from "../state";
import { Flag, pad2, teamVars, useCountdown } from "../ui/atoms";
import { WatchFrom } from "./WatchFrom";
import { Live } from "./Live";

const NOTIFY_KEY = "golazo:notify";

/** The "You" tab: who you are, your nation, your streak, your stats + settings.
 *  No account — everything lives on this phone. */
export function Profile() {
  const store = useStore();
  const { profile, prediction, results, scores, reactions, streak } = store;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [globalSync, setGlobalSync] = useState("Not listed globally");
  const [notify, setNotify] = useState<boolean>(() => {
    try { return localStorage.getItem(NOTIFY_KEY) === "1"; } catch { return false; }
  });

  if (!profile) return null;
  const activeProfile = profile;

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
    if (clean) {
      const oldKey = profileLeaderboardKey(activeProfile);
      const wasGlobal = !!activeProfile.globalLeaderboardOptIn;
      store.setProfile(clean, activeProfile.favTeam);
      if (wasGlobal && oldKey !== profileLeaderboardKey({ ...activeProfile, name: clean })) {
        setGlobalSync("Updating leaderboard key...");
        void deleteGlobalScores(oldKey)
          .then(() => syncGlobalScores({ ...activeProfile, name: clean }, scores, true))
          .then(({ published }) => {
            setGlobalSync(published > 0 ? `Synced ${published} best${published === 1 ? "" : "s"}` : "Opted in. Next score syncs.");
          })
          .catch(() => setGlobalSync("Key update queued. Try toggling sync again if it looks stale."));
      }
    }
    setEditing(false);
  }
  function toggleNotify() {
    const next = !notify;
    setNotify(next);
    try { localStorage.setItem(NOTIFY_KEY, next ? "1" : "0"); } catch { /* */ }
  }

  function toggleGlobalLeaderboard() {
    const next = !activeProfile.globalLeaderboardOptIn;
    store.setGlobalLeaderboardOptIn(next);
    if (!isGlobalEnabled()) {
      setGlobalSync("World board unavailable");
      return;
    }
    setGlobalSync(next ? "Syncing bests..." : "Removing from world boards...");
    void syncGlobalScores({ ...activeProfile, globalLeaderboardOptIn: next }, scores, next)
      .then(({ published, removed }) => {
        if (removed) {
          setGlobalSync("Removed from world boards");
          return;
        }
        setGlobalSync(published > 0 ? `Synced ${published} best${published === 1 ? "" : "s"}` : "Opted in. Next score syncs.");
      })
      .catch(() => setGlobalSync("Could not reach world board"));
  }

  return (
    <div className="home profile" style={activeProfile.favTeam ? teamVars(team(activeProfile.favTeam)) : undefined}>
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
            <h1 className="home-name" onClick={() => { setName(activeProfile.name); setEditing(true); }}>
              {activeProfile.name} <span className="edit-hint">✎</span>
            </h1>
          )}
        </div>
        {activeProfile.favTeam && (
          <span className="home-fav" style={teamVars(team(activeProfile.favTeam))}>
            <Flag id={activeProfile.favTeam} size={26} />
          </span>
        )}
      </header>

      <Live />

      <section className="profile-section score-sync-panel">
        <span className="field-label">Score publishing</span>
        <label className="settings-row settings-check">
          <div>
            <strong>Global leaderboard</strong>
            <small>
              {activeProfile.globalLeaderboardOptIn
                ? `${globalSync} · key ${profileLeaderboardKey(activeProfile)}`
                : `Off by default · key ${profileLeaderboardKey(activeProfile)}`}
            </small>
          </div>
          <input
            id="golazo-global-leaderboard"
            name="golazo-global-leaderboard"
            type="checkbox"
            checked={!!activeProfile.globalLeaderboardOptIn}
            onChange={toggleGlobalLeaderboard}
          />
          <span className={`switch${activeProfile.globalLeaderboardOptIn ? " is-on" : ""}`} aria-hidden />
        </label>
      </section>

      {activeProfile.favTeam && <NationCard teamId={activeProfile.favTeam} zone={activeProfile.watchZone} />}

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
        <div className="settings-row is-static">
          <div>
            <strong>Watching from</strong>
            <small>Kick-off times shown in your timezone.</small>
          </div>
          <WatchFrom value={activeProfile.watchZone} onChange={(z) => store.setWatchZone(z)} />
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
function NationCard({ teamId, zone }: { teamId: string; zone?: string }) {
  const t = team(teamId);
  const letter = groupOf(teamId);
  const fx = GROUP_FIXTURES.find((f) => f.home === teamId || f.away === teamId);
  const c = useCountdown(fx?.kickoff ?? "2026-06-11T16:00:00Z");
  const oppId = fx ? (fx.home === teamId ? fx.away : fx.home) : null;
  const k = fx ? formatKickoff(fx.kickoff, zone) : null;

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
      {fx && !c.done && k && (
        <div className="yn-next">
          <span className="yn-next-label">
            Next{oppId ? ` v ${team(oppId).short}` : ""} · {k.day} {k.time}
          </span>
          <span className="yn-next-clock">{c.days}d {pad2(c.hours)}h {pad2(c.mins)}m</span>
        </div>
      )}
    </div>
  );
}
