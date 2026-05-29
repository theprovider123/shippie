import { useState } from "react";
import { team } from "../data/teams";
import { GROUP_FIXTURES } from "../data/tournament";
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
          <span className="countdown-label">The World Cup is live</span>
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
          <span>Bracket called</span>
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
          Scores light up when the group stage kicks off. Lock your call now.
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
