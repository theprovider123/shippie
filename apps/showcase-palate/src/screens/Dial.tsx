// palate. — The Dial (every timer)
// SVG dial with bezel pointer-drag winding, tap face start/stop/reset.
// Size prop: 330px mobile, 240px desktop.

import React, { useRef } from 'react';
import { EGG_PRESETS, eggPreset, fmtSeconds } from '../lib/engine.ts';

const TERRA = '#b85c26';
const SAGE = '#4d6647';
const AMBER = '#c47c2b';

export interface DialState {
  minutes: number;    // winding position (0–60)
  status: 'idle' | 'running' | 'done';
  started_at?: number;
  duration_s?: number;
}

interface Props {
  dialState: DialState;
  now: number;
  size?: number; // defaults to 330
  compact?: boolean; // desktop: hides egg presets and dial-screen wrapper chrome
  onWind: (minutes: number) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

function dialColor(state: DialState, remaining_s: number): string {
  if (state.status === 'idle') return TERRA;
  if (state.status === 'done') return TERRA;
  if (remaining_s < 120) return AMBER;
  return SAGE;
}

function computeRemaining(state: DialState, now: number): number {
  if (state.status === 'idle') return state.minutes * 60;
  if (state.status === 'done') return 0;
  if (state.started_at == null || state.duration_s == null) return state.minutes * 60;
  const elapsed = (now - state.started_at) / 1000;
  return Math.max(0, state.duration_s - elapsed);
}

export function Dial({ dialState, now, size = 330, compact = false, onWind, onStart, onStop, onReset }: Props) {
  const draggingRef = useRef(false);

  const remaining_s = computeRemaining(dialState, now);
  const displayMin = dialState.status === 'running' ? remaining_s / 60 : dialState.minutes;
  const frac = Math.max(0, Math.min(1, displayMin / 60));

  const isDone = dialState.status === 'done' || (dialState.status === 'running' && remaining_s === 0);
  const color = dialColor(dialState, remaining_s);

  // SVG geometry — radius-proportional (works for 330 and 240)
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * (150 / 330); // proportional to mockup
  const circumference = 2 * Math.PI * radius;
  const faceSize = size * (196 / 330);
  const needleH = size * (142 / 330);
  const needleTopH = size * (26 / 330);
  const strokeOuter = size * (11 / 330);
  const strokeRing = size * (17 / 330);
  const strokeArc = size * (7 / 330);
  const dashTickLen = 1.5;
  const tickGap = circumference / 70; // ~70 ticks
  const ringGap = circumference / 2;  // 2-dash ring

  const arcDash = `${(frac * circumference).toFixed(1)} ${circumference.toFixed(1)}`;

  const dialFontSize = size * (58 / 330);
  const captionFontSize = Math.max(9, size * (11 / 330));

  function getMinutesFromEvent(e: React.PointerEvent<SVGSVGElement>): number | null {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (rect.left + rect.width / 2);
    const y = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(x * x + y * y);
    // Only bezel — outer 30% of radius (or more precisely, outer band)
    if (dist < rect.width * 0.3) return null; // center face is the button
    let deg = Math.atan2(x, -y) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    let min = Math.round((deg / 360) * 60 * 2) / 2; // 30s quantize
    if (min === 0) min = 60;
    return min;
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const m = getMinutesFromEvent(e);
    if (m === null) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onWind(m);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    const m = getMinutesFromEvent(e);
    if (m !== null) onWind(m);
  }

  function handlePointerUp() {
    draggingRef.current = false;
  }

  function handleFaceClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDone) {
      onReset();
    } else if (dialState.status === 'running') {
      onStop();
    } else {
      onStart();
    }
  }

  const centerBg = isDone ? TERRA : '#ffffff';
  const centerInk = isDone ? '#fdf3e9' : '#2a2118';
  const centerSub = isDone ? 'rgba(253,243,233,0.75)' : '#b5a898';

  const caption = isDone
    ? 'done — tap to reset'
    : dialState.status === 'running'
      ? 'running — tap to stop'
      : 'tap to start';

  const displayStr = isDone ? '0:00' : fmtSeconds(Math.round(displayMin * 60));

  const [eggLarge, setEggLarge] = React.useState(false);
  const [eggFridge, setEggFridge] = React.useState(false);

  return (
    <div className={compact ? '' : 'dial-screen'} style={compact ? { display: 'flex', justifyContent: 'center' } : {}}>
      <div className={compact ? '' : 'dial-wrap'} style={compact ? {} : ({ '--dial-size': `${size}px` } as React.CSSProperties)}>
        {/* SVG Dial */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ touchAction: 'none', cursor: 'grab', display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Outer faded tick ring */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="rgba(42,33,24,0.16)"
            strokeWidth={strokeOuter}
            strokeDasharray={`${dashTickLen} ${(circumference / 70).toFixed(3)}`}
          />
          {/* Middle solid ring */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="rgba(42,33,24,0.34)"
            strokeWidth={strokeRing}
            strokeDasharray={`2 ${(circumference / 2).toFixed(2)}`}
          />
          {/* Active arc */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeArc}
            strokeLinecap="round"
            strokeDasharray={arcDash}
            transform={`rotate(-90 ${cx} ${cy})`}
          />

          {/* Needle (foreign object for HTML-in-SVG won't work; use rect + transform) */}
          <g transform={`translate(${cx}, ${cy})`}>
            <g transform={`rotate(${(frac * 360).toFixed(1)})`}>
              <rect
                x={-1.5}
                y={-(needleH)}
                width={3}
                height={needleTopH}
                rx={2}
                fill={color}
              />
            </g>
          </g>

          {/* Centre face */}
          <foreignObject
            x={cx - faceSize / 2}
            y={cy - faceSize / 2}
            width={faceSize}
            height={faceSize}
          >
            <div
              style={{
                width: faceSize,
                height: faceSize,
                borderRadius: '50%',
                background: centerBg,
                border: '1px solid rgba(42,33,24,0.12)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
                userSelect: 'none',
                boxSizing: 'border-box',
              }}
              onClick={handleFaceClick}
            >
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: dialFontSize,
                lineHeight: 1,
                color: centerInk,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {displayStr}
              </div>
              <div style={{
                fontSize: captionFontSize,
                letterSpacing: '0.06em',
                color: centerSub,
                textAlign: 'center',
                padding: '0 8px',
              }}>
                {caption}
              </div>
            </div>
          </foreignObject>
        </svg>

        {/* Egg presets — hidden in compact mode */}
        {!compact && <div className="egg-presets">
          <div className="egg-adjustments">
            <label className="egg-adj-label">
              <input type="checkbox" checked={eggLarge} onChange={(e) => setEggLarge(e.target.checked)} />
              <span>Large +0:30</span>
            </label>
            <label className="egg-adj-label">
              <input type="checkbox" checked={eggFridge} onChange={(e) => setEggFridge(e.target.checked)} />
              <span>From fridge +0:30</span>
            </label>
          </div>
          <div className="egg-row">
            {EGG_PRESETS.map((p) => {
              const adj_s = eggPreset(p.base_s, eggLarge, eggFridge);
              const adjMin = adj_s / 60;
              const m = Math.floor(adjMin);
              const s = Math.round((adjMin - m) * 60);
              const display = `${m}:${String(s).padStart(2, '0')}`;
              return (
                <button
                  key={p.label}
                  className="egg-pill"
                  onClick={() => onWind(adjMin)}
                >
                  <span className="egg-name">{p.label}</span>
                  <span className="egg-time">{display}</span>
                </button>
              );
            })}
          </div>
          <div className="dial-footer">drag the bezel to wind · tap the face to start</div>
        </div>}
      </div>
    </div>
  );
}

