import { useEffect, useState } from "react";
import { KeepyUppy } from "./games/KeepyUppy";
import { PenaltyDuel } from "./games/PenaltyDuel";
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
  | "trivia"
  | "nation"
  | "cardhappy"
  | "tnap"
  | "beatclock"
  | null;
type PubId = "trivia" | "nation" | "cardhappy" | "tnap" | "beatclock";
const PUB: { id: PubId; emoji: string; name: string; how: string }[] = [
  { id: "trivia", emoji: "🧠", name: "Who Are Ya?", how: "World Cup trivia, no Googling" },
  { id: "beatclock", emoji: "⏱️", name: "Beat the Clock", how: "As many as you can in 30 seconds" },
  { id: "nation", emoji: "🌍", name: "Guess the Nation", how: "See the flag, name the country" },
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
  const [boardGame, setBoardGame] = useState<GameId | null>(null);

  const soloGame: GameId | null = sel === "penalty" || sel === "keepy" || sel === "god" ? sel : null;

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
    const emoji = soloGame === "penalty" ? "🥅" : soloGame === "keepy" ? "⚽️" : soloGame === "god" ? "💀" : "⚽";
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
        <p className="games-intro">Penalty Kick is the main event now: a mobile-first top-ten country ladder with persistent bests, world boards, and offline-safe scores.</p>

        <div className="penalty-hero-wrap">
          <button className="penalty-hero" onClick={() => { tap(); setSel("penalty"); }}>
            <span className="penalty-hero-tag">Top-ten ladder</span>
            <span className="penalty-hero-name">Penalty Kick</span>
            <span className="penalty-hero-how">Beat ten ranked countries. Swipe fast, bend it round the keeper, and survive seven shots per flag.</span>
            <span className="penalty-hero-scene" aria-hidden>
              <span className="penalty-hero-net" />
              <span className="penalty-hero-keeper" />
              <span className="penalty-hero-ball" />
            </span>
            <span className="penalty-hero-foot">
              <span>Best {bestScore(store.scores, "penalty")} goals · 10 countries · 7 shots</span>
              <span className="penalty-hero-cta">Swipe to kick →</span>
            </span>
          </button>
          <button className="game-board-btn" aria-label="Penalty Kick world leaderboard" onClick={() => { tap(); setBoardGame("penalty"); }}>🏆</button>
        </div>

        <span className="field-label" style={{ marginTop: 22 }}>🏆 Matchday challenges</span>
        <div className="game-list matchday-list">
          {GAMES.filter((g) => g.id === "god" || g.id === "lastman" || g.id === "keepy").map((g) => (
            <div key={g.id} className={`game-card-wrap${g.id === "lastman" ? " survival-card-wrap" : ""}`}>
              <button className={`game-card game-row${g.id === "lastman" ? " survival" : ""}`} onClick={() => { tap(); setSel(g.id); }}>
                <span className="game-row-icon">{g.id === "god" ? "💀" : g.id === "lastman" ? "🧍" : "⚽️"}</span>
                <span className="game-row-copy">
                  <span className="game-card-name">{g.name}</span>
                  <span className="game-card-how">{g.how}</span>
                </span>
                <span className="game-card-best">{g.id === "lastman" && !bestScore(store.scores, "lastman") ? "World survivors" : `Best ${bestScore(store.scores, g.id)} ${gameMeta(g.id).unit}`}</span>
                <span className="game-row-arrow" aria-hidden>→</span>
              </button>
              <button className="game-board-btn" aria-label={`${g.name} world leaderboard`} onClick={() => { tap(); setBoardGame(g.id); }}>🏆</button>
            </div>
          ))}
        </div>

        <span className="field-label" style={{ marginTop: 22 }}>🧠 Trivia &amp; pub calls</span>
        <div className="game-list trivia-list">
          {PUB.map((g) => (
            <button key={g.id} className="game-card game-row pub" onClick={() => { tap(); setSel(g.id); }}>
              <span className="game-row-icon">{g.emoji}</span>
              <span className="game-row-copy">
                <span className="game-card-name">{g.name}</span>
                <span className="game-card-how">{g.how}</span>
              </span>
              <span className="game-row-arrow" aria-hidden>→</span>
            </button>
          ))}
        </div>

        {boardGame && <LeaderboardSheet game={boardGame} onClose={() => setBoardGame(null)} />}
      </div>
    );
  }

  // ── Pub games (full-screen, local, no leaderboard) ──
  if (sel === "trivia" || sel === "nation" || sel === "cardhappy" || sel === "tnap" || sel === "beatclock") {
    return (
      <div className="games">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
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

  // ── Penalty ladder + duel links ──
  if (sel === "penalty") {
    return (
      <div className="games">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
        <PenaltyDuel duel={duel} playerName={playerName} onGameOver={onGameOver} />
      </div>
    );
  }

  // ── Solo game + leaderboard ──
  const meta = gameMeta(soloGame!);
  const best = bestScore(store.scores, soloGame!);
  const board = mergeBoards(store.scores, global, soloGame!).slice(0, 10);
  const target = challenge && challenge.game === soloGame ? challenge.score : undefined;

  return (
    <div className="games">
      <div className="game-top">
        <button className="back-btn" onClick={() => { tap(); setSel(null); }}>← Games</button>
      </div>
      {soloGame === "keepy" && <KeepyUppy key={`k-${target ?? "x"}`} onGameOver={onGameOver} target={target} />}
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
