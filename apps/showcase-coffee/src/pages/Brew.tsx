import { useEffect, useMemo, useRef, useState } from 'react';
import {
  METHOD_DEFAULTS,
  METHOD_LABEL,
  MG_PER_GRAM,
  RATIO_RANGE,
  modeForMethod,
  newId,
  type Bean,
  type Brew,
  type BrewMethod,
} from '../db.ts';
import { RatioDial } from '../components/RatioDial.tsx';
import { RatePrompt } from '../components/RatePrompt.tsx';
import { reading } from '../lib/freshness.ts';

interface BrewPageProps {
  beans: ReadonlyArray<Bean>;
  selectedBeanId: string | null;
  onSelectBean: (id: string | null) => void;
  onAddBrew: (b: Brew) => void;
  onRateLast: (rating: number, note: string) => void;
  onTextureConfirm: () => void;
  onTextureMilestone: () => void;
  onBroadcast: (brew: Brew) => void;
}

interface JustBrewed {
  brewId: string;
}

export function BrewPage({
  beans,
  selectedBeanId,
  onSelectBean,
  onAddBrew,
  onRateLast,
  onTextureConfirm,
  onTextureMilestone,
  onBroadcast,
}: BrewPageProps) {
  const selectedBean = useMemo(
    () => beans.find((b) => b.id === selectedBeanId) ?? null,
    [beans, selectedBeanId],
  );

  const initialMethod: BrewMethod = selectedBean?.method ?? 'v60';
  const [method, setMethod] = useState<BrewMethod>(initialMethod);
  const [ratio, setRatio] = useState<number>(selectedBean?.ratio ?? METHOD_DEFAULTS[initialMethod].ratio);
  const [weightG, setWeightG] = useState<number>(METHOD_DEFAULTS[initialMethod].weightHint);

  // When the user switches active bean from the strip, sync defaults.
  useEffect(() => {
    if (!selectedBean) return;
    setMethod(selectedBean.method);
    setRatio(selectedBean.ratio);
    setWeightG(METHOD_DEFAULTS[selectedBean.method].weightHint);
  }, [selectedBean]);

  // Brew timer
  const [brewing, setBrewing] = useState<boolean>(false);
  const [seconds, setSeconds] = useState<number>(0);
  const [justBrewed, setJustBrewed] = useState<JustBrewed | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!brewing) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, [brewing]);

  const targetSec = METHOD_DEFAULTS[method].seconds;
  const overTime = seconds > targetSec;
  const grindHint = METHOD_DEFAULTS[method].grindHint;
  const fresh = selectedBean ? reading(selectedBean.method, selectedBean.roast_date) : null;

  function handleMethodChange(next: BrewMethod) {
    setMethod(next);
    const r = RATIO_RANGE[modeForMethod(next)];
    if (ratio < r.min || ratio > r.max) setRatio(METHOD_DEFAULTS[next].ratio);
    setWeightG((w) => (w < 5 ? METHOD_DEFAULTS[next].weightHint : w));
  }

  function startBrew() {
    setSeconds(0);
    setBrewing(true);
    onTextureConfirm();
  }

  function finishBrew() {
    setBrewing(false);
    const water_g = Math.round(weightG * ratio * 10) / 10;
    const brew: Brew = {
      id: newId('brew'),
      bean_id: selectedBean?.id ?? null,
      bean_name: selectedBean?.name ?? 'unsaved bean',
      weight_g: weightG,
      water_g,
      ratio,
      method,
      brew_seconds: seconds,
      taste_rating: null,
      brewed_at: new Date().toISOString(),
    };
    onAddBrew(brew);
    onBroadcast(brew);
    onTextureMilestone();
    setJustBrewed({ brewId: brew.id });
  }

  function cancelBrew() {
    setBrewing(false);
    setSeconds(0);
  }

  return (
    <main className="page page-brew">
      {selectedBean ? (
        <div className="brew-primary-line">
          <div>
            <p className="eyebrow">using</p>
            <span className="active-bean-name">{selectedBean.name}</span>
          </div>
          <button type="button" className="ghost" onClick={() => setSetupOpen(true)}>
            Setup
          </button>
        </div>
      ) : (
        <button type="button" className="ghost setup-wide" onClick={() => setSetupOpen(true)}>
          Choose bean and brew setup
        </button>
      )}

      <section className="timer">
        <p className={`time ${overTime ? 'time-over' : ''}`}>
          {Math.floor(seconds / 60).toString().padStart(2, '0')}:
          {(seconds % 60).toString().padStart(2, '0')}
        </p>
        <p className="muted small">
          target {Math.floor(targetSec / 60)}:{(targetSec % 60).toString().padStart(2, '0')} · {METHOD_LABEL[method]}
          {' · '}~{Math.round(weightG * MG_PER_GRAM[method])}mg caffeine
        </p>
        <div className="timer-actions">
          {!brewing ? (
            <button type="button" className="primary" onClick={startBrew}>
              Start brew
            </button>
          ) : (
            <>
              <button type="button" className="primary" onClick={finishBrew}>
                Finish
              </button>
              <button type="button" className="ghost" onClick={cancelBrew}>
                Cancel
              </button>
            </>
          )}
        </div>
      </section>

      {justBrewed ? (
        <RatePrompt
          onConfirm={(rating, note) => {
            onRateLast(rating, note);
            setJustBrewed(null);
          }}
          onSkip={() => setJustBrewed(null)}
        />
      ) : null}

      {setupOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setSetupOpen(false)}>
          <section
            className="bottom-sheet"
            role="dialog"
            aria-label="Brew setup"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden="true" />
            <header className="sheet-head">
              <div>
                <p className="eyebrow">Brew setup</p>
                <h2>Bean, ratio, grind</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setSetupOpen(false)}>
                Done
              </button>
            </header>

            <section className="strip" aria-label="Saved beans">
              {beans.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`bean-chip ${b.id === selectedBeanId ? 'active' : ''}`}
                  onClick={() => onSelectBean(b.id)}
                  title={b.notes ?? ''}
                >
                  <span className="bean-name">{b.name}</span>
                  <span className="bean-meta">
                    {METHOD_LABEL[b.method]} · 1:{b.ratio}
                  </span>
                </button>
              ))}
            </section>

            {selectedBean && fresh ? (
              <div className="active-bean-line">
                <span className="active-bean-name">{selectedBean.name}</span>
                <span className={`freshness-tag tag-${fresh.band}`}>
                  {fresh.daysSinceRoast}d · {fresh.label}
                </span>
              </div>
            ) : null}

            <RatioDial
              method={method}
              weightG={weightG}
              ratio={ratio}
              onChangeMethod={handleMethodChange}
              onChangeWeight={setWeightG}
              onChangeRatio={setRatio}
            />

            <p className="grind-hint muted small">
              suggested grind: <strong>{grindHint}</strong>
              {selectedBean?.grind ? ` · saved: ${selectedBean.grind}` : ''}
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
