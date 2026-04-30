import { useMemo, useState } from 'react';
import type { Memory } from '@/features/memories/memories-state.ts';
import type { Trip } from '@/lib/schedule.ts';
import { formatDateShort } from '@/lib/dates.ts';
import { cn } from '@/lib/cn.ts';

interface Star {
  id: string;
  date: string;
  label: string;
  kind: 'anniversary' | 'trip' | 'memory' | 'first-met';
  detail: string | null;
}

interface Props {
  anniversaryDate: string | null;
  firstMet: string | null;
  trips: Trip[];
  memories: Memory[];
  className?: string | undefined;
}

const W = 320;
const H = 320;
const PADDING = 24;

export function ConstellationMap({
  anniversaryDate,
  firstMet,
  trips,
  memories,
  className,
}: Props) {
  const stars = useMemo<Star[]>(() => {
    const list: Star[] = [];
    if (firstMet) {
      list.push({
        id: 'first-met',
        date: firstMet,
        label: 'first met',
        kind: 'first-met',
        detail: null,
      });
    }
    if (anniversaryDate) {
      list.push({
        id: 'anniversary',
        date: anniversaryDate,
        label: 'together',
        kind: 'anniversary',
        detail: null,
      });
    }
    for (const t of trips) {
      list.push({
        id: `trip-${t.id}`,
        date: t.depart_at.slice(0, 10),
        label: `${t.origin_city} → ${t.destination_city}`,
        kind: 'trip',
        detail: t.notes ?? null,
      });
    }
    for (const m of memories.filter((mm) => mm.is_favourite)) {
      list.push({
        id: `mem-${m.id}`,
        date: m.memory_date,
        label: m.content ? truncate(m.content, 24) : 'a moment',
        kind: 'memory',
        detail: m.content ?? null,
      });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [anniversaryDate, firstMet, trips, memories]);

  const [selected, setSelected] = useState<Star | null>(null);

  // Pseudo-random but stable XY layout from the date hash.
  const positions = useMemo(() => {
    return stars.map((s, i) => {
      const seed = hash(s.id);
      const t = stars.length === 1 ? 0.5 : i / (stars.length - 1);
      // Snake from top-left to bottom-right with small perpendicular wiggle.
      const x = PADDING + t * (W - 2 * PADDING) + offsetFromSeed(seed, 30);
      const y = PADDING + t * (H - 2 * PADDING) + offsetFromSeed(seed >> 8, 60);
      return { x: clamp(x, PADDING, W - PADDING), y: clamp(y, PADDING, H - PADDING) };
    });
  }, [stars]);

  if (stars.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center',
          className,
        )}
      >
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)] mb-2">
          Constellation
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          Add an anniversary, a trip, or favourite a memory and stars start
          appearing here.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gold-glow)] bg-[var(--forest)] p-3 flex flex-col gap-2',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          Constellation · {stars.length}
        </p>
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
          tap a star
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full aspect-square"
          aria-label="Constellation of milestones"
        >
          <defs>
            <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.9" />
              <stop offset="60%" stopColor="var(--gold)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Lines connecting in chronological order */}
          {positions.length > 1 &&
            positions.map((p, i) => {
              if (i === 0) return null;
              const prev = positions[i - 1]!;
              return (
                <line
                  key={i}
                  x1={prev.x}
                  y1={prev.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="var(--gold)"
                  strokeWidth="0.5"
                  strokeOpacity="0.35"
                  strokeDasharray="2 3"
                />
              );
            })}
          {/* Stars */}
          {stars.map((s, i) => {
            const p = positions[i]!;
            const isSel = selected?.id === s.id;
            const r = s.kind === 'anniversary' ? 6 : s.kind === 'first-met' ? 5.5 : 4;
            return (
              <g
                key={s.id}
                onClick={() => setSelected(s)}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(s)}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={p.x} cy={p.y} r={r * 3} fill="url(#starGlow)" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="var(--gold)"
                  stroke={isSel ? 'var(--background)' : 'transparent'}
                  strokeWidth="1"
                />
                {isSel && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 4}
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth="0.8"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {selected && (
        <div className="rounded-xl border border-[var(--gold)] bg-[var(--gold-wash)] p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
              {selected.kind === 'anniversary'
                ? 'Anniversary'
                : selected.kind === 'first-met'
                  ? 'First met'
                  : selected.kind === 'trip'
                    ? 'Trip'
                    : 'Memory'}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="font-mono text-[10px] text-[var(--muted-foreground)]"
            >
              ×
            </button>
          </div>
          <p className="font-serif text-base">{selected.label}</p>
          <p className="font-mono text-[10px] text-[var(--muted-foreground)]">
            {formatDateShort(selected.date)}
          </p>
          {selected.detail && (
            <p className="text-sm text-[var(--foreground)] mt-1">{selected.detail}</p>
          )}
        </div>
      )}
    </div>
  );
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

function offsetFromSeed(seed: number, range: number): number {
  // -range/2..+range/2 derived from the seed bits, deterministic.
  return ((seed % 1000) / 1000 - 0.5) * range;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
