import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GroupLetter } from "./data/tournament";
import type { Pool, PoolEntry, Prediction, Profile, Results } from "./lib/types";
import { prunePicks } from "./lib/bracket";
import * as store from "./lib/storage";
import type { SharePayload } from "./lib/codec";

interface Store {
  profile: Profile | null;
  prediction: Prediction;
  pools: Pool[];
  results: Results;

  setProfile: (name: string, favTeam?: string) => void;
  setGroupOrder: (letter: GroupLetter, ids: string[]) => void;
  pickWinner: (slotId: string, teamId: string) => void;
  setTopScorer: (teamId: string | undefined) => void;
  resetPrediction: () => void;

  createPool: (name: string) => Pool;
  joinPool: (code: string, name?: string) => Pool;
  addEntryToPool: (code: string, payload: SharePayload) => void;
  removePool: (code: string) => void;

  setGroupResult: (letter: GroupLetter, ids: string[]) => void;
  setKnockoutResult: (slotId: string, teamId: string) => void;
  clearResults: () => void;
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

  useEffect(() => store.savePrediction(prediction), [prediction]);
  useEffect(() => store.savePools(pools), [pools]);
  useEffect(() => store.saveResults(results), [results]);

  const value = useMemo<Store>(() => {
    return {
      profile,
      prediction,
      pools,
      results,

      setProfile(name, favTeam) {
        const next: Profile =
          profile != null
            ? { ...profile, name: name.trim(), favTeam }
            : { name: name.trim(), favTeam, uid: uid() };
        setProfileState(next);
        store.saveProfile(next);
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
    };
  }, [profile, prediction, pools, results]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
