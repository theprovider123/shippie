import { useEffect, useMemo, useRef, useState } from "react";
import { GROUP_FIXTURES, type Fixture } from "../data/tournament";
import { venueFor } from "../data/venues";
import { channelFor } from "../data/broadcasters";
import { team } from "../data/teams";
import { liveBus, type LiveEvent } from "../lib/realtime";
import type { LiveScore } from "../lib/feed";
import { formatKickoff } from "../lib/zones";
import { useStore } from "../state";
import { Flag } from "../ui/atoms";
import { tap } from "../lib/haptics";

const EMOJI = ["⚽", "🔥", "😱", "🙌", "💔", "🎉"];

interface Float {
  id: number;
  emoji: string;
}

export function Live() {
  const { profile, feed, online, feedSync, refreshFeed } = useStore();
  const uid = profile?.uid ?? "me";
  const name = profile?.name ?? "You";
  const zone = profile?.watchZone;

  const liveById = useMemo(() => {
    const m: Record<string, LiveScore> = {};
    for (const s of feed.live) m[s.matchId] = s;
    return m;
  }, [feed.live]);

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
  const k = formatKickoff(active.kickoff, zone);
  const activeScore = liveById[active.id];
  const venue = venueFor(active.id);
  const channel = channelFor(active.id, zone);
  const feedLabel = feedSync.refreshing
    ? "Checking"
    : feed.updatedAt
      ? formatFeedStamp(feed.updatedAt, zone)
      : online
        ? "Checked"
        : "Offline";

  return (
    <div className="live">
      <div className="section-head">
        <div>
          <h2 className="section-title">Match Week</h2>
          <p className="section-hint">React live with everyone in the room.</p>
        </div>
        <div className="live-tools">
          <span className="presence">
            <i className="presence-dot" />
            {watching} watching
          </span>
          <span className={`feed-status${online ? " is-online" : ""}`} title={feedSync.message}>
            {feedLabel}
          </span>
          <button
            className="score-refresh"
            aria-label="Refresh scores"
            title="Refresh scores"
            disabled={feedSync.refreshing}
            onClick={() => {
              tap();
              void refreshFeed();
            }}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="fixture-rail">
        {upcoming.map((f) => {
          const fk = formatKickoff(f.kickoff, zone);
          const fs = liveById[f.id];
          const isLive = fs && fs.status !== "upcoming";
          return (
            <button
              key={f.id}
              className={`fixture-chip ${f.id === active.id ? "is-sel" : ""} ${isLive ? "is-live" : ""}`}
              onClick={() => { tap(); setActive(f); }}
            >
              <span className="fixture-chip-grp">
                {fs?.status === "live" ? "● LIVE" : `Group ${f.group}`}
              </span>
              <span className="fixture-chip-teams">
                <Flag id={f.home} size={20} />
                <span>{isLive ? `${fs!.homeGoals}-${fs!.awayGoals}` : "v"}</span>
                <Flag id={f.away} size={20} />
              </span>
              <span className="fixture-chip-time">
                {isLive
                  ? fs!.status === "live"
                    ? fs!.minute ?? "live"
                    : "full time"
                : `${fk.day} · ${fk.time} ${fk.zoneName}`}
              </span>
            </button>
          );
        })}
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
            {activeScore && activeScore.status !== "upcoming" ? (
              <>
                <span className="live-score">
                  {activeScore.homeGoals}<i>-</i>{activeScore.awayGoals}
                </span>
                <span className={`live-status ${activeScore.status}`}>
                  {activeScore.status === "live"
                    ? activeScore.minute ?? "LIVE"
                    : "FT"}
                </span>
              </>
            ) : (
              <>
                <span className="live-kick">{k.day}</span>
                <span className="live-time">{k.time} {k.zoneName}</span>
                <span className="live-rel">{k.rel}</span>
              </>
            )}
          </div>
          <Side id={active.away} />
        </div>
        <div className="live-meta">
          Group {active.group} · Matchday {active.round} ·{" "}
          {activeScore && activeScore.status !== "upcoming"
            ? "live score from the tournament feed"
            : "kick-off in your local time"}
        </div>
        <div className="live-where">
          <span className="live-where-item" title={`Broadcast in ${channel.regionLabel}`}>
            <span aria-hidden>📺</span> {channel.name}
          </span>
          <span className="live-where-dot" aria-hidden>·</span>
          <span className="live-where-item">
            <span aria-hidden>🏟</span> {venue.stadium}, {venue.city}
          </span>
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
        Scores check on launch, hourly while open, and when you tap refresh.
        Your calls, groups, draws, and bests stay on this phone.
      </p>
    </div>
  );
}

function formatFeedStamp(iso: string, zone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Checked";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone && zone !== "auto" ? zone : undefined,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
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
