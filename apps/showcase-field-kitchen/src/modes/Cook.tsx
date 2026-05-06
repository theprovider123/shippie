import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { SimpleTimer } from '../components/SimpleTimer.tsx';
import { endMeal, listMeals, startMeal } from '../db/queries.ts';
import {
  COOK_METHODS,
  COOK_METHOD_LABEL,
  type CookMethod,
  type Meal,
} from '../db/schema.ts';
import { describeProgress, getMethodProfile } from '../lib/methods.ts';

interface CookProps {
  db: ShippieLocalDb;
  shippie: ShippieIframeSdk;
  refreshKey: number;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

export function Cook({ db, shippie, refreshKey, onChanged, onToast }: CookProps): ReactElement {
  const [method, setMethod] = useState<CookMethod>('sous-vide');
  const [internalTemp, setInternalTemp] = useState<string>('');
  const [label, setLabel] = useState('');
  const [active, setActive] = useState<Meal | null>(null);
  const [recent, setRecent] = useState<Meal[]>([]);

  const profile = useMemo(() => getMethodProfile(method), [method]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listMeals(db, 8);
      if (cancelled) return;
      setRecent(list);
      const inFlight = list.find((m) => !m.ended_at);
      if (inFlight) {
        setActive(inFlight);
        setMethod(inFlight.method);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  // When the method changes, prefill internal temp with the default
  // (only if the new method actually wants one).
  useEffect(() => {
    if (profile.wantsInternalTemp && profile.defaultTempC !== null && !internalTemp) {
      setInternalTemp(String(profile.defaultTempC));
    }
    if (!profile.wantsInternalTemp) setInternalTemp('');
  }, [profile, internalTemp]);

  const tempNum = useMemo(() => {
    const n = Number(internalTemp);
    return Number.isFinite(n) && internalTemp !== '' ? n : null;
  }, [internalTemp]);

  async function cookingNow() {
    if (active) {
      onToast('A cook is already running. Mark it cooked first.');
      return;
    }
    const meal = await startMeal(db, {
      method,
      internal_temp: tempNum,
      label: label.trim() || null,
    });
    setActive(meal);
    onChanged();
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('cooking-now', [
      {
        method: meal.method,
        label: meal.label ?? null,
        started_at: meal.started_at,
      },
    ]);
    onToast('Cook started.');
  }

  async function cookedMeal() {
    if (!active) {
      onToast('Start a cook first.');
      return;
    }
    const cookedAt = new Date().toISOString();
    await endMeal(db, active.id);
    shippie.feel.texture('milestone');
    shippie.intent.broadcast('cooked-meal', [
      {
        method: active.method,
        label: active.label ?? null,
        cooked_at: cookedAt,
      },
    ]);
    setActive(null);
    setLabel('');
    onChanged();
    onToast('Cooked. Rest before slicing.');
  }

  return (
    <section className="page mode-page">
      <header className="page-header">
        <h2>Cook</h2>
        <span className="eyebrow">{COOK_METHOD_LABEL[method]}</span>
      </header>

      <div className="card">
        <div className="card-label">Method</div>
        <div className="method-grid">
          {COOK_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              className={`method-pill ${method === m ? 'method-pill-active' : ''}`}
              onClick={() => setMethod(m)}
              aria-pressed={method === m}
              disabled={active !== null}
            >
              {COOK_METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-label">Inputs</div>
        <div className="field">
          <label htmlFor="cook-label">Label (optional)</label>
          <input
            id="cook-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Ribeye, brisket, eggs"
          />
        </div>
        {profile.wantsInternalTemp ? (
          <div className="field">
            <label htmlFor="internal-temp">
              Target internal temp (°C)
            </label>
            <input
              id="internal-temp"
              type="number"
              min={20}
              max={120}
              step={0.5}
              value={internalTemp}
              onChange={(e) => setInternalTemp(e.target.value)}
            />
          </div>
        ) : null}
        <ul className="guidance-list">
          {profile.guidance.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        {tempNum !== null ? (
          <div className="progress-line">{describeProgress(method, tempNum)}</div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-label">Timer</div>
        <SimpleTimer hint={profile.hint} />
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary big"
          onClick={cookingNow}
          disabled={active !== null}
        >
          Cooking now
        </button>
        <button
          type="button"
          className="big"
          onClick={cookedMeal}
          disabled={active === null}
        >
          Cooked
        </button>
      </div>

      {recent.length > 0 ? (
        <div className="card">
          <div className="card-label">Recent cooks</div>
          <ul className="recent-list" role="list">
            {recent.slice(0, 5).map((m) => (
              <li key={m.id} className="recent-row">
                <span>
                  {COOK_METHOD_LABEL[m.method]}
                  {m.label ? ` · ${m.label}` : ''}
                </span>
                <span className="recent-meta">
                  {m.ended_at
                    ? `cooked ${new Date(m.ended_at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : 'in progress'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
