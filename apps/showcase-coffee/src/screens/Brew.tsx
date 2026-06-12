// Brew screen — the daily driver. Ported from lot-brew.jsx, made operational:
// the timer runs a real session and a completed pull is logged + broadcast.

import { useEffect, useRef, useState } from 'react';
import { C, F } from '../tokens.ts';
import type { Bag, Recipe } from '../types.ts';
import { bagFreshness, originLine } from '../lib/format.ts';
import { FreshnessBar } from '../components/FreshnessBar.tsx';
import { BrewArc, stepLabel, type ArcStep } from '../components/BrewArc.tsx';

// ─── BrewTimer ──────────────────────────────────────────────────────────
// Timestamp-based session clock. The smooth arc sweep is driven by a
// requestAnimationFrame loop writing the `--brew-arc-offset` CSS variable
// onto the wrapper element (no React state per frame); React state commits
// only at whole-second boundaries for the numeral readout. Elapsed time is
// accumulated on pause so resume stays correct even if the parent toggles
// `running` without remounting.

interface BrewTimerProps {
  running: boolean;
  total: number;
  steps?: ArcStep[];
  onComplete: () => void;
}

function BrewTimer({ running, total, steps, onComplete }: BrewTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const accumulatedRef = useRef(0); // ms banked from previous run segments
  const lastSecRef = useRef(-1);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!running) return;
    const startedAt = performance.now();
    let raf = 0;
    let completed = false;
    const frame = (now: number) => {
      const ms = accumulatedRef.current + (now - startedAt);
      const progress = Math.min(ms / 1000 / total, 1);
      // Per-frame visual update — a CSS variable, never React state.
      wrapRef.current?.style.setProperty('--brew-arc-offset', String(1 - progress));
      const secs = Math.min(Math.floor(ms / 1000), total);
      if (secs !== lastSecRef.current) {
        lastSecRef.current = secs;
        setElapsed(secs); // second-boundary commit for the numeral
      }
      if (progress >= 1) {
        completed = true;
        accumulatedRef.current = total * 1000;
        onCompleteRef.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // Pause: bank the elapsed wall time so a resume continues correctly.
      if (!completed) accumulatedRef.current += performance.now() - startedAt;
    };
  }, [running, total]);

  return (
    <div ref={wrapRef}>
      <BrewArc
        elapsed={elapsed}
        total={total}
        label={stepLabel(elapsed, total, steps ?? [])}
        markers={(steps ?? []).map((s) => s.targetTime).join(',')}
      />
    </div>
  );
}

const METHOD_LABEL: Record<Recipe['method'], string> = {
  v60: 'V60',
  aeropress: 'AeroPress',
  chemex: 'Chemex',
  espresso: 'Espresso',
  moka: 'Moka',
  frenchpress: 'French Press',
  coldbrew: 'Cold Brew',
};

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const params: Array<{ label: string; value: string }> = [
    { label: 'Dose', value: `${recipe.dose}g` },
    { label: 'Yield', value: `${recipe.yield}g` },
    { label: 'Ratio', value: recipe.ratio },
    { label: 'Grind', value: recipe.grindSetting },
    { label: 'Temp', value: `${recipe.waterTemp}°C` },
    { label: 'Time', value: `0:${String(recipe.totalTime).padStart(2, '0')}` },
  ];
  return (
    <div
      style={{
        background: C.paper,
        borderRadius: 14,
        padding: '18px 20px 20px',
        border: `1px solid ${C.tanLight}`,
        boxShadow: '0 1px 3px rgba(44,26,14,0.05), 0 6px 20px rgba(44,26,14,0.09), inset 0 0 0 1px rgba(191,169,138,0.18)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.tanLight}` }}>
        <span style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.espressoLight }}>Recipe</span>
        <span style={{ fontFamily: F.mono, fontSize: 10, color: C.espressoLight, letterSpacing: '0.04em' }}>{METHOD_LABEL[recipe.method]}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', rowGap: 18, columnGap: 8 }}>
        {params.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.espressoLight }}>{label}</span>
            <span style={{ fontFamily: F.mono, fontSize: 20, fontWeight: 400, color: C.espresso, lineHeight: 1 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BrewScreenProps {
  bag: Bag;
  recipe: Recipe | undefined;
  onLogBrew: (seconds: number) => void;
  onLogCup: () => void;
  onSwitchBag: () => void;
  onCreateRecipe: () => void;
}

export function BrewScreen({ bag, recipe, onLogBrew, onLogCup, onSwitchBag, onCreateRecipe }: BrewScreenProps) {
  const brewTime = recipe?.totalTime ?? 28;
  const [brewing, setBrewing] = useState(false);
  const [done, setDone] = useState(false);

  const f = bagFreshness(bag);
  const showTimer = brewing || done;

  const start = () => {
    setDone(false);
    setBrewing(true);
  };
  const stop = () => setBrewing(false);
  const reset = () => {
    setBrewing(false);
    setDone(false);
  };
  const logBrew = () => {
    // The session only becomes loggable once the timer ran to completion,
    // at which point elapsed === brewTime.
    onLogBrew(brewTime);
    reset();
  };

  return (
    <div style={{ padding: '10px 20px 24px', minHeight: '100%' }}>
      <div style={{ fontFamily: F.mono, fontSize: 12, color: C.tan, letterSpacing: '0.16em', marginBottom: 22 }}>lot.</div>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: F.serif, fontSize: 33, fontWeight: 600, color: C.espresso, lineHeight: 1.1, marginBottom: 5 }}>{bag.name}</h1>
        <div style={{ fontFamily: F.sans, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.espressoMid, marginBottom: 5 }}>{bag.roasterName}</div>
        <div style={{ fontFamily: F.sans, fontSize: 13, color: C.espressoLight, fontStyle: 'italic', marginBottom: 18 }}>{originLine(bag)}</div>
        <FreshnessBar day={f.barDay} window={f.window} label={f.displayLabel} />
      </div>

      <div style={{ height: 1, background: C.tanLight, marginBottom: 22 }} />

      <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'center' }}>
        {!showTimer ? (
          recipe ? (
            <RecipeCard recipe={recipe} />
          ) : (
            <NoRecipe onCreate={onCreateRecipe} />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
            <BrewTimer
              running={brewing}
              total={brewTime}
              steps={recipe?.steps}
              onComplete={() => {
                setBrewing(false);
                setDone(true);
              }}
            />
            {done && (
              <div style={{ marginTop: 4, fontFamily: F.serif, fontStyle: 'italic', fontSize: 15, color: C.sage, letterSpacing: '0.01em' }}>
                Pull complete.
              </div>
            )}
          </div>
        )}
      </div>

      {!showTimer && recipe && (
        <div>
          <button
            type="button"
            onClick={start}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 7,
              background: 'rgba(196,99,58,0.05)',
              color: C.terracotta,
              border: '1px solid rgba(196,99,58,0.55)',
              fontFamily: F.serif,
              fontSize: 15,
              fontStyle: 'italic',
              fontWeight: 500,
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <span>Start Brew</span>
            <span style={{ fontSize: 11, opacity: 0.5, fontStyle: 'normal', fontFamily: F.mono }}>{brewTime}s</span>
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
            <button type="button" className="tap-target" onClick={onLogCup} style={{ background: 'none', border: 'none', fontFamily: F.sans, fontSize: 12, color: C.espressoLight, cursor: 'pointer' }}>
              Log a cup
            </button>
            <span style={{ color: C.tanLight, fontSize: 10 }}>·</span>
            <button type="button" className="tap-target" onClick={onSwitchBag} style={{ background: 'none', border: 'none', fontFamily: F.sans, fontSize: 12, color: C.espressoLight, cursor: 'pointer' }}>
              Switch bag
            </button>
          </div>
        </div>
      )}

      {showTimer && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {brewing && (
            <button
              type="button"
              onClick={stop}
              style={{ background: 'none', border: `1px solid ${C.tanLight}`, borderRadius: 7, padding: '9px 32px', minHeight: 44, fontFamily: F.sans, fontSize: 12, color: C.espressoLight, letterSpacing: '0.06em', cursor: 'pointer' }}
            >
              End pull
            </button>
          )}
          {done && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={logBrew}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 7,
                  background: 'rgba(107,140,110,0.06)',
                  color: C.sage,
                  border: '1px solid rgba(107,140,110,0.5)',
                  fontFamily: F.serif,
                  fontSize: 15,
                  fontStyle: 'italic',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}
              >
                Log this brew
              </button>
              <button type="button" onClick={reset} style={{ background: 'none', border: 'none', fontFamily: F.sans, fontSize: 12, color: C.espressoLight, textAlign: 'center', cursor: 'pointer', minHeight: 44 }}>
                ← Back to recipe
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoRecipe({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        width: '100%',
        background: C.paper,
        borderRadius: 14,
        padding: '26px 20px',
        border: `1px dashed ${C.tan}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 17, color: C.espressoMid, marginBottom: 6 }}>No recipe yet</div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoLight, marginBottom: 16, lineHeight: 1.6 }}>
        Dial in a starting point and tweak it as you brew.
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{ fontFamily: F.sans, fontSize: 13, color: C.terracotta, background: 'rgba(196,99,58,0.06)', border: '1px solid rgba(196,99,58,0.5)', borderRadius: 8, padding: '9px 18px', minHeight: 44, cursor: 'pointer' }}
      >
        Dial in a recipe
      </button>
    </div>
  );
}
