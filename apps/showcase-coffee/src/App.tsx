import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  load,
  newId,
  round1,
  save,
  METHOD_LABEL,
  METHOD_DEFAULTS,
  MG_PER_GRAM,
  type Bean,
  type Brew,
  type BrewMethod,
  type RoastLevel,
} from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_coffee' });

interface ShippieRoot {
  openYourData?: () => void;
}

const ROAST_LEVELS: ReadonlyArray<RoastLevel> = ['light', 'medium', 'dark'];
const METHODS: ReadonlyArray<BrewMethod> = [
  'v60',
  'aeropress',
  'chemex',
  'french-press',
  'espresso',
];

export function App() {
  const initial = load();
  const [beans, setBeans] = useState<Bean[]>(initial.beans);
  const [brews, setBrews] = useState<Brew[]>(initial.brews);
  const [selectedBeanId, setSelectedBeanId] = useState<string | null>(
    initial.beans[0]?.id ?? null,
  );
  const [weightG, setWeightG] = useState<number>(initial.beans[0]?.method === 'espresso' ? 18 : 15);
  const [ratio, setRatio] = useState<number>(initial.beans[0]?.ratio ?? 16);
  const [method, setMethod] = useState<BrewMethod>(initial.beans[0]?.method ?? 'v60');
  const [editing, setEditing] = useState<boolean>(false);
  const [composing, setComposing] = useState<boolean>(false);

  // Brew timer
  const [brewing, setBrewing] = useState<boolean>(false);
  const [seconds, setSeconds] = useState<number>(0);
  const [brewedNotes, setBrewedNotes] = useState<{ brewSeconds: number; weightG: number; ratio: number; method: BrewMethod } | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    save({ beans, brews });
  }, [beans, brews]);

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

  const selectedBean = beans.find((b) => b.id === selectedBeanId) ?? null;
  const waterG = round1(weightG * ratio);
  const targetSec = METHOD_DEFAULTS[method].seconds;
  const overTime = seconds > targetSec;

  function selectBean(b: Bean) {
    setSelectedBeanId(b.id);
    setRatio(b.ratio);
    setMethod(b.method);
    setWeightG(b.method === 'espresso' ? 18 : 15);
    setEditing(false);
  }

  function startBrew() {
    setSeconds(0);
    setBrewing(true);
    shippie.feel.texture('confirm');
  }

  function finishBrew() {
    setBrewing(false);
    const brew: Brew = {
      id: newId('brew'),
      bean_id: selectedBean?.id ?? null,
      bean_name: selectedBean?.name ?? 'unsaved bean',
      weight_g: weightG,
      water_g: waterG,
      ratio,
      method,
      brew_seconds: seconds,
      taste_rating: null,
      brewed_at: new Date().toISOString(),
    };
    setBrews((prev) => [brew, ...prev].slice(0, 200));
    setBrewedNotes({ brewSeconds: seconds, weightG, ratio, method });
    shippie.feel.texture('milestone');
    // Intent broadcasts: coffee-brewed (rich payload) and caffeine-logged
    // (drink-shaped, so sleep-logger and daily-briefing pick it up).
    shippie.intent.broadcast('coffee-brewed', [
      {
        bean_id: brew.bean_id,
        bean_name: brew.bean_name,
        weight_g: brew.weight_g,
        water_g: brew.water_g,
        ratio: brew.ratio,
        method: brew.method,
        brew_seconds: brew.brew_seconds,
        brewed_at: brew.brewed_at,
      },
    ]);
    const mg = Math.round(weightG * MG_PER_GRAM[method]);
    shippie.intent.broadcast('caffeine-logged', [
      {
        kind: 'coffee',
        method,
        mg,
        bean_name: brew.bean_name,
        logged_at: brew.brewed_at,
      },
    ]);
  }

  function cancelBrew() {
    setBrewing(false);
    setSeconds(0);
  }

  function rateLastBrew(rating: number) {
    setBrews((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...rest] = prev;
      if (!head) return prev;
      return [{ ...head, taste_rating: rating }, ...rest];
    });
    setBrewedNotes(null);
    shippie.feel.texture('confirm');
  }

  function deleteBean(id: string) {
    setBeans((prev) => prev.filter((b) => b.id !== id));
    if (selectedBeanId === id) {
      const next = beans.find((b) => b.id !== id) ?? null;
      setSelectedBeanId(next?.id ?? null);
    }
  }

  function saveBean(b: Bean) {
    setBeans((prev) => {
      const existing = prev.findIndex((x) => x.id === b.id);
      if (existing >= 0) {
        const out = [...prev];
        out[existing] = b;
        return out;
      }
      return [b, ...prev];
    });
    setSelectedBeanId(b.id);
    setEditing(false);
    setComposing(false);
  }

  function openYourData() {
    if (typeof window === 'undefined') return;
    const root = (window as unknown as { shippie?: ShippieRoot }).shippie;
    if (typeof root?.openYourData === 'function') root.openYourData();
    else window.open('/__shippie/data', '_blank', 'noopener');
  }

  const recentBrews = useMemo(() => brews.slice(0, 6), [brews]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>Coffee</h1>
        <p className="subtitle">ratio · grind · brew</p>
      </header>

      {/* Bean strip */}
      <section className="strip" aria-label="Saved beans">
        {beans.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`bean-chip ${b.id === selectedBeanId ? 'active' : ''}`}
            onClick={() => selectBean(b)}
            title={b.notes ?? ''}
          >
            <span className="bean-name">{b.name}</span>
            <span className="bean-meta">
              {METHOD_LABEL[b.method]} · 1:{b.ratio}
            </span>
          </button>
        ))}
        <button
          type="button"
          className="bean-chip new"
          onClick={() => setComposing(true)}
        >
          <span className="bean-name">+ New</span>
          <span className="bean-meta">add bean</span>
        </button>
      </section>

      {/* Ratio dial */}
      <section className="dial">
        <div className="dial-row">
          <label className="dial-label">
            <span>Beans</span>
            <input
              type="number"
              min={5}
              max={50}
              step={0.5}
              value={weightG}
              onChange={(e) => setWeightG(Number(e.target.value) || 0)}
            />
            <span className="unit">g</span>
          </label>
          <span className="dial-arrow">→</span>
          <label className="dial-label">
            <span>Water</span>
            <output className="big">{waterG}</output>
            <span className="unit">g</span>
          </label>
        </div>
        <label className="dial-label dial-label-row">
          <span>Ratio 1:{ratio}</span>
          <input
            type="range"
            min={method === 'espresso' ? 1.5 : 12}
            max={method === 'espresso' ? 3 : 20}
            step={method === 'espresso' ? 0.1 : 0.5}
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
          />
        </label>

        {/* Method picker */}
        <div className="method-row">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              className={`method-chip ${m === method ? 'active' : ''}`}
              onClick={() => {
                setMethod(m);
                if (!selectedBean || selectedBean.method !== m) {
                  setRatio(METHOD_DEFAULTS[m].ratio);
                }
              }}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>

        {/* Bean detail */}
        {selectedBean ? (
          <div className="bean-detail">
            {editing ? (
              <BeanEditor
                bean={selectedBean}
                onSave={saveBean}
                onCancel={() => setEditing(false)}
                onDelete={() => deleteBean(selectedBean.id)}
              />
            ) : (
              <>
                <div className="bean-detail-row">
                  <span className="eyebrow">grind</span>
                  <span className="bean-detail-value">{selectedBean.grind || '—'}</span>
                </div>
                <div className="bean-detail-row">
                  <span className="eyebrow">roast</span>
                  <span className="bean-detail-value">{selectedBean.roast}</span>
                </div>
                {selectedBean.roaster ? (
                  <div className="bean-detail-row">
                    <span className="eyebrow">roaster</span>
                    <span className="bean-detail-value">{selectedBean.roaster}</span>
                  </div>
                ) : null}
                {selectedBean.notes ? (
                  <p className="bean-notes">{selectedBean.notes}</p>
                ) : null}
                <button type="button" className="ghost edit" onClick={() => setEditing(true)}>
                  Edit
                </button>
              </>
            )}
          </div>
        ) : null}
      </section>

      {/* Timer */}
      <section className="timer">
        <p className={`time ${overTime ? 'time-over' : ''}`}>
          {Math.floor(seconds / 60)
            .toString()
            .padStart(2, '0')}
          :{(seconds % 60).toString().padStart(2, '0')}
        </p>
        <p className="muted small">
          target {Math.floor(targetSec / 60)}:{(targetSec % 60).toString().padStart(2, '0')} ·{' '}
          {METHOD_LABEL[method]}
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

      {/* Just-finished prompt */}
      {brewedNotes ? (
        <section className="rate">
          <p className="muted small">how was it?</p>
          <div className="rate-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="star"
                onClick={() => rateLastBrew(n)}
                aria-label={`${n} of 5`}
              >
                ★
              </button>
            ))}
          </div>
          <button type="button" className="ghost" onClick={() => setBrewedNotes(null)}>
            Skip
          </button>
        </section>
      ) : null}

      {/* Brews log */}
      {recentBrews.length > 0 ? (
        <section className="log">
          <p className="eyebrow">recent brews</p>
          <ul>
            {recentBrews.map((br) => (
              <li key={br.id}>
                <div className="log-line">
                  <strong>{br.bean_name}</strong>
                  <span className="muted small">
                    {br.weight_g}g · 1:{br.ratio} · {METHOD_LABEL[br.method]}
                  </span>
                </div>
                <div className="log-line muted small">
                  {new Date(br.brewed_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {Math.floor(br.brew_seconds / 60)}:
                  {(br.brew_seconds % 60).toString().padStart(2, '0')}
                  {br.taste_rating ? ` · ${'★'.repeat(br.taste_rating)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>

      {composing ? (
        <BeanEditor
          bean={null}
          onSave={saveBean}
          onCancel={() => setComposing(false)}
          onDelete={null}
        />
      ) : null}
    </main>
  );
}

interface BeanEditorProps {
  bean: Bean | null;
  onSave: (b: Bean) => void;
  onCancel: () => void;
  onDelete: (() => void) | null;
}

function BeanEditor({ bean, onSave, onCancel, onDelete }: BeanEditorProps) {
  const [name, setName] = useState(bean?.name ?? '');
  const [roaster, setRoaster] = useState(bean?.roaster ?? '');
  const [roast, setRoast] = useState<RoastLevel>(bean?.roast ?? 'medium');
  const [grind, setGrind] = useState(bean?.grind ?? '');
  const [method, setMethod] = useState<BrewMethod>(bean?.method ?? 'v60');
  const [ratio, setRatio] = useState<number>(bean?.ratio ?? METHOD_DEFAULTS['v60'].ratio);
  const [notes, setNotes] = useState(bean?.notes ?? '');

  const isNew = bean === null;

  function commit() {
    if (!name.trim()) return;
    onSave({
      id: bean?.id ?? newId('bean'),
      name: name.trim(),
      roaster: roaster.trim() || undefined,
      roast,
      grind: grind.trim(),
      method,
      ratio,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className={isNew ? 'sheet-overlay' : 'editor inline'} onClick={isNew ? onCancel : undefined}>
      <div className={isNew ? 'sheet' : 'editor-card'} onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'New bean' : 'Edit bean'}</h2>
        <label className="field">
          <span>name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Workshop Cult of Done" />
        </label>
        <label className="field">
          <span>roaster (optional)</span>
          <input value={roaster} onChange={(e) => setRoaster(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>roast</span>
            <select value={roast} onChange={(e) => setRoast(e.target.value as RoastLevel)}>
              {ROAST_LEVELS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as BrewMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>grind setting</span>
          <input
            value={grind}
            onChange={(e) => setGrind(e.target.value)}
            placeholder="Comandante 22 / Niche 14"
          />
        </label>
        <label className="field">
          <span>preferred ratio 1:{ratio}</span>
          <input
            type="range"
            min={method === 'espresso' ? 1.5 : 12}
            max={method === 'espresso' ? 3 : 20}
            step={method === 'espresso' ? 0.1 : 0.5}
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>tasting notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
        <div className="sheet-actions">
          {onDelete ? (
            <button type="button" className="ghost danger" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={commit} disabled={!name.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
