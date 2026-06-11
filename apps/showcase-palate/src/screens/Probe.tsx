// palate. — The Probe (temperature is the screen)
// Manual temp set via vertical drag / ± steppers.
// State machine: tracking → nearly (≤3°) → pull (≥ pull temp)

import React, { useRef, useCallback } from 'react';
import { probeState, cToF } from '../lib/engine.ts';
import type { ProbeUnit } from '../lib/types.ts';

const PROBE_CUTS = [
  { name: 'Beef, med-rare', pull: 52, finish: 54 },
  { name: 'Beef, medium', pull: 60, finish: 63 },
  { name: 'Chicken breast', pull: 71, finish: 74 },
  { name: 'Pork loin', pull: 60, finish: 63 },
  { name: 'Lamb, med-rare', pull: 55, finish: 57 },
  { name: 'Salmon, just-set', pull: 48, finish: 50 },
];

type PState = 'tracking' | 'nearly' | 'pull';

const STATE_PALETTES: Record<PState, { bg: string; ink: string; sub: string; accent: string; track: string; hair: string }> = {
  tracking: { bg: '#f7f3ec', ink: '#2a2118', sub: '#6b5d4f', accent: '#4d6647', track: 'rgba(42,33,24,0.12)', hair: 'rgba(42,33,24,0.1)' },
  nearly: { bg: '#faf0de', ink: '#2a2118', sub: '#8a6a3e', accent: '#9a5f1c', track: 'rgba(42,33,24,0.12)', hair: 'rgba(42,33,24,0.12)' },
  pull: { bg: '#b85c26', ink: '#fdf3e9', sub: 'rgba(253,243,233,0.78)', accent: '#fdf3e9', track: 'rgba(253,243,233,0.35)', hair: 'rgba(253,243,233,0.3)' },
};

const STATE_TAGS: Record<PState, string> = {
  tracking: 'TRACKING',
  nearly: 'ALMOST — STAY CLOSE',
  pull: 'PULL NOW',
};

interface Props {
  currentC: number;
  cut: string;
  unit: ProbeUnit;
  compact?: boolean;
  onTempChange: (c: number) => void;
  onCutChange: (name: string) => void;
  onUnitToggle: () => void;
  onExit?: () => void;
}

export function Probe({ currentC, cut, unit, compact = false, onTempChange, onCutChange, onUnitToggle, onExit }: Props) {
  const cutDef = (PROBE_CUTS.find((c) => c.name === cut) ?? PROBE_CUTS[0])!;
  const state = probeState(currentC, cutDef.pull);
  const pal = STATE_PALETTES[state];
  const tag = STATE_TAGS[state];

  const pStart = cutDef.pull - 10;
  const pRange = cutDef.finish - pStart;
  const pct = Math.max(0, Math.min(100, ((currentC - pStart) / pRange) * 100));
  const pullPct = Math.max(0, Math.min(100, ((cutDef.pull - pStart) / pRange) * 100));

  const display = unit === 'C'
    ? `${currentC.toFixed(1)}°`
    : `${cToF(currentC).toFixed(1)}°`;

  const etaMin = Math.max(1, Math.round((cutDef.pull - currentC) / 0.014 / 60));

  const line = state === 'pull'
    ? `off the heat — carryover takes it to ${cutDef.finish}°`
    : `${cut.toLowerCase()} · pull at ${cutDef.pull}° · ~${etaMin} min`;

  // Drag handling for vertical drag to change temperature
  const dragRef = useRef<{ y: number; startC: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't capture pointer events that start inside interactive child areas —
    // those need their own click/pointer events to reach buttons (steppers,
    // cut rows, unit toggle, exit wordmark).
    const target = e.target as HTMLElement;
    if (
      target.closest('.probe-cuts') ||
      target.closest('.probe-steppers') ||
      target.closest('.probe-header')
    ) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, startC: currentC };
  }, [currentC]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.y - e.clientY; // up = hotter
    const delta = dy * 0.1; // 10px = 1°
    const newC = Math.max(0, Math.min(100, dragRef.current.startC + delta));
    onTempChange(parseFloat(newC.toFixed(1)));
  }, [onTempChange]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  function step(delta: number) {
    onTempChange(parseFloat(Math.max(0, Math.min(100, currentC + delta)).toFixed(1)));
  }

  function handleTempClick() {
    // Tap to reset to pull − 8°
    onTempChange(cutDef.pull - 8);
  }

  return (
    <div
      className="probe-screen"
      style={{
        background: pal.bg,
        '--probe-ink': pal.ink,
        '--probe-sub': pal.sub,
        '--probe-accent': pal.accent,
      } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {!compact && (
        <div className="probe-header">
          <span
            className="wordmark"
            style={{ color: pal.sub, cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onExit?.(); }}
          >palate.</span>
          <span className="probe-label" style={{ color: pal.sub }}>live probe</span>
        </div>
      )}

      <div className="probe-body">
        <div className="probe-tag" style={{ color: pal.accent }}>{tag}</div>

        <div
          className="probe-temp"
          style={{ color: pal.ink }}
          onClick={(e) => { e.stopPropagation(); handleTempClick(); }}
        >
          {display}
        </div>

        <div className="probe-line" style={{ color: pal.sub }}>{line}</div>

        {/* ± Steppers — fine-grained temp adjustment */}
        <div className="probe-steppers" onClick={(e) => e.stopPropagation()}>
          <button
            className="stepper-btn"
            style={{ color: pal.ink, borderColor: pal.track }}
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            aria-label="Decrease temperature by 1°"
          >−</button>
          <button
            className="stepper-btn"
            style={{ color: pal.ink, borderColor: pal.track }}
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Increase temperature by 1°"
          >+</button>
        </div>

        {/* Progress track */}
        <div className="probe-track-wrap">
          <div className="probe-track" style={{ background: pal.track }}>
            <div className="probe-track-fill" style={{ width: `${pct}%`, background: pal.accent }} />
            <div className="probe-pull-marker" style={{ left: `${pullPct}%`, background: pal.ink }} />
          </div>
        </div>
      </div>

      {/* Cuts list */}
      <div className="probe-cuts" onClick={(e) => e.stopPropagation()}>
        {PROBE_CUTS.map((c) => {
          const sel = c.name === cut;
          return (
            <div
              key={c.name}
              className="probe-cut-row"
              style={{ borderTopColor: pal.hair }}
              onClick={() => { onCutChange(c.name); }}
            >
              <div className="probe-cut-left">
                <span className="probe-cut-dot" style={{ color: sel ? pal.ink : pal.sub }}>
                  {sel ? '●' : ''}
                </span>
                <span className="probe-cut-name" style={{ color: sel ? pal.ink : pal.sub }}>{c.name}</span>
              </div>
              <span className="probe-cut-temps" style={{ color: sel ? pal.accent : pal.sub, fontVariantNumeric: 'tabular-nums' }}>
                {unit === 'C' ? `${c.pull}° → ${c.finish}°` : `${cToF(c.pull).toFixed(0)}° → ${cToF(c.finish).toFixed(0)}°`}
              </span>
            </div>
          );
        })}
        <div className="probe-footer" style={{ color: pal.sub }}>
          carryover adds 2–3° while resting
          <button
            className="quiet-action"
            style={{ color: pal.sub }}
            onClick={(e) => { e.stopPropagation(); onUnitToggle(); }}
          >
            · show {unit === 'C' ? '°f' : '°c'}
          </button>
        </div>
      </div>
    </div>
  );
}
