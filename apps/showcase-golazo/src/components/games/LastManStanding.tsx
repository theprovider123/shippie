import { useEffect, useMemo, useRef, useState } from "react";
import { GROUP_FIXTURES, type Fixture } from "../../data/tournament";
import { team } from "../../data/teams";
import { formatKickoff } from "../../lib/zones";
import { bestScore, mergeBoards, type ScoreEntry } from "../../lib/games";
import {
  deleteGlobalScores,
  fetchGlobal,
  isGlobalEnabled,
  profileLeaderboardKey,
  submitGlobal,
  subscribeLeaderboardSync,
} from "../../lib/leaderboard";
import {
  evaluateLastMan,
  fixtureDay,
  loadLastManPicks,
  saveLastManPicks,
  upsertLastManPick,
  type LastManPick,
  type LastManRound,
} from "../../lib/lastman";
import { tap } from "../../lib/haptics";
import { useStore } from "../../state";
import { Flag } from "../../ui/atoms";

export function LastManStanding({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const zone = store.profile?.watchZone;
  const [picks, setPicks] = useState<LastManPick[]>(() => loadLastManPicks());
  const [global, setGlobal] = useState<ScoreEntry[]>([]);
  const [syncText, setSyncText] = useState("World board ready");
  const lastSubmittedKey = useRef("");

  const summary = useMemo(
    () => evaluateLastMan(picks, store.feed.live, GROUP_FIXTURES),
    [picks, store.feed.live],
  );
  const localScore = bestScore(store.scores, "lastman");
  const board = mergeBoards(store.scores, global, "lastman").slice(0, 8);
  const current = summary.current;
  const used = new Set(summary.usedTeams);
  const roundLocked = current ? current.startsAt <= Date.now() : false;

  useEffect(() => saveLastManPicks(picks), [picks]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchGlobal("lastman").then((scores) => {
        if (!cancelled) setGlobal(scores);
      });
    };
    load();
    const off = subscribeLeaderboardSync((event) => {
      if (!event.game || event.game === "lastman") load();
    });
    const interval = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      off();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const profile = store.profile;
    if (!profile) return;
    const playerKey = profileLeaderboardKey(profile);
    const pickKey = picks
      .map((pick) => `${pick.day}:${pick.fixtureId}:${pick.teamId}:${pick.at}`)
      .join("|");
    if (!summary.alive || summary.boardScore <= 0) {
      if (localScore > 0) store.clearScore("lastman");
      if (profile.globalLeaderboardOptIn) {
        const syncKey = `${playerKey}:out:${summary.boardScore}:${pickKey}`;
        if (lastSubmittedKey.current !== syncKey) {
          lastSubmittedKey.current = syncKey;
          void deleteGlobalScores(playerKey, "lastman").then(() => setSyncText("Knocked out — removed from world survivors"));
        }
      }
      return;
    }

    if (localScore !== summary.boardScore) store.setScore("lastman", summary.boardScore);
    if (profile.globalLeaderboardOptIn) {
      const syncKey = `${playerKey}:alive:${summary.boardScore}:${pickKey}`;
      if (lastSubmittedKey.current === syncKey) return;
      lastSubmittedKey.current = syncKey;
      setSyncText("Syncing survivors…");
      void submitGlobal({
        game: "lastman",
        name: profile.name,
        playerKey,
        score: summary.boardScore,
        picks,
      }).then((scores) => {
        if (scores.length) setGlobal(scores);
        setSyncText("Live on the world survivors board");
      });
    } else {
      setSyncText("Your run is private until you opt in from You");
    }
  }, [localScore, picks, store, summary.alive, summary.boardScore]);

  function choose(fixture: Fixture, teamId: string) {
    if (!current || fixtureDay(fixture) !== current.key || roundLocked || !summary.alive) return;
    const currentPick = current.pick?.teamId;
    if (used.has(teamId) && currentPick !== teamId) return;
    tap();
    setPicks((existing) => upsertLastManPick(existing, {
      day: current.key,
      fixtureId: fixture.id,
      teamId,
      at: Date.now(),
    }));
  }

  return (
    <div className="lastman games">
      <button className="back-btn" onClick={() => { tap(); onBack(); }}>← Games</button>
      <header className={`lastman-hero${summary.alive ? "" : " is-out"}`}>
        <span className="lastman-kicker">World survivors</span>
        <h2>Last Man Standing</h2>
        <p>Pick one winner each matchday. Use a nation once. Draw or defeat and you are gone.</p>
        <div className="lastman-stats">
          <span><strong>{summary.survived}</strong> survived</span>
          <span><strong>{summary.usedTeams.length}</strong> used</span>
          <span><strong>{board.length}</strong> world</span>
        </div>
      </header>

      {!summary.alive ? (
        <section className="lastman-status is-out">
          <strong>You are out</strong>
          <span>{summary.eliminatedAt ? `Run ended on ${summary.eliminatedAt}.` : "The deadline went without a pick."}</span>
        </section>
      ) : current ? (
        <CurrentRound
          round={current}
          used={used}
          locked={roundLocked}
          zone={zone}
          onPick={choose}
        />
      ) : (
        <section className="lastman-status">
          <strong>Still standing</strong>
          <span>You made it through every listed matchday.</span>
        </section>
      )}

      <section className="lastman-history">
        <span className="field-label">Your run</span>
        {summary.rounds.filter((round) => round.pick || round.status === "missed" || round.status === "out").length === 0 ? (
          <p className="board-note">No pick yet. First pick puts you on your private board; opt in from You to join the world board.</p>
        ) : (
          <ol className="lastman-picks">
            {summary.rounds
              .filter((round) => round.pick || round.status === "missed" || round.status === "out")
              .slice(0, 8)
              .map((round) => <PickRow key={round.key} round={round} />)}
          </ol>
        )}
      </section>

      <section className="lastman-world">
        <div className="board-head">
          <span className="field-label">🌍 World survivors</span>
          <span className="board-note">{isGlobalEnabled() ? syncText : "World board offline"}</span>
        </div>
        {board.length === 0 ? (
          <p className="board-empty">No survivors listed yet.</p>
        ) : (
          <ol className="board game-board">
            {board.map((entry, index) => (
              <li key={`${entry.playerKey ?? entry.name}-${entry.score}-${index}`} className={`board-row${entry.source === "you" ? " is-you" : ""}`}>
                <span className="board-rank">{index + 1}</span>
                <span className="board-name">{entry.name}{entry.source === "you" ? " (you)" : ""}</span>
                {entry.source === "global" && <span className="board-tag">🌍</span>}
                <span className="board-score">{entry.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function CurrentRound({
  round,
  used,
  locked,
  zone,
  onPick,
}: {
  round: LastManRound;
  used: Set<string>;
  locked: boolean;
  zone?: string;
  onPick: (fixture: Fixture, teamId: string) => void;
}) {
  const day = formatKickoff(round.fixtures[0].kickoff, zone).day;
  return (
    <section className={`lastman-current${round.status === "pending" ? " is-pending" : ""}`}>
      <div className="lastman-round-head">
        <span className="field-label">Matchday {round.index + 1}</span>
        <span className="lastman-lock">{locked ? "Locked" : round.status === "pending" ? "Pick made" : "Open"}</span>
      </div>
      <h3>{day}</h3>
      <p>{round.status === "pending" ? "Waiting on the final whistle." : "Pick one winner before the first kick-off. Reused nations are locked."}</p>
      <div className="lastman-fixtures">
        {round.fixtures.map((fixture) => (
          <FixturePick
            key={fixture.id}
            fixture={fixture}
            pick={round.pick}
            used={used}
            locked={locked}
            zone={zone}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}

function FixturePick({
  fixture,
  pick,
  used,
  locked,
  zone,
  onPick,
}: {
  fixture: Fixture;
  pick?: LastManPick;
  used: Set<string>;
  locked: boolean;
  zone?: string;
  onPick: (fixture: Fixture, teamId: string) => void;
}) {
  const k = formatKickoff(fixture.kickoff, zone);
  return (
    <div className="lastman-fixture">
      <span className="lastman-time">{k.time}</span>
      {[fixture.home, fixture.away].map((teamId) => {
        const selected = pick?.fixtureId === fixture.id && pick.teamId === teamId;
        const unavailable = used.has(teamId) && !selected;
        const t = team(teamId);
        return (
          <button
            key={teamId}
            className={`lastman-team${selected ? " is-picked" : ""}`}
            disabled={locked || unavailable}
            onClick={() => onPick(fixture, teamId)}
          >
            <Flag id={teamId} size={22} />
            <span>{t.short}</span>
            {unavailable && <small>used</small>}
          </button>
        );
      })}
    </div>
  );
}

function PickRow({ round }: { round: LastManRound }) {
  const picked = round.pick?.teamId ? team(round.pick.teamId) : null;
  const status = round.status === "survived" ? "Alive" : round.status === "pending" ? "Pending" : round.status === "missed" ? "Missed" : "Out";
  return (
    <li className={`lastman-pick-row status-${round.status}`}>
      <span className="lastman-pick-round">{round.index + 1}</span>
      <span className="lastman-pick-team">{picked ? <><Flag id={picked.id} size={18} /> {picked.short}</> : "No pick"}</span>
      <span className="lastman-pick-status">{status}</span>
    </li>
  );
}
