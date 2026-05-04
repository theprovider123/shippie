import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  CUTS,
  DONENESS_LABEL,
  DONENESS_TEMP_C,
  METHOD_LABEL,
  computeCookMinutes,
  formatDuration,
  type Cut,
  type Doneness,
  type Method,
} from './data.ts';
import { load, newId, save, type Cook } from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_cooking' });

interface ShippieRoot {
  openYourData?: () => void;
}

const DONENESS_ORDER: Doneness[] = [
  'rare',
  'med-rare',
  'medium',
  'med-well',
  'well-done',
];

export function App() {
  const initial = load();
  const [cooks, setCooks] = useState<Cook[]>(initial.cooks);
  const [cutId, setCutId] = useState<string>(CUTS[0]?.id ?? '');
  const [method, setMethod] = useState<Method>(CUTS[0]?.methods[0] ?? 'pan');
  const [doneness, setDoneness] = useState<Doneness>(
    CUTS[0]?.defaultDoneness ?? 'med-rare',
  );
  const [weightKg, setWeightKg] = useState<number>(1);
  const [activeCookId, setActiveCookId] = useState<string | null>(null);

  useEffect(() => {
    save({ cooks });
  }, [cooks]);

  const cut = CUTS.find((c) => c.id === cutId) ?? CUTS[0]!;
  const supportedMethods = cut.methods;
  const effectiveMethod: Method = supportedMethods.includes(method)
    ? method
    : supportedMethods[0]!;
  const timing = cut.timing[effectiveMethod];
  const usesWeight = !!timing?.minutes_per_kg;

  const targetTempC = useMemo(() => {
    // Cut+method override > doneness > undefined
    if (timing?.target_temp_c) return timing.target_temp_c;
    if (cut.donenessApplies) return DONENESS_TEMP_C[doneness];
    return null;
  }, [cut, timing, doneness]);

  const cookMinutes = useMemo(
    () => computeCookMinutes(cut, effectiveMethod, usesWeight ? weightKg : null),
    [cut, effectiveMethod, usesWeight, weightKg],
  );

  const restMinutes = timing?.rest_minutes ?? 0;
  const totalMinutes = (cookMinutes ?? 0) + restMinutes;

  const activeCook = cooks.find((c) => c.id === activeCookId) ?? null;

  function pickCut(c: Cut) {
    setCutId(c.id);
    setMethod(c.methods[0]!);
    if (c.donenessApplies && c.defaultDoneness) setDoneness(c.defaultDoneness);
  }

  function startCook() {
    if (!cookMinutes || !targetTempC) return;
    const cook: Cook = {
      id: newId(),
      cut_id: cut.id,
      cut_name: cut.name,
      method: effectiveMethod,
      doneness: cut.donenessApplies ? doneness : null,
      weight_kg: usesWeight ? weightKg : null,
      target_temp_c: targetTempC,
      cook_minutes: cookMinutes,
      rest_minutes: restMinutes,
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    setCooks((prev) => [cook, ...prev].slice(0, 100));
    setActiveCookId(cook.id);
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('cooking-now', [
      {
        method: cook.method,
        cut: cook.cut_name,
        target_temp_c: cook.target_temp_c,
        weight_kg: cook.weight_kg,
        started_at: cook.started_at,
        est_finish_at: new Date(
          Date.now() + (cook.cook_minutes + cook.rest_minutes) * 60_000,
        ).toISOString(),
      },
    ]);
  }

  function markCooked() {
    if (!activeCook) return;
    const finishedAt = new Date().toISOString();
    setCooks((prev) =>
      prev.map((c) =>
        c.id === activeCook.id ? { ...c, finished_at: finishedAt } : c,
      ),
    );
    setActiveCookId(null);
    shippie.feel.texture('milestone');
    shippie.intent.broadcast('cooked-meal', [
      {
        cut: activeCook.cut_name,
        method: activeCook.method,
        cookedAt: finishedAt,
      },
    ]);
  }

  function cancelCook() {
    setActiveCookId(null);
    if (activeCook) {
      setCooks((prev) => prev.filter((c) => c.id !== activeCook.id));
    }
  }

  function openYourData() {
    if (typeof window === 'undefined') return;
    const root = (window as unknown as { shippie?: ShippieRoot }).shippie;
    if (typeof root?.openYourData === 'function') root.openYourData();
    else window.open('/__shippie/data', '_blank', 'noopener');
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Cooking</h1>
        <p className="subtitle">method · cut · target temp</p>
      </header>

      {/* Cut picker */}
      <section className="cut-grid">
        {CUTS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cut-chip ${c.id === cut.id ? 'active' : ''}`}
            onClick={() => pickCut(c)}
          >
            {c.name}
          </button>
        ))}
      </section>

      {/* Method picker */}
      <section className="method-row">
        {supportedMethods.map((m) => (
          <button
            key={m}
            type="button"
            className={`method-chip ${m === effectiveMethod ? 'active' : ''}`}
            onClick={() => setMethod(m)}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </section>

      {/* Doneness picker */}
      {cut.donenessApplies ? (
        <section className="doneness-row">
          {DONENESS_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              className={`done-chip ${d === doneness ? 'active' : ''}`}
              onClick={() => setDoneness(d)}
            >
              {DONENESS_LABEL[d]}
              <span className="muted small">{DONENESS_TEMP_C[d]}°C</span>
            </button>
          ))}
        </section>
      ) : null}

      {/* Weight (only when method uses minutes_per_kg) */}
      {usesWeight ? (
        <label className="field">
          <span>weight (kg)</span>
          <input
            type="number"
            min={0.2}
            max={10}
            step={0.1}
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value) || 0)}
          />
        </label>
      ) : null}

      {/* Result card */}
      <section className="result">
        <div className="result-row">
          <p className="eyebrow">internal target</p>
          <p className="big">
            {targetTempC ? `${targetTempC}°C` : '—'}
          </p>
        </div>
        {timing?.pit_temp_c ? (
          <div className="result-row">
            <p className="eyebrow">{effectiveMethod === 'roast' ? 'oven' : 'pit'}</p>
            <p className="big">{timing.pit_temp_c}°C</p>
          </div>
        ) : null}
        <div className="result-row">
          <p className="eyebrow">cook</p>
          <p className="big">{cookMinutes ? formatDuration(cookMinutes) : '—'}</p>
        </div>
        {restMinutes > 0 ? (
          <div className="result-row">
            <p className="eyebrow">rest</p>
            <p className="big">{formatDuration(restMinutes)}</p>
          </div>
        ) : null}
        <div className="result-row total">
          <p className="eyebrow">total</p>
          <p className="big">{totalMinutes ? formatDuration(totalMinutes) : '—'}</p>
        </div>
        {timing?.note ? (
          <p className="note">
            <span className="eyebrow">note</span>
            {' '}
            {timing.note}
          </p>
        ) : null}
      </section>

      {/* Active cook controls */}
      {activeCook ? (
        <section className="active">
          <p className="eyebrow">cooking now</p>
          <p className="active-line">
            <strong>{activeCook.cut_name}</strong>
            {' '}· {METHOD_LABEL[activeCook.method]}
            {activeCook.doneness ? ` · ${activeCook.doneness}` : ''}
          </p>
          <p className="muted small">
            target {activeCook.target_temp_c}°C ·{' '}
            est. ready{' '}
            {new Date(
              new Date(activeCook.started_at).getTime() +
                (activeCook.cook_minutes + activeCook.rest_minutes) * 60_000,
            ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="active-actions">
            <button type="button" className="primary" onClick={markCooked}>
              Mark cooked
            </button>
            <button type="button" className="ghost" onClick={cancelCook}>
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="primary start-cook"
          onClick={startCook}
          disabled={!cookMinutes || !targetTempC}
        >
          Start cook
        </button>
      )}

      {/* Recent cooks */}
      {cooks.length > 0 ? (
        <section className="log">
          <p className="eyebrow">recent</p>
          <ul>
            {cooks
              .filter((c) => c.id !== activeCookId)
              .slice(0, 6)
              .map((c) => (
                <li key={c.id}>
                  <div className="log-line">
                    <strong>{c.cut_name}</strong>
                    <span className="muted small">
                      {METHOD_LABEL[c.method]}
                      {c.doneness ? ` · ${c.doneness}` : ''}
                    </span>
                  </div>
                  <p className="muted small">
                    {c.finished_at
                      ? `finished ${new Date(c.finished_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'in progress'}
                  </p>
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
