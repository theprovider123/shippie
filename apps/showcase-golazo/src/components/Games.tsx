import { useEffect, useState } from "react";
import { KeepyUppy } from "./games/KeepyUppy";
import { TopBins } from "./games/TopBins";
import { FreeKick } from "./games/FreeKick";
import { PenaltyDuel } from "./games/PenaltyDuel";
import { PenaltyRoulette } from "./games/PenaltyRoulette";
import { WhoAreYa } from "./games/WhoAreYa";
import { GuessNation } from "./games/GuessNation";
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
import type { Duel } from "../lib/duel";
import { fetchGlobal, submitGlobal, isGlobalEnabled } from "../lib/leaderboard";
import { gameCardBlob } from "../lib/sharecard";
import { useStore } from "../state";
import { tap } from "../lib/haptics";

type Sel = GameId | "penalty" | "roulette" | "trivia" | "nation" | null;
const PUB: { id: "roulette" | "trivia" | "nation"; emoji: string; name: string; how: string }[] = [
  { id: "roulette", emoji: "🎯", name: "Penalty Roulette", how: "Pass the phone — get saved, you're out" },
  { id: "trivia", emoji: "🧠", name: "Who Are Ya?", how: "World Cup trivia, no Googling" },
  { id: "nation", emoji: "🌍", name: "Guess the Nation", how: "See the flag, name the country" },
];

/** Play surface: pick a game, post scores, see the worldwide board. */
export function Games({ challenge, duel }: { challenge?: Challenge | null; duel?: Duel | null }) {
  const store = useStore();
  const playerName = store.profile?.name || "You";
  const [sel, setSel] = useState<Sel>(duel ? "penalty" : challenge ? challenge.game : null);
  const [global, setGlobal] = useState<ScoreEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [diff, setDiff] = useState<"casual" | "pro">("casual");

  const soloGame: GameId | null = sel === "keepy" || sel === "topbins" || sel === "freekick" ? sel : null;

  useEffect(() => {
    if (!soloGame) return;
    let cancelled = false;
    void fetchGlobal(soloGame).then((g) => { if (!cancelled) setGlobal(g); });
    return () => { cancelled = true; };
  }, [soloGame]);

  function onGameOver(score: number) {
    if (!soloGame || score <= 0) return;
    store.addScore(soloGame, score);
    void submitGlobal({ game: soloGame, name: playerName, score }).then((g) => { if (g.length) setGlobal(g); });
  }

  async function shareChallenge() {
    if (!soloGame) return;
    tap();
    const meta = gameMeta(soloGame);
    const best = bestScore(store.scores, soloGame);
    const url = challengeUrl({ game: soloGame, name: playerName, score: best });
    const text = `⚽️ I got ${best} ${meta.unit} on ${meta.name} in Golazo. Beat me → ${url}`;
    const emoji = soloGame === "keepy" ? "⚽️" : soloGame === "topbins" ? "🥅" : "🧱";
    // Share the viral card image + link first; fall back to text/copy.
    try {
      const blob = await gameCardBlob({ emoji, game: meta.name, score: best, unit: meta.unit, playerName });
      if (blob) {
        const file = new File([blob], "golazo.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: meta.name, text, url }); return; }
      }
    } catch { /* fall through */ }
    try { if (navigator.share) { await navigator.share({ title: meta.name, text, url }); return; } } catch { /* */ }
    try { await navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* */ }
  }

  // ── Game select ──
  if (!sel) {
    return (
      <div className="games">
        <h2 className="section-title">Play</h2>
        <p className="games-intro">Quick football games. No login — your bests live on this phone, challenge a mate by link.</p>
        <div className="game-grid">
          {GAMES.map((g) => (
            <button key={g.id} className="game-card" onClick={() => { tap(); setSel(g.id); }}>
              <span className="game-card-emoji">{g.id === "keepy" ? "⚽️" : g.id === "topbins" ? "🥅" : "🧱"}</span>
              <span className="game-card-name">{g.name}</span>
              <span className="game-card-how">{g.how}</span>
              <span className="game-card-best">Best {bestScore(store.scores, g.id)}</span>
            </button>
          ))}
          <button className="game-card vs" onClick={() => { tap(); setSel("penalty"); }}>
            <span className="game-card-emoji">🥅</span>
            <span className="game-card-name">Penalty Duel <em className="h2h">H2H</em></span>
            <span className="game-card-how">You're keeper AND striker — duel a mate by link</span>
            <span className="game-card-best">You vs a mate</span>
          </button>
        </div>

        <span className="field-label" style={{ marginTop: 20 }}>🍺 Pub games — pass the phone</span>
        <div className="game-grid">
          {PUB.map((g) => (
            <button key={g.id} className="game-card pub" onClick={() => { tap(); setSel(g.id); }}>
              <span className="game-card-emoji">{g.emoji}</span>
              <span className="game-card-name">{g.name}</span>
              <span className="game-card-how">{g.how}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Pub games (full-screen, local, no leaderboard) ──
  if (sel === "roulette" || sel === "trivia" || sel === "nation") {
    return (
      <div className="games">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
        {sel === "roulette" && <PenaltyRoulette />}
        {sel === "trivia" && <WhoAreYa />}
        {sel === "nation" && <GuessNation />}
      </div>
    );
  }

  // ── Penalty (head-to-head) ──
  if (sel === "penalty") {
    return (
      <div className="games">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
        <PenaltyDuel duel={duel} playerName={playerName} />
      </div>
    );
  }

  // ── Solo game + leaderboard ──
  const meta = gameMeta(soloGame!);
  const best = bestScore(store.scores, soloGame!);
  const board = mergeBoards(store.scores, global, soloGame!).slice(0, 10);
  const target = challenge && challenge.game === soloGame ? challenge.score : undefined;

  const diffValue = diff === "pro" ? 0.7 : 0.3;
  const hasKeeper = soloGame === "topbins" || soloGame === "freekick";

  return (
    <div className="games">
      <div className="game-top">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
        {hasKeeper && (
          <div className="diff-toggle" role="tablist" aria-label="Difficulty">
            {(["casual", "pro"] as const).map((d) => (
              <button key={d} role="tab" aria-selected={diff === d} className={diff === d ? "is-sel" : ""} onClick={() => { tap(); setDiff(d); }}>
                {d === "casual" ? "Casual" : "Pro"}
              </button>
            ))}
          </div>
        )}
      </div>
      {soloGame === "keepy" && <KeepyUppy key={`k-${target ?? "x"}`} onGameOver={onGameOver} target={target} />}
      {soloGame === "topbins" && <TopBins key={`t-${diff}-${target ?? "x"}`} onGameOver={onGameOver} target={target} difficulty={diffValue} />}
      {soloGame === "freekick" && <FreeKick key={`f-${diff}-${target ?? "x"}`} onGameOver={onGameOver} target={target} difficulty={diffValue} />}

      <div className="game-meta-row">
        <span className="game-best">Your best · <strong>{best}</strong> {meta.unit}</span>
        {best > 0 && <button className="ghost-btn sm" onClick={shareChallenge}>{copied ? "Copied ✓" : "Challenge a mate"}</button>}
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
