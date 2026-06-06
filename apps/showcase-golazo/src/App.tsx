import { useEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding";
import { Profile } from "./components/Profile";
import { GroupStage } from "./components/GroupStage";
import { BracketView } from "./components/BracketView";
import { Pools } from "./components/Pools";
import { Games } from "./components/Games";
import { DevPanel } from "./components/DevPanel";
import { Live } from "./components/Live";
import { IncomingShare } from "./components/IncomingShare";
import { IncomingSweep } from "./components/IncomingSweep";
import { BottomNav, type Tab } from "./components/BottomNav";
import { readShareFromHash, readSweepFromHash, type SharePayload } from "./lib/codec";
import type { Sweep } from "./lib/sweeps";
import { readChallengeFromHash, type Challenge } from "./lib/games";
import { readDuelFromHash, type Duel } from "./lib/duel";
import { readManagerFromHash } from "./lib/manager";
import { TOURNAMENT_KICKOFF } from "./lib/locktimer";
import { useCountdown, pad2 } from "./ui/atoms";
import { useStore } from "./state";

export function App() {
  const { profile, pubNight } = useStore();
  const [tab, setTab] = useState<Tab>(() => {
    // Games-first: Play is the default home of the app.
    return "play";
  });
  const [incoming, setIncoming] = useState<SharePayload | null>(() =>
    typeof location !== "undefined" ? readShareFromHash(location.hash) : null,
  );
  const [incomingSweep, setIncomingSweep] = useState<Sweep | null>(() =>
    typeof location !== "undefined" ? readSweepFromHash(location.hash) : null,
  );
  const [challenge, setChallenge] = useState<Challenge | null>(() =>
    typeof location !== "undefined" ? readChallengeFromHash(location.hash) : null,
  );
  const [duel, setDuel] = useState<Duel | null>(() =>
    typeof location !== "undefined" ? readDuelFromHash(location.hash) : null,
  );
  const [manager, setManager] = useState<string[] | null>(() =>
    typeof location !== "undefined" ? readManagerFromHash(location.hash) : null,
  );
  const [demo, setDemo] = useState(() =>
    typeof location !== "undefined" ? /[#&]demo/.test(location.hash) : false,
  );

  // Capture shared brackets + sweepstake draws from the URL hash — directly
  // (standalone /run) and via the container's posted parent hash (embedded).
  useEffect(() => {
    const ingest = (hash: string) => {
      const p = readShareFromHash(hash);
      if (p) setIncoming(p);
      const s = readSweepFromHash(hash);
      if (s) setIncomingSweep(s);
      const c = readChallengeFromHash(hash);
      if (c) { setChallenge(c); setTab("play"); }
      const dl = readDuelFromHash(hash);
      if (dl) { setDuel(dl); setTab("play"); }
      const mg = readManagerFromHash(hash);
      if (mg) { setManager(mg); setTab("play"); }
      if (/[#&]demo/.test(hash)) setDemo(true);
    };
    const fromHash = () => ingest(location.hash);
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d && typeof d === "object" && d.kind === "shippie.parent-hash") {
        ingest(String(d.hash ?? ""));
      }
    };
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("message", onMsg);
    };
  }, []);

  function clearHash() {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch {
      /* ignore */
    }
  }
  function dismissIncoming() {
    setIncoming(null);
    clearHash();
  }
  function dismissSweep() {
    setIncomingSweep(null);
    clearHash();
  }

  return (
    <div className={`app${pubNight ? " pub-night" : ""}`}>
      {profile ? (
        <>
          <main className="screen">
            {tab === "home" && (
              <>
                <Profile />
                <Live />
              </>
            )}
            {tab === "predict" && <PredictScreen />}
            {tab === "pools" && <Pools />}
            {tab === "play" && <Games challenge={challenge} duel={duel} managerTeam={manager} />}
          </main>
          <BottomNav active={tab} onChange={setTab} />
        </>
      ) : (
        <Onboarding onComplete={(nextTab) => setTab(nextTab ?? "predict")} />
      )}

      {incoming && (
        <IncomingShare payload={incoming} onClose={dismissIncoming} />
      )}
      {!incoming && incomingSweep && profile && (
        <IncomingSweep sweep={incomingSweep} onClose={dismissSweep} />
      )}
      {demo && profile && <DevPanel onClose={() => setDemo(false)} />}
    </div>
  );
}

function PredictScreen() {
  const { prediction } = useStore();
  const groupsDone = Object.values(prediction.groups).filter(
    (g) => g && g.length >= 4,
  ).length;
  const [phase, setPhase] = useState<"groups" | "knockout">(() =>
    groupsDone >= 12 ? "knockout" : "groups",
  );
  const lock = useCountdown(TOURNAMENT_KICKOFF);
  const lockText = lock.done
    ? null
    : lock.days > 0
      ? `${lock.days}d ${lock.hours}h ${lock.mins}m`
      : lock.hours > 0
        ? `${lock.hours}h ${lock.mins}m`
        : `${lock.mins}m ${pad2(lock.secs)}s`;

  return (
    <div className="predict">
      <div className={`lock-banner ${lock.done ? "is-locked" : ""}`}>
        {lock.done ? (
          <span>🔒 Tips are in — your call is locked.</span>
        ) : (
          <span>⏳ Tips lock in <strong>{lockText}</strong> · {groupsDone}/12 groups tipped</span>
        )}
      </div>
      <div className="segmented" role="tablist">
        <button
          role="tab"
          aria-selected={phase === "groups"}
          className={phase === "groups" ? "is-sel" : ""}
          onClick={() => setPhase("groups")}
        >
          The Groups
        </button>
        <button
          role="tab"
          aria-selected={phase === "knockout"}
          className={phase === "knockout" ? "is-sel" : ""}
          onClick={() => setPhase("knockout")}
        >
          The Knockouts
        </button>
      </div>

      {phase === "groups" ? (
        <GroupStage onAllDone={() => setPhase("knockout")} />
      ) : (
        <BracketView />
      )}
    </div>
  );
}
