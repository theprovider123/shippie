import { useEffect, useState } from "react";
import { KeepyUppy } from "./games/KeepyUppy";
import { TopBins } from "./games/TopBins";
import { SpotKick } from "./games/SpotKick";
import { PenaltyRoulette } from "./games/PenaltyRoulette";
import { WhoAreYa } from "./games/WhoAreYa";
import { GuessNation } from "./games/GuessNation";
import { GroupOfDeath } from "./games/GroupOfDeath";
import { LastManStanding } from "./games/LastManStanding";
import { CardHappy } from "./games/CardHappy";
import { ThatsNeverAPen } from "./games/ThatsNeverAPen";
import { BeatTheClock } from "./games/BeatTheClock";
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
import {
  fetchGlobal,
  submitGlobal,
  isGlobalEnabled,
  profileLeaderboardKey,
  subscribeLeaderboardSync,
} from "../lib/leaderboard";
import { gameCardBlob } from "../lib/sharecard";
import { useStore } from "../state";
import { tap } from "../lib/haptics";

type Sel =
  | GameId
  | "penalty"
  | "roulette"
  | "trivia"
  | "nation"
  | "cardhappy"
  | "tnap"
  | "beatclock"
  | null;
type PubId = "roulette" | "trivia" | "nation" | "cardhappy" | "tnap" | "beatclock";
const PUB: { id: PubId; emoji: string; name: string; how: string }[] = [
  { id: "trivia", emoji: "🧠", name: "Who Are Ya?", how: "World Cup trivia, no Googling" },
  { id: "beatclock", emoji: "⏱️", name: "Beat the Clock", how: "As many as you can in 30 seconds" },
  { id: "nation", emoji: "🌍", name: "Guess the Nation", how: "See the flag, name the country" },
  { id: "roulette", emoji: "🎯", name: "Penalty Roulette", how: "Pass the phone — get saved, you're out" },
  { id: "cardhappy", emoji: "🟨", name: "Card Happy", how: "Yellow or red? Best ref in the room wins" },
  { id: "tnap", emoji: "🤌", name: "That's Never A Pen", how: "Vote pen or no pen, then argue about it" },
];

/** Play surface: pick a game, post scores, see the worldwide board. */
export function Games({ challenge, duel }: { challenge?: Challenge | null; duel?: Duel | null }) {
  const store = useStore();
  const playerName = store.profile?.name || "You";
  const [sel, setSel] = useState<Sel>(
    duel ? "penalty" : challenge ? challenge.game : null,
  );
  const [global, setGlobal] = useState<ScoreEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [diff, setDiff] = useState<"casual" | "pro">("casual");
  const [boardGame, setBoardGame] = useState<GameId | null>(null);

  const soloGame: GameId | null = sel === "keepy" || sel === "topbins" || sel === "freekick" || sel === "god" ? sel as GameId : null;

  useEffect(() => {
    if (!soloGame) return;
    let cancelled = false;
    const load = () => {
      void fetchGlobal(soloGame).then((g) => { if (!cancelled) setGlobal(g); });
    };
    load();
    const off = subscribeLeaderboardSync((event) => {
      if (!event.game || event.game === soloGame) load();
    });
    const interval = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      off();
      window.clearInterval(interval);
    };
  }, [soloGame]);

  function onGameOver(score: number) {
    if (!soloGame || score <= 0) return;
    store.addScore(soloGame, score);
    if (store.profile?.globalLeaderboardOptIn) {
      void submitGlobal({
        game: soloGame,
        name: playerName,
        playerKey: profileLeaderboardKey(store.profile),
        score,
      }).then((g) => { if (g.length) setGlobal(g); });
    }
  }

  async function shareChallenge() {
    if (!soloGame) return;
    tap();
    const meta = gameMeta(soloGame);
    const best = bestScore(store.scores, soloGame);
    const url = challengeUrl({ game: soloGame, name: playerName, score: best });
    const text = `⚽️ I got ${best} ${meta.unit} on ${meta.name} in Golazo. Beat me → ${url}`;
    const emoji = soloGame === "keepy" ? "⚽️" : soloGame === "topbins" ? "🥅" : soloGame === "god" ? "💀" : "⚽";
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
        <p className="games-intro">Quick footy games. No login — your bests live on this phone, challenge a mate by link.</p>

        <div className="god-hero-wrap">
          <button className="god-hero" onClick={() => { tap(); setSel("god"); }}>
            <span className="god-hero-tag">Daily test · worldwide</span>
            <span className="god-hero-name">Group of Death</span>
            <span className="god-hero-how">Flap through the gaps, pick the right answer at every gate. Knowledge + nerve.</span>
            <span className="god-hero-foot">
              <span className="god-hero-best">Best {bestScore(store.scores, "god")} caps</span>
              <span className="god-hero-cta">Play →</span>
            </span>
          </button>
          <button className="game-board-btn" aria-label="Group of Death world leaderboard" onClick={() => { tap(); setBoardGame("god"); }}>🏆</button>
        </div>

        <span className="field-label" style={{ marginTop: 22 }}>⚽️ Solo &amp; head-to-head</span>
        <div className="game-grid">
          {GAMES.filter((g) => g.id !== "god" && g.id !== "lastman").map((g) => (
            <div key={g.id} className="game-card-wrap">
              <button className="game-card" onClick={() => { tap(); setSel(g.id); }}>
                <span className="game-card-emoji">{g.id === "keepy" ? "⚽️" : g.id === "topbins" ? "🥅" : g.id === "freekick" ? "⚽" : "🎮"}</span>
                <span className="game-card-name">{g.name}</span>
                <span className="game-card-how">{g.how}</span>
                <span className="game-card-best">Best {bestScore(store.scores, g.id)}</span>
              </button>
              <button className="game-board-btn" aria-label={`${g.name} world leaderboard`} onClick={() => { tap(); setBoardGame(g.id); }}>🏆</button>
            </div>
          ))}
          <div className="game-card-wrap survival-card-wrap">
            <button className="game-card survival" onClick={() => { tap(); setSel("lastman"); }}>
              <span className="game-card-emoji">🧍</span>
              <span className="game-card-name">Last Man Standing</span>
              <span className="game-card-how">Pick one winner each matchday. Draw or defeat and you're out</span>
              <span className="game-card-best">{bestScore(store.scores, "lastman") ? `${bestScore(store.scores, "lastman")} days alive` : "World survivors"}</span>
            </button>
            <button className="game-board-btn" aria-label="Last Man Standing world leaderboard" onClick={() => { tap(); setBoardGame("lastman"); }}>🏆</button>
          </div>
        </div>

        <span className="field-label" style={{ marginTop: 22 }}>🍺 Pub games — trivia &amp; pass the phone</span>
        <div className="game-grid">
          {PUB.map((g) => (
            <button key={g.id} className="game-card pub" onClick={() => { tap(); setSel(g.id); }}>
              <span className="game-card-emoji">{g.emoji}</span>
              <span className="game-card-name">{g.name}</span>
              <span className="game-card-how">{g.how}</span>
            </button>
          ))}
        </div>

        {boardGame && <LeaderboardSheet game={boardGame} onClose={() => setBoardGame(null)} />}
      </div>
    );
  }

  // ── Pub games (full-screen, local, no leaderboard) ──
  if (sel === "roulette" || sel === "trivia" || sel === "nation" || sel === "cardhappy" || sel === "tnap" || sel === "beatclock") {
    return (
      <div className="games">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
        {sel === "roulette" && <PenaltyRoulette />}
        {sel === "cardhappy" && <CardHappy />}
        {sel === "tnap" && <ThatsNeverAPen />}
        {sel === "trivia" && <WhoAreYa />}
        {sel === "beatclock" && <BeatTheClock />}
        {sel === "nation" && <GuessNation />}
      </div>
    );
  }

  // ── Tournament survival game + global survivors board ──
  if (sel === "lastman") {
    return <LastManStanding onBack={() => setSel(null)} />;
  }

  // ── Duel link: open Spot Kick directly in penalty mode ──
  if (sel === "penalty") {
    return (
      <div className="games">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
        <SpotKick duel={duel} playerName={playerName} onGameOver={() => {}} difficulty={0.3} />
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
      {soloGame === "freekick" && <SpotKick key={`f-${diff}-${target ?? "x"}`} onGameOver={onGameOver} target={target} difficulty={diffValue} playerName={playerName} />}
      {soloGame === "god" && <GroupOfDeath key={`g-${target ?? "x"}`} onGameOver={onGameOver} target={target} playerName={playerName} />}

      <div className="game-meta-row">
        <span className="game-best">Your best · <strong>{best}</strong> {meta.unit}</span>
        {best > 0 && <button className="ghost-btn sm" onClick={shareChallenge}>{copied ? "Copied ✓" : "Challenge a mate"}</button>}
      </div>

      <div className="board-head">
        <span className="field-label">{isGlobalEnabled() && global.length ? "🌍 Worldwide" : "Top of the table"}</span>
        <span className="board-note">
          {store.profile?.globalLeaderboardOptIn
            ? "Your opted-in bests sync live"
            : "Your scores stay local unless you opt in from You"}
        </span>
      </div>

      {board.length === 0 ? (
        <p className="board-empty">No scores yet — put one up and you're top of the world.</p>
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

/** A peek at the worldwide board for a single game — opened from its 🏆 icon. */
function LeaderboardSheet({ game, onClose }: { game: GameId; onClose: () => void }) {
  const store = useStore();
  const [global, setGlobal] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchGlobal(game).then((g) => { if (!cancelled) { setGlobal(g); setLoading(false); } });
    };
    load();
    const off = subscribeLeaderboardSync((event) => {
      if (!event.game || event.game === game) load();
    });
    const interval = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      off();
      window.clearInterval(interval);
    };
  }, [game]);
  const meta = gameMeta(game);
  const board = mergeBoards(store.scores, global, game).slice(0, 12);
  return (
    <div className="lb-backdrop" onClick={onClose}>
      <div className="lb-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lb-head">
          <span className="field-label" style={{ margin: 0 }}>{meta.name} · 🌍 Worldwide</span>
          <button className="lb-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {!isGlobalEnabled() && (
          <p className="board-note">The world board lights up when you're online. Your bests + shared challenges for now.</p>
        )}
        {isGlobalEnabled() && !store.profile?.globalLeaderboardOptIn && (
          <p className="board-note">You can view the world board. Your own scores stay private until you opt in from You.</p>
        )}
        {loading ? (
          <p className="board-note">Loading the world…</p>
        ) : board.length === 0 ? (
          <p className="board-note">No scores yet — be the first to put one up.</p>
        ) : (
          <ol className="board game-board">
            {board.map((e, i) => (
              <li key={`${e.name}-${e.score}-${i}`} className={`board-row${e.source === "you" ? " is-you" : ""}`}>
                <span className="board-rank">{i + 1}</span>
                <span className="board-name">{e.name}{e.source === "you" ? " (you)" : ""}</span>
                {e.source === "global" && <span className="board-tag">🌍</span>}
                <span className="board-score">{e.score} {meta.unit}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
