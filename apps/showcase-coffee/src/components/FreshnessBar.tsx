// Ported from lot-components.jsx — the roast-window progress bar.

import { C, F } from '../tokens.ts';

export interface FreshnessBarProps {
  day: number;
  window: [number, number];
  label: string;
  compact?: boolean;
}

export function FreshnessBar({ day, window: win, label, compact = false }: FreshnessBarProps) {
  const [winStart, winEnd] = win;
  const maxDay = winEnd + 7;
  const pct = (d: number): number => Math.max(0, Math.min(100, (d / maxDay) * 100));
  const freshColor = label === 'At peak' ? C.sage : label === 'Resting' || label === 'Almost' ? C.tan : C.terracotta;

  return (
    <div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          <span style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.espressoLight }}>
            Freshness
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: freshColor, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: freshColor, flexShrink: 0 }} />
            Day {day} · {label}
          </span>
        </div>
      )}
      <div style={{ position: 'relative', height: compact ? 3 : 5 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: C.tanLight, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: `${pct(winStart)}%`, width: `${pct(winEnd - winStart)}%`, height: '100%', background: C.sageLight }} />
          <div style={{ position: 'absolute', left: 0, width: `${pct(day)}%`, height: '100%', background: freshColor, borderRadius: 99 }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: `${pct(day)}%`,
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: compact ? 7 : 9,
            height: compact ? 7 : 9,
            borderRadius: '50%',
            background: C.espresso,
            border: `${compact ? 1 : 1.5}px solid ${C.cream}`,
            zIndex: 1,
          }}
        />
      </div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontFamily: F.sans, fontSize: 9, color: C.espressoLight, letterSpacing: '0.06em' }}>ROASTED</span>
          <span style={{ fontFamily: F.sans, fontSize: 9, color: C.sage, letterSpacing: '0.06em' }}>PEAK {winStart}–{winEnd}d</span>
          <span style={{ fontFamily: F.sans, fontSize: 9, color: C.espressoLight, letterSpacing: '0.06em' }}>STALE</span>
        </div>
      )}
    </div>
  );
}
