import { useEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding";
import { MyCall } from "./components/MyCall";
import { GroupStage } from "./components/GroupStage";
import { BracketView } from "./components/BracketView";
import { Pools } from "./components/Pools";
import { Live } from "./components/Live";
import { IncomingShare } from "./components/IncomingShare";
import { IncomingSweep } from "./components/IncomingSweep";
import { BottomNav, type Tab } from "./components/BottomNav";
import { readShareFromHash, readSweepFromHash, type SharePayload } from "./lib/codec";
import type { Sweep } from "./lib/sweeps";
import { completion } from "./lib/bracket";
import { useStore } from "./state";

export function App() {
  const { profile, prediction } = useStore();
  const [tab, setTab] = useState<Tab>(() =>
    completion(prediction) > 0 ? "home" : "predict",
  );
  const [incoming, setIncoming] = useState<SharePayload | null>(() =>
    typeof location !== "undefined" ? readShareFromHash(location.hash) : null,
  );
  const [incomingSweep, setIncomingSweep] = useState<Sweep | null>(() =>
    typeof location !== "undefined" ? readSweepFromHash(location.hash) : null,
  );

  // Capture shared brackets + sweepstake draws from the URL hash — directly
  // (standalone /run) and via the container's posted parent hash (embedded).
  useEffect(() => {
    const ingest = (hash: string) => {
      const p = readShareFromHash(hash);
      if (p) setIncoming(p);
      const s = readSweepFromHash(hash);
      if (s) setIncomingSweep(s);
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
    <div className="app">
      {profile ? (
        <>
          <main className="screen">
            {tab === "home" && <MyCall onContinue={() => setTab("predict")} />}
            {tab === "predict" && <PredictScreen />}
            {tab === "pools" && <Pools />}
            {tab === "live" && <Live />}
          </main>
          <BottomNav active={tab} onChange={setTab} />
        </>
      ) : (
        <Onboarding />
      )}

      {incoming && (
        <IncomingShare payload={incoming} onClose={dismissIncoming} />
      )}
      {!incoming && incomingSweep && profile && (
        <IncomingSweep sweep={incomingSweep} onClose={dismissSweep} />
      )}
    </div>
  );
}

function PredictScreen() {
  const { prediction } = useStore();
  const [phase, setPhase] = useState<"groups" | "knockout">(() => {
    const groupsDone = Object.values(prediction.groups).filter(
      (g) => g && g.length >= 4,
    ).length;
    return groupsDone >= 12 ? "knockout" : "groups";
  });

  return (
    <div className="predict">
      <div className="segmented" role="tablist">
        <button
          role="tab"
          aria-selected={phase === "groups"}
          className={phase === "groups" ? "is-sel" : ""}
          onClick={() => setPhase("groups")}
        >
          Groups
        </button>
        <button
          role="tab"
          aria-selected={phase === "knockout"}
          className={phase === "knockout" ? "is-sel" : ""}
          onClick={() => setPhase("knockout")}
        >
          Knockout
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
