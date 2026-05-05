import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  DEFAULT_PACE_SEC_PER_KM,
  SPORT_LABEL,
  fmtClock,
  fmtPace,
  load,
  newId,
  paceToKph,
  parseClock,
  save,
  type Plan,
  type Sport,
} from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_pace' });

const SPORTS: Sport[] = ['run', 'walk', 'cycle'];

export function App() {
  const initial = load();
  const [plans, setPlans] = useState<Plan[]>(initial.plans);
  const [sport, setSport] = useState<Sport>('run');
  const [distanceKm, setDistanceKm] = useState<number>(10);
  const [paceSec, setPaceSec] = useState<number>(DEFAULT_PACE_SEC_PER_KM.run);
  const [name, setName] = useState<string>('');
  const [planSavedFlash, setPlanSavedFlash] = useState<boolean>(false);

  useEffect(() => {
    save({ plans });
  }, [plans]);

  function pickSport(s: Sport) {
    setSport(s);
    setPaceSec(DEFAULT_PACE_SEC_PER_KM[s]);
  }

  // Editable target time string ("MM:SS" or "H:MM:SS") — derived from
  // distance × pace but the user can also type a target time and we'll
  // recompute pace.
  const totalSec = useMemo(() => paceSec * distanceKm, [paceSec, distanceKm]);
  const [timeDraft, setTimeDraft] = useState<string>(fmtClock(totalSec));

  // Keep timeDraft in sync when sport / distance / pace change.
  useEffect(() => {
    setTimeDraft(fmtClock(totalSec));
  }, [totalSec]);

  function commitTime(draft: string) {
    const parsed = parseClock(draft);
    if (parsed !== null && distanceKm > 0) {
      setPaceSec(parsed / distanceKm);
    }
  }

  function adjustPace(delta: number) {
    setPaceSec((p) => Math.max(60, Math.round(p + delta)));
  }

  function savePlan() {
    if (!name.trim()) return;
    const plan: Plan = {
      id: newId(),
      name: name.trim(),
      sport,
      distance_km: distanceKm,
      target_seconds: Math.round(totalSec),
      saved_at: new Date().toISOString(),
    };
    setPlans((prev) => [plan, ...prev].slice(0, 50));
    setName('');
    setPlanSavedFlash(true);
    window.setTimeout(() => setPlanSavedFlash(false), 1800);
    shippie.feel.texture('confirm');
  }

  function loadPlan(p: Plan) {
    setSport(p.sport);
    setDistanceKm(p.distance_km);
    setPaceSec(p.target_seconds / Math.max(0.1, p.distance_km));
  }

  function deletePlan(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  function startPlan() {
    const startedAt = new Date().toISOString();
    const finishMs = Date.now() + totalSec * 1000;
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('run-planned', [
      {
        sport,
        distance_km: distanceKm,
        target_seconds: Math.round(totalSec),
        pace_sec_per_km: Math.round(paceSec),
        started_at: startedAt,
        est_finish_at: new Date(finishMs).toISOString(),
      },
    ]);
  }

  // Splits — render only when distance ≤ 30km so the table doesn't blow up.
  const splits = useMemo(() => {
    if (distanceKm > 30) return [];
    const out: Array<{ km: number; cumulative: number }> = [];
    for (let k = 1; k <= Math.floor(distanceKm); k++) {
      out.push({ km: k, cumulative: paceSec * k });
    }
    if (distanceKm % 1 > 0) {
      out.push({ km: Math.round(distanceKm * 10) / 10, cumulative: totalSec });
    }
    return out;
  }, [distanceKm, paceSec, totalSec]);

  const finishAt = useMemo(() => {
    const d = new Date(Date.now() + totalSec * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [totalSec]);

  const kph = paceToKph(paceSec);

  function openYourData() {
    shippie.openYourData({ appSlug: 'pace' });
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Pace</h1>
        <p className="subtitle">distance · time · pace</p>
      </header>

      {/* Sport picker */}
      <section className="sport-row">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            className={`sport-chip ${s === sport ? 'active' : ''}`}
            onClick={() => pickSport(s)}
          >
            {SPORT_LABEL[s]}
          </button>
        ))}
      </section>

      {/* Dial — three values, two editable */}
      <section className="dial">
        <label className="field">
          <span>distance</span>
          <div className="row-input">
            <input
              type="number"
              min={0.5}
              max={500}
              step={0.5}
              value={distanceKm}
              onChange={(e) => setDistanceKm(Number(e.target.value) || 0)}
            />
            <span className="unit">km</span>
          </div>
        </label>

        <label className="field">
          <span>target time</span>
          <input
            type="text"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={(e) => commitTime(e.target.value)}
            inputMode="numeric"
            placeholder="MM:SS or H:MM:SS"
          />
        </label>

        <div className="pace-row">
          <button type="button" className="step" onClick={() => adjustPace(-5)} aria-label="Faster">−</button>
          <div className="pace-display">
            <p className="pace-big">{fmtPace(paceSec)}</p>
            <p className="muted small">/km · {kph} km/h</p>
          </div>
          <button type="button" className="step" onClick={() => adjustPace(5)} aria-label="Slower">+</button>
        </div>

        <p className="muted small finish-line">
          start now → finish at <strong>{finishAt}</strong>
        </p>

        <div className="dial-actions">
          <button type="button" className="primary" onClick={startPlan}>
            Start plan
          </button>
        </div>
      </section>

      {/* Splits */}
      {splits.length > 0 ? (
        <section className="splits">
          <p className="eyebrow">splits</p>
          <ol>
            {splits.map((s) => (
              <li key={s.km}>
                <span className="split-km">km {s.km}</span>
                <span className="split-time">{fmtClock(s.cumulative)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Save */}
      <section className="save-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Sunday hill loop"'
        />
        <button type="button" className="ghost" onClick={savePlan} disabled={!name.trim()}>
          {planSavedFlash ? 'saved ✓' : 'save plan'}
        </button>
      </section>

      {/* Saved plans */}
      {plans.length > 0 ? (
        <section className="plans">
          <p className="eyebrow">saved</p>
          <ul>
            {plans.map((p) => (
              <li key={p.id}>
                <button type="button" className="plan-load" onClick={() => loadPlan(p)}>
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {SPORT_LABEL[p.sport]} · {p.distance_km}km · {fmtClock(p.target_seconds)}
                  </span>
                </button>
                <button
                  type="button"
                  className="plan-del"
                  onClick={() => deletePlan(p.id)}
                  aria-label={`Delete ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </main>
  );
}
