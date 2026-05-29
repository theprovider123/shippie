// Small shared presentational atoms + hooks. Kept tiny and dependency-free.
import { useEffect, useRef, useState } from "react";
import { maybeTeam, type Team } from "../data/teams";

/** A team flag with a graceful TBD fallback. */
export function Flag({
  id,
  size = 28,
  className,
}: {
  id?: string | null;
  size?: number;
  className?: string;
}) {
  const t = maybeTeam(id);
  return (
    <span
      className={`flag ${className ?? ""}`}
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden={!t}
    >
      {t ? t.flag : "·"}
    </span>
  );
}

/** Flag + short code, the workhorse team token. */
export function TeamToken({
  id,
  size = 22,
  showName = true,
}: {
  id?: string | null;
  size?: number;
  showName?: boolean;
}) {
  const t = maybeTeam(id);
  return (
    <span className="team-token">
      <Flag id={id} size={size} />
      {showName && <span className="team-token-name">{t ? t.short : "TBD"}</span>}
    </span>
  );
}

/** Inline style carrying a team's two brand colours as CSS vars. */
export function teamVars(t: Team | null | undefined): React.CSSProperties {
  if (!t) return {};
  return {
    ["--tc1" as string]: t.colors[0],
    ["--tc2" as string]: t.colors[1],
  };
}

/** A live countdown to a target ISO timestamp. Returns null once past. */
export function useCountdown(targetIso: string): {
  days: number;
  hours: number;
  mins: number;
  secs: number;
  done: boolean;
} {
  const target = useRef(new Date(targetIso).getTime());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const diff = Math.max(0, target.current - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return { days, hours, mins, secs, done: diff === 0 };
}

/** Two-digit pad for scoreboard numerals. */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Lightweight, CSS-driven confetti burst (auto-removes). */
export function Confetti({ fire }: { fire: number }) {
  const [bursts, setBursts] = useState<number[]>([]);
  useEffect(() => {
    if (fire <= 0) return;
    setBursts((b) => [...b, fire]);
    const id = window.setTimeout(
      () => setBursts((b) => b.filter((x) => x !== fire)),
      1400,
    );
    return () => window.clearTimeout(id);
  }, [fire]);
  if (bursts.length === 0) return null;
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 36 }).map((_, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{
            left: `${(i * 53) % 100}%`,
            animationDelay: `${(i % 6) * 40}ms`,
            ["--h" as string]: `${(i * 47) % 360}`,
          }}
        />
      ))}
    </div>
  );
}
