import { useState } from "react";
import { team } from "../data/teams";
import { GROUP_FIXTURES, GROUPS, GROUP_LETTERS, type GroupLetter, type Fixture } from "../data/tournament";
import { championOf, completion, resolveBracket } from "../lib/bracket";
import { hasResults, scorePrediction } from "../lib/scoring";
import { formatKickoff } from "../lib/zones";
import { useStore } from "../state";
import { Flag, pad2, teamVars, useCountdown } from "../ui/atoms";
import { ShareSheet } from "./ShareSheet";
import { WatchFrom } from "./WatchFrom";
import { News } from "./News";

const KICKOFF = "2026-06-11T16:00:00Z";

export function MyCall({ onContinue }: { onContinue: () => void }) {
  const { profile, prediction, results, setWatchZone, feed, online } = useStore();
  const [share, setShare] = useState(false);
  const c = useCountdown(KICKOFF);

  if (!profile) return null;
  const now = Date.now();
  const nextFixture =
    GROUP_FIXTURES.find((f) => new Date(f.kickoff).getTime() > now) ??
    GROUP_FIXTURES[0];
  const nk = formatKickoff(nextFixture.kickoff, profile.watchZone);
  const champId = championOf(prediction);
  const champ = champId ? team(champId) : null;
  const pct = Math.round(completion(prediction) * 100);
  const { participants } = resolveBracket(prediction.groups, prediction.knockout);
  const [fa, fb] = participants["F-0"] ?? [null, null];
  const scored = hasResults(results);
  const score = scored ? scorePrediction(prediction, results) : null;

  return (
    <div className="home" style={champ ? teamVars(champ) : undefined}>
      <header className="home-head">
        <div>
          <p className="home-greet">Your call</p>
          <h1 className="home-name">{profile.name}</h1>
        </div>
        {profile.favTeam && (
          <span className="home-fav" style={teamVars(team(profile.favTeam))}>
            <Flag id={profile.favTeam} size={26} />
          </span>
        )}
      </header>

      {profile.favTeam && <YourNation teamId={profile.favTeam} />}

      <div className="watch-row">
        <WatchFrom value={profile.watchZone} onChange={(z) => setWatchZone(z)} />
      </div>

      {!c.done ? (
        <div className="countdown">
          <span className="countdown-label">Kick-off in</span>
          <div className="countdown-clock">
            <Unit n={c.days} l="days" />
            <Unit n={c.hours} l="hrs" />
            <Unit n={c.mins} l="min" />
            <Unit n={c.secs} l="sec" />
          </div>
        </div>
      ) : (
        <div className="countdown live">
          <span className="countdown-label">It's tournament time</span>
        </div>
      )}

      <div className="next-match">
        <span className="next-match-label">Next match</span>
        <span className="next-match-teams">
          <Flag id={nextFixture.home} size={20} />
          {team(nextFixture.home).short}
          <i>v</i>
          {team(nextFixture.away).short}
          <Flag id={nextFixture.away} size={20} />
        </span>
        <span className="next-match-when">
          {nk.day} · {nk.time}
        </span>
      </div>

      <News items={feed.news} online={online} />

      {champ ? (
        <button
          className="champ-hero"
          style={teamVars(champ)}
          onClick={() => setShare(true)}
        >
          <span className="champ-hero-glow" aria-hidden />
          <span className="champ-hero-label">I'm calling the champion</span>
          <span className="champ-hero-flag">{champ.flag}</span>
          <span className="champ-hero-name">{champ.name}</span>
          <span className="champ-hero-cta">Tap to share your card →</span>
        </button>
      ) : (
        <button className="champ-empty" onClick={onContinue}>
          <span className="champ-empty-cup" aria-hidden>🏆</span>
          <span className="champ-empty-title">No champion yet</span>
          <span className="champ-empty-sub">Make your call to crown one →</span>
        </button>
      )}

      {(fa || fb) && (
        <div className="final-strip">
          <span className="final-strip-label">My final</span>
          <div className="final-strip-teams">
            <FinalSide id={fa} />
            <span className="final-strip-v">v</span>
            <FinalSide id={fb} />
          </div>
        </div>
      )}

      <div className="progress-card">
        <div className="progress-top">
          <span>Your call</span>
          <strong>{pct}%</strong>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <button className="ghost-btn wide" onClick={onContinue}>
          {pct < 100 ? "Continue your call" : "Review your call"}
        </button>
      </div>

      {score ? (
        <div className="score-card">
          <div className="score-big">
            <strong>{score.total}</strong>
            <span>pts</span>
          </div>
          <p className="score-sub">
            {score.correctCalls} correct knockout call
            {score.correctCalls === 1 ? "" : "s"} so far.
          </p>
        </div>
      ) : (
        <p className="score-pending">
          Make your calls, then settle it with your mates.
        </p>
      )}

      <button
        className="cta"
        onClick={() => setShare(true)}
        disabled={!champ && pct === 0}
      >
        Share my call
      </button>

      {share && (
        <ShareSheet
          profile={profile}
          prediction={prediction}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

function groupOf(teamId: string): GroupLetter | null {
  return GROUP_LETTERS.find((l) => GROUPS[l].includes(teamId)) ?? null;
}
function firstFixtureFor(teamId: string): Fixture | undefined {
  return GROUP_FIXTURES.find((f) => f.home === teamId || f.away === teamId);
}
function isGroupOfDeath(letter: GroupLetter): boolean {
  // Two or more genuinely strong (top-seeded) nations drawn together.
  return GROUPS[letter].filter((id) => team(id).seed <= 14).length >= 2;
}

/** Make it *your* World Cup: your nation's group, opponents, and first kick-off. */
function YourNation({ teamId }: { teamId: string }) {
  const t = team(teamId);
  const letter = groupOf(teamId);
  const fx = firstFixtureFor(teamId);
  const c = useCountdown(fx?.kickoff ?? "2026-06-11T16:00:00Z");
  const opp = letter ? GROUPS[letter].filter((id) => id !== teamId) : [];
  const death = letter ? isGroupOfDeath(letter) : false;
  const oppId = fx ? (fx.home === teamId ? fx.away : fx.home) : null;

  return (
    <div className="your-nation" style={teamVars(t)}>
      <div className="yn-head">
        <span className="yn-flag">{t.flag}</span>
        <div className="yn-id">
          <span className="yn-cap">Your nation</span>
          <strong className="yn-name">{t.name}</strong>
        </div>
        {letter && (
          <span className="yn-group">
            Group {letter}
            {death && <em className="yn-death">Group of death</em>}
          </span>
        )}
      </div>

      {fx && !c.done && (
        <div className="yn-next">
          <span className="yn-next-label">Your first match{oppId ? ` v ${team(oppId).short}` : ""} in</span>
          <span className="yn-next-clock">{c.days}d {pad2(c.hours)}h {pad2(c.mins)}m</span>
        </div>
      )}

      {opp.length > 0 && (
        <div className="yn-opp">
          {opp.map((id) => (
            <span key={id} className="yn-opp-team" style={teamVars(team(id))}>
              <Flag id={id} size={16} /> {team(id).short}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Unit({ n, l }: { n: number; l: string }) {
  return (
    <div className="cu">
      <span className="cu-n">{pad2(n)}</span>
      <span className="cu-l">{l}</span>
    </div>
  );
}

function FinalSide({ id }: { id: string | null }) {
  const t = id ? team(id) : null;
  return (
    <span className="final-side" style={t ? teamVars(t) : undefined}>
      <Flag id={id} size={30} />
      <span>{t ? t.short : "TBD"}</span>
    </span>
  );
}
