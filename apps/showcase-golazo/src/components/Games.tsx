import { useEffect, useState } from "react";
import { KeepyUppy } from "./games/KeepyUppy";
import { TopBins } from "./games/TopBins";
import {
  GAMES,
  gameMeta,
  bestScore,
  mergeBoards,
  challengeUrl,
  type GameId,
  type ScoreEntry,
  type Challenge,
} from "../lib/games";
import { fetchGlobal, submitGlobal, isGlobalEnabled } from "../lib/leaderboard";
import { useStore } from "../state";
import { tap } from "../lib/haptics";

/** Play surface: toggle the two games, post scores, see the worldwide board. */
export function Games({ challenge }: { challenge?: Challenge | null }) {
  const store = useStore();
  const [active, setActive] = useState<GameId>(challenge?.game ?? "keepy");
  const [global, setGlobal] = useState<ScoreEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchGlobal(active).then((g) => { if (!cancelled) setGlobal(g); });
    return () => { cancelled = true; };
  }, [active]);

  const meta = gameMeta(active);
  const best = bestScore(store.scores, active);
  const board = mergeBoards(store.scores, global, active).slice(0, 10);
  const target = challenge && challenge.game === active ? challenge.score : undefined;

  function onGameOver(score: number) {
    if (score <= 0) return; // a duck doesn't make the table
    store.addScore(active, score);
    void submitGlobal({ game: active, name: store.profile?.name || "You", score }).then((g) => {
      if (g.length) setGlobal(g);
    });
  }

  async function shareChallenge() {
    tap();
    const url = challengeUrl({ game: active, name: store.profile?.name || "A mate", score: best });
    const text = `⚽️ I got ${best} ${meta.unit} on ${meta.name} in Golazo. Beat me → ${url}`;
    try {
      if (navigator.share) { await navigator.share({ title: meta.name, text, url }); return; }
    } catch { /* fall through */ }
    try { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* ignore */ }
  }

  return (
    <div className="games">
      <h2 className="section-title">Play</h2>

      <div className="segmented game-toggle" role="tablist">
        {GAMES.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={active === g.id}
            className={active === g.id ? "is-sel" : ""}
            onClick={() => { if (active !== g.id) { tap(); setActive(g.id); } }}
          >
            {g.name}
          </button>
        ))}
      </div>

      {active === "keepy" ? (
        <KeepyUppy key={`k-${target ?? "x"}`} onGameOver={onGameOver} target={target} />
      ) : (
        <TopBins key={`t-${target ?? "x"}`} onGameOver={onGameOver} target={target} />
      )}

      <div className="game-meta-row">
        <span className="game-best">Your best · <strong>{best}</strong> {meta.unit}</span>
        {best > 0 && (
          <button className="ghost-btn sm" onClick={shareChallenge}>
            {copied ? "Copied ✓" : "Challenge a mate"}
          </button>
        )}
      </div>

      <div className="board-head">
        <span className="field-label">{isGlobalEnabled() && global.length ? "🌍 Worldwide" : "Top of the table"}</span>
        {!isGlobalEnabled() && <span className="board-note">Your bests + shared challenges</span>}
      </div>

      {board.length === 0 ? (
        <p className="board-empty">No scores yet — be the first. Tap <strong>Kick off</strong>.</p>
      ) : (
        <ol className="board game-board">
          {board.map((e, i) => (
            <li key={`${e.name}-${e.score}-${i}`} className={`board-row${e.source === "you" ? " is-you" : ""}`}>
              <span className="board-rank">{i + 1}</span>
              <span className="board-name">{e.name}{e.source === "you" ? " (you)" : ""}</span>
              {e.source === "global" && <span className="board-tag">🌍</span>}
              <span className="board-score">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
