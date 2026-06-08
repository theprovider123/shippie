import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GroupLetter } from "./data/tournament";
import type { Pool, PoolEntry, Prediction, Profile, Results } from "./lib/types";
import { prunePicks } from "./lib/bracket";
import * as store from "./lib/storage";
import type { SharePayload } from "./lib/codec";
import { makeSeed, type Sweep, type SweepMode, type SweepScope } from "./lib/sweeps";
import { addLocalScore, bestScore, type GameId, type ScoreEntry } from "./lib/games";
import { addReaction, type ReactionKind, type ReactionStore } from "./lib/reactions";
import { bumpStreak, dayKey } from "./lib/streak";
import { simulateTournament } from "./lib/sim";
import {
  deleteGlobalScores,
  profileLeaderboardKey,
  submitGlobal,
  syncLastManFromLiveScores,
} from "./lib/leaderboard";
import { evaluateLastMan, loadLastManPicks } from "./lib/lastman";

export interface SweepOpts {
  mode?: SweepMode;
  scope?: SweepScope;
  stake?: number;
  currency?: string;
}
import { emptyFeed, fetchFeed, feedHasResults, type Feed } from "./lib/feed";

interface Store {
  profile: Profile | null;
  prediction: Prediction;
  pools: Pool[];
  results: Results;
  sweeps: Sweep[];
  /** Tournament feed: news ticker + live scores. */
  feed: Feed;
  /** Whether the last feed fetch reached the network. */
  online: boolean;

  setProfile: (name: string, favTeam?: string) => void;
  setWatchZone: (zone: string | undefined) => void;
  setGlobalLeaderboardOptIn: (enabled: boolean) => void;
  importFeed: (feed: Feed) => void;
  setGroupOrder: (letter: GroupLetter, ids: string[]) => void;
  pickWinner: (slotId: string, teamId: string) => void;
  setTopScorer: (teamId: string | undefined) => void;
  setOutsideBet: (teamId: string | undefined) => void;
  resetPrediction: () => void;

  createPool: (name: string) => Pool;
  joinPool: (code: string, name?: string) => Pool;
  addEntryToPool: (code: string, payload: SharePayload) => void;
  renamePool: (code: string, name: string) => void;
  removePool: (code: string) => void;

  setGroupResult: (letter: GroupLetter, ids: string[]) => void;
  setKnockoutResult: (slotId: string, teamId: string) => void;
  clearResults: () => void;
  simulateResults: () => void;

  createSweep: (name: string, members: string[], opts?: SweepOpts) => Sweep;
  importSweep: (sweep: Sweep) => Sweep;
  removeSweep: (id: string) => void;

  scores: ScoreEntry[];
  addScore: (game: GameId, score: number) => ScoreEntry;
  setScore: (game: GameId, score: number) => ScoreEntry;
  clearScore: (game: GameId) => void;

  /** Days-in-a-row you've opened the app. */
  streak: number;

  /** Reactions you've sent to mates' rows (🔥📞💀), keyed by their uid. */
  reactions: ReactionStore;
  react: (uid: string, kind: ReactionKind) => void;

}

const Ctx = createContext<Store | null>(null);

function uid(): string {
  return store.makeCode(4) + store.makeCode(4);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(() =>
    store.loadProfile(),
  );
  const [prediction, setPrediction] = useState<Prediction>(() =>
    store.loadPrediction(),
  );
  const [pools, setPools] = useState<Pool[]>(() => store.loadPools());
  const [results, setResults] = useState<Results>(() => store.loadResults());
  const [sweeps, setSweeps] = useState<Sweep[]>(() => store.loadSweeps());
  const [scores, setScores] = useState<ScoreEntry[]>(() => store.loadScores());
  const [reactions, setReactions] = useState<ReactionStore>(() => store.loadReactions());
  const [streak, setStreak] = useState<number>(() => store.loadStreak()?.days ?? 0);
  const [feed, setFeed] = useState<Feed>(() => emptyFeed());
  const [online, setOnline] = useState(false);
  const lastManSyncKey = useRef("");

  // Bump the tip streak once per launch (consecutive-day aware).
  useEffect(() => {
    const next = bumpStreak(store.loadStreak(), dayKey(Date.now()));
    store.saveStreak(next);
    setStreak(next.days);
  }, []);

  useEffect(() => store.savePrediction(prediction), [prediction]);
  useEffect(() => store.savePools(pools), [pools]);
  useEffect(() => store.saveResults(results), [results]);
  useEffect(() => store.saveSweeps(sweeps), [sweeps]);
  useEffect(() => store.saveScores(scores), [scores]);
  useEffect(() => store.saveReactions(reactions), [reactions]);

  // Pull the tournament feed once on launch. Official results (when present)
  // flow into `results`, lighting up live scoring + pool leaderboards.
  useEffect(() => {
    let cancelled = false;
    void fetchFeed().then(({ feed: f, online: on }) => {
      if (cancelled) return;
      setFeed(f);
      setOnline(on);
      if (feedHasResults(f)) setResults(f.results);
      if (f.live.length > 0) void syncLastManFromLiveScores(f.live);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Last Man Standing must keep its world survivors row honest even when the
  // user is not looking at the game screen: official feed updates can knock a
  // player out and should remove them from the global board without UI drama.
  useEffect(() => {
    if (!profile) return;
    const playerKey = profileLeaderboardKey(profile);
    const lastManPicks = loadLastManPicks();
    const pickKey = lastManPicks
      .map((pick) => `${pick.day}:${pick.fixtureId}:${pick.teamId}:${pick.at}`)
      .join("|");
    const summary = evaluateLastMan(lastManPicks, feed.live);
    const localScore = bestScore(scores, "lastman");
    const keepPersonalRows = (entry: ScoreEntry) => {
      setScores((ss) => addLocalScore(
        ss.filter((s) => s.game !== "lastman" || s.playerKey !== entry.playerKey),
        entry,
      ));
    };
    const clearPersonalRows = () => {
      setScores((ss) => ss.filter((s) => s.game !== "lastman" || s.playerKey !== playerKey));
    };

    if (summary.alive && summary.boardScore > 0) {
      if (localScore !== summary.boardScore) {
        keepPersonalRows({
          game: "lastman",
          name: profile.name,
          playerKey,
          score: summary.boardScore,
          at: Date.now(),
          source: "you",
        });
      }
      const syncKey = `${playerKey}:alive:${summary.boardScore}:${pickKey}:${!!profile.globalLeaderboardOptIn}`;
      if (profile.globalLeaderboardOptIn && lastManSyncKey.current !== syncKey) {
        lastManSyncKey.current = syncKey;
        void submitGlobal({
          game: "lastman",
          name: profile.name,
          playerKey,
          score: summary.boardScore,
          picks: lastManPicks,
        });
      }
      return;
    }

    if (localScore > 0) clearPersonalRows();
    const syncKey = `${playerKey}:out:${summary.eliminatedAt ?? "none"}:${!!profile.globalLeaderboardOptIn}`;
    if (profile.globalLeaderboardOptIn && lastManSyncKey.current !== syncKey) {
      lastManSyncKey.current = syncKey;
      void deleteGlobalScores(playerKey, "lastman");
    }
  }, [feed.live, profile, scores]);

  const value = useMemo<Store>(() => {
    return {
      profile,
      prediction,
      pools,
      results,
      sweeps,
      feed,
      online,

      setProfile(name, favTeam) {
        const next: Profile =
          profile != null
            ? { ...profile, name: name.trim(), favTeam }
            : { name: name.trim(), favTeam, uid: uid(), globalLeaderboardOptIn: false };
        setProfileState(next);
        store.saveProfile(next);
      },

      setWatchZone(zone) {
        if (!profile) return;
        const next: Profile = { ...profile, watchZone: zone };
        setProfileState(next);
        store.saveProfile(next);
      },

      setGlobalLeaderboardOptIn(enabled) {
        if (!profile) return;
        const next: Profile = { ...profile, globalLeaderboardOptIn: enabled };
        setProfileState(next);
        store.saveProfile(next);
      },

      importFeed(nextFeed) {
        setFeed(nextFeed);
        setOnline(true);
        if (feedHasResults(nextFeed)) setResults(nextFeed.results);
        if (nextFeed.live.length > 0) void syncLastManFromLiveScores(nextFeed.live);
      },

      setGroupOrder(letter, ids) {
        setPrediction((p) => {
          const groups = { ...p.groups, [letter]: ids };
          const knockout = prunePicks(groups, p.knockout);
          return { ...p, groups, knockout };
        });
      },

      pickWinner(slotId, teamId) {
        setPrediction((p) => {
          const knockout = prunePicks(p.groups, {
            ...p.knockout,
            [slotId]: teamId,
          });
          return { ...p, knockout };
        });
      },

      setTopScorer(teamId) {
        setPrediction((p) => ({ ...p, topScorer: teamId }));
      },

      setOutsideBet(teamId) {
        setPrediction((p) => ({ ...p, outsideBet: teamId }));
      },

      resetPrediction() {
        const fresh = store.emptyPrediction();
        setPrediction(fresh);
      },

      createPool(name) {
        const pool: Pool = {
          code: store.makeCode(5),
          name: name.trim() || "My Pool",
          createdAt: Date.now(),
          entries: [],
        };
        setPools((ps) => [pool, ...ps]);
        return pool;
      },

      joinPool(code, name) {
        const norm = code.trim().toUpperCase();
        const existing = pools.find((p) => p.code === norm);
        if (existing) return existing;
        const pool: Pool = {
          code: norm,
          name: name?.trim() || `Pool ${norm}`,
          createdAt: Date.now(),
          entries: [],
        };
        setPools((ps) => [pool, ...ps]);
        return pool;
      },

      addEntryToPool(code, payload) {
        setPools((ps) =>
          ps.map((pool) => {
            if (pool.code !== code) return pool;
            const entry: PoolEntry = {
              uid: payload.uid,
              name: payload.name,
              favTeam: payload.favTeam,
              prediction: payload.prediction,
              importedAt: Date.now(),
            };
            const entries = [
              ...pool.entries.filter((e) => e.uid !== entry.uid),
              entry,
            ];
            return { ...pool, entries };
          }),
        );
      },

      renamePool(code, name) {
        const clean = name.trim();
        if (!clean) return;
        setPools((ps) =>
          ps.map((p) => (p.code === code ? { ...p, name: clean } : p)),
        );
      },

      removePool(code) {
        setPools((ps) => ps.filter((p) => p.code !== code));
      },

      setGroupResult(letter, ids) {
        setResults((r) => ({
          ...r,
          groups: { ...r.groups, [letter]: ids },
        }));
      },

      setKnockoutResult(slotId, teamId) {
        setResults((r) => ({
          ...r,
          knockout: { ...r.knockout, [slotId]: teamId },
        }));
      },

      clearResults() {
        setResults({ groups: {}, knockout: {} });
      },

      simulateResults() {
        setResults(simulateTournament());
      },

      createSweep(name, members, opts) {
        const sweep: Sweep = {
          id: uid(),
          name: name.trim() || "Sweepstake",
          seed: makeSeed(),
          members: members.map((m) => m.trim()).filter(Boolean),
          createdAt: Date.now(),
          mode: opts?.mode ?? "classic",
          scope: opts?.scope ?? "all48",
          stake: opts?.stake,
          currency: opts?.currency,
        };
        setSweeps((ss) => [sweep, ...ss]);
        return sweep;
      },

      importSweep(sweep) {
        setSweeps((ss) => {
          const without = ss.filter((s) => s.seed !== sweep.seed);
          return [sweep, ...without];
        });
        return sweep;
      },

      removeSweep(id) {
        setSweeps((ss) => ss.filter((s) => s.id !== id));
      },

      scores,
      addScore(game, score) {
        const entry: ScoreEntry = {
          game,
          name: profile?.name?.trim() || "You",
          playerKey: profile ? profileLeaderboardKey(profile) : undefined,
          score: Math.max(0, Math.floor(score)),
          at: Date.now(),
          source: "you",
        };
        setScores((ss) => addLocalScore(ss, entry));
        return entry;
      },

      setScore(game, score) {
        const playerKey = profile ? profileLeaderboardKey(profile) : undefined;
        const entry: ScoreEntry = {
          game,
          name: profile?.name?.trim() || "You",
          playerKey,
          score: Math.max(0, Math.floor(score)),
          at: Date.now(),
          source: "you",
        };
        setScores((ss) => addLocalScore(
          ss.filter((s) => {
            if (s.game !== game) return true;
            if (!playerKey) return false;
            return s.playerKey !== playerKey;
          }),
          entry,
        ));
        return entry;
      },

      clearScore(game) {
        const playerKey = profile ? profileLeaderboardKey(profile) : undefined;
        setScores((ss) => ss.filter((s) => {
          if (s.game !== game) return true;
          if (!playerKey) return false;
          return s.playerKey !== playerKey;
        }));
      },

      reactions,
      react(uid, kind) {
        setReactions((r) => addReaction(r, uid, kind, Date.now()));
      },

      streak,
    };
  }, [profile, prediction, pools, results, sweeps, scores, reactions, streak, feed, online]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
