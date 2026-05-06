import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { listSchedules, saveSchedule } from '../db/queries.ts';
import type { DoughSchedule } from '../db/schema.ts';
import {
  clampFlour,
  clampPercent,
  HYDRATION_MAX,
  HYDRATION_MIN,
  LEAVEN_MAX,
  LEAVEN_MIN,
  SALT_MAX,
  SALT_MIN,
  weighDough,
} from '../lib/bakers-pct.ts';
import { buildSchedule, clampColdHours, formatStepTime } from '../lib/schedule.ts';

interface BakeProps {
  db: ShippieLocalDb;
  shippie: ShippieIframeSdk;
  refreshKey: number;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

function defaultStartLocal(): string {
  // datetime-local needs a "YYYY-MM-DDTHH:mm" string. Use the user's
  // wall clock (not UTC) so the picker shows their actual now.
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Bake({ db, shippie, refreshKey, onChanged, onToast }: BakeProps): ReactElement {
  const [flourG, setFlourG] = useState(1000);
  const [hydration, setHydration] = useState(75);
  const [saltPct, setSaltPct] = useState(2);
  const [leavenPct, setLeavenPct] = useState(20);
  const [startLocal, setStartLocal] = useState(defaultStartLocal());
  const [coldHours, setColdHours] = useState(12);
  const [savedSchedules, setSavedSchedules] = useState<DoughSchedule[]>([]);
  const [activeBakeId, setActiveBakeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listSchedules(db, 5);
      if (!cancelled) setSavedSchedules(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  const weights = useMemo(
    () => weighDough({ flour_g: flourG, hydration, salt_pct: saltPct, leaven_pct: leavenPct }),
    [flourG, hydration, saltPct, leavenPct],
  );

  const start = useMemo(() => new Date(startLocal), [startLocal]);
  const steps = useMemo(
    () => buildSchedule({ start, cold_hours: coldHours }),
    [start, coldHours],
  );
  const bakeStep = steps[steps.length - 1]!;

  async function startedFermenting() {
    const startedAt = new Date().toISOString();
    const readyAt = bakeStep.at.toISOString();
    const row = await saveSchedule(db, {
      hydration,
      salt_pct: saltPct,
      leaven_pct: leavenPct,
      flour_g: flourG,
      cold_hours: coldHours,
      started_at: startedAt,
      ready_at: readyAt,
    });
    setActiveBakeId(row.id);
    onChanged();
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('dough-ferment-started', [
      {
        flour_g: flourG,
        hydration,
        cold_hours: coldHours,
        started_at: startedAt,
        ready_at: readyAt,
      },
    ]);
    onToast('Fermenting. Check back at the fold times.');
  }

  function breadReady() {
    const readyAt = new Date().toISOString();
    shippie.feel.texture('milestone');
    shippie.intent.broadcast('dough-ready', [{ ready_at: readyAt }]);
    onToast('Bread ready. Let it rest before slicing.');
    setActiveBakeId(null);
  }

  return (
    <section className="page mode-page">
      <header className="page-header">
        <h2>Bake</h2>
        <span className="eyebrow">{weights.total_g}g total dough</span>
      </header>

      <div className="card">
        <div className="card-label">Baker's percentages</div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="flour-g">Flour (g)</label>
            <input
              id="flour-g"
              type="number"
              min={50}
              max={5000}
              value={flourG}
              onChange={(e) => setFlourG(clampFlour(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="hydration">Hydration (%)</label>
            <input
              id="hydration"
              type="number"
              min={HYDRATION_MIN}
              max={HYDRATION_MAX}
              step={0.5}
              value={hydration}
              onChange={(e) =>
                setHydration(clampPercent(e.target.value, HYDRATION_MIN, HYDRATION_MAX, 75))
              }
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="salt-pct">Salt (%)</label>
            <input
              id="salt-pct"
              type="number"
              min={SALT_MIN}
              max={SALT_MAX}
              step={0.1}
              value={saltPct}
              onChange={(e) =>
                setSaltPct(clampPercent(e.target.value, SALT_MIN, SALT_MAX, 2))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="leaven-pct">Leaven (%)</label>
            <input
              id="leaven-pct"
              type="number"
              min={LEAVEN_MIN}
              max={LEAVEN_MAX}
              step={0.5}
              value={leavenPct}
              onChange={(e) =>
                setLeavenPct(clampPercent(e.target.value, LEAVEN_MIN, LEAVEN_MAX, 20))
              }
            />
          </div>
        </div>
        <div className="weights-grid">
          <div>
            <div className="weight-label">Flour</div>
            <div className="weight-value">{weights.flour_g} g</div>
          </div>
          <div>
            <div className="weight-label">Water</div>
            <div className="weight-value">{weights.water_g} g</div>
          </div>
          <div>
            <div className="weight-label">Salt</div>
            <div className="weight-value">{weights.salt_g} g</div>
          </div>
          <div>
            <div className="weight-label">Leaven</div>
            <div className="weight-value">{weights.leaven_g} g</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Schedule</div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="start-time">Start</label>
            <input
              id="start-time"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cold-hours">Cold ferment (hours)</label>
            <input
              id="cold-hours"
              type="number"
              min={1}
              max={72}
              step={0.5}
              value={coldHours}
              onChange={(e) => setColdHours(clampColdHours(e.target.value))}
            />
          </div>
        </div>
        <ol className="schedule-list">
          {steps.map((step) => (
            <li key={step.key} className="schedule-row">
              <span className="schedule-time">{formatStepTime(step.at)}</span>
              <span className="schedule-label">{step.label}</span>
              <span className="schedule-hint">{step.hint}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary big"
          onClick={startedFermenting}
          disabled={activeBakeId !== null}
        >
          Started fermenting
        </button>
        <button
          type="button"
          className="big"
          onClick={breadReady}
          disabled={activeBakeId === null}
        >
          Bread ready
        </button>
      </div>

      {savedSchedules.length > 0 ? (
        <div className="card">
          <div className="card-label">Recent bakes</div>
          <ul className="recent-list" role="list">
            {savedSchedules.map((s) => (
              <li key={s.id} className="recent-row">
                <span>
                  {s.flour_g}g · {s.hydration}%
                </span>
                <span className="recent-meta">
                  {new Date(s.started_at).toLocaleString([], {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
