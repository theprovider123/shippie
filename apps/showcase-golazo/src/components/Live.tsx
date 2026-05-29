import { useEffect, useMemo, useRef, useState } from "react";
import { GROUP_FIXTURES, type Fixture } from "../data/tournament";
import { team } from "../data/teams";
import { liveBus, type LiveEvent } from "../lib/realtime";
import { useStore } from "../state";
import { Flag } from "../ui/atoms";
import { tap } from "../lib/haptics";

const EMOJI = ["⚽", "🔥", "😱", "🙌", "💔", "🎉"];

interface Float {
  id: number;
  emoji: string;
}

export function Live() {
  const { profile } = useStore();
  const uid = profile?.uid ?? "me";
  const name = profile?.name ?? "You";

  const upcoming = useMemo(() => GROUP_FIXTURES.slice(0, 12), []);
  const [active, setActive] = useState<Fixture>(upcoming[0]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [present, setPresent] = useState<Record<string, number>>({});
  const seq = useRef(0);

  // Subscribe to the live bus + announce presence with a heartbeat.
  useEffect(() => {
    const bus = liveBus();
    const off = bus.subscribe((e: LiveEvent) => {
      if (e.kind === "reaction") {
        seq.current += 1;
        const id = seq.current;
        setFloats((f) => [...f, { id, emoji: e.emoji }]);
        window.setTimeout(
          () => setFloats((f) => f.filter((x) => x.id !== id)),
          2600,
        );
      } else if (e.kind === "presence") {
        setPresent((p) => ({ ...p, [e.uid]: e.at }));
      }
    });
    const beat = () =>
      bus.publish({ kind: "presence", uid, name, at: Date.now() });
    beat();
    const hb = window.setInterval(beat, 5000);
    const prune = window.setInterval(() => {
      const cutoff = Date.now() - 13_000;
      setPresent((p) => {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(p)) if (v >= cutoff) next[k] = v;
        return next;
      });
    }, 4000);
    return () => {
      off();
      window.clearInterval(hb);
      window.clearInterval(prune);
    };
  }, [uid, name]);

  function react(emoji: string) {
    tap();
    liveBus().publish({
      kind: "reaction",
      matchId: active.id,
      emoji,
      uid,
      at: Date.now(),
    });
  }

  const watching = Math.max(1, Object.keys(present).length);

  return (
    <div className="live">
      <div className="section-head">
        <div>
          <h2 className="section-title">Match day</h2>
          <p className="section-hint">React live with everyone in the room.</p>
        </div>
        <span className="presence">
          <i className="presence-dot" />
          {watching} watching
        </span>
      </div>

      <div className="fixture-rail">
        {upcoming.map((f) => (
          <button
            key={f.id}
            className={`fixture-chip ${f.id === active.id ? "is-sel" : ""}`}
            onClick={() => { tap(); setActive(f); }}
          >
            <span className="fixture-chip-grp">Group {f.group}</span>
            <span className="fixture-chip-teams">
              <Flag id={f.home} size={20} />
              <span>v</span>
              <Flag id={f.away} size={20} />
            </span>
            <span className="fixture-chip-time">{fmtShort(f.kickoff)}</span>
          </button>
        ))}
      </div>

      <div className="live-stage">
        <div className="live-floats" aria-hidden>
          {floats.map((f) => (
            <span
              key={f.id}
              className="live-float"
              style={{ left: `${10 + ((f.id * 37) % 80)}%` }}
            >
              {f.emoji}
            </span>
          ))}
        </div>

        <div className="live-match">
          <Side id={active.home} />
          <div className="live-match-mid">
            <span className="live-kick">{fmtLong(active.kickoff)}</span>
            <span className="live-vs">VS</span>
            <span className="live-grp">Group {active.group} · MD{active.round}</span>
          </div>
          <Side id={active.away} />
        </div>

        <div className="react-bar">
          {EMOJI.map((e) => (
            <button key={e} className="react-btn" onClick={() => react(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <p className="live-note">
        Reactions sync instantly to every Golazo open on this device — and
        across the room when you're all on the same screen. No server, no login.
      </p>
    </div>
  );
}

function Side({ id }: { id: string }) {
  const t = team(id);
  return (
    <div className="live-side">
      <span className="live-flag">{t.flag}</span>
      <span className="live-team">{t.short}</span>
    </div>
  );
}

function fmtShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function fmtLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
