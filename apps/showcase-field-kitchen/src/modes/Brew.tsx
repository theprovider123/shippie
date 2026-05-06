import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { SimpleTimer } from '../components/SimpleTimer.tsx';
import {
  createBean,
  deleteBean,
  listBeans,
  listBrews,
  logBrew,
} from '../db/queries.ts';
import type { Bean, Brew as BrewRow } from '../db/schema.ts';
import { APPROX_CAFFEINE_MG } from '../intents.ts';
import {
  buildBrewSettings,
  clampCoffee,
  clampRatio,
  RATIO_MAX,
  RATIO_MIN,
} from '../lib/ratio.ts';

interface BrewProps {
  db: ShippieLocalDb;
  shippie: ShippieIframeSdk;
  refreshKey: number;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

export function Brew({ db, shippie, refreshKey, onChanged, onToast }: BrewProps): ReactElement {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [brews, setBrews] = useState<BrewRow[]>([]);
  const [selectedBeanId, setSelectedBeanId] = useState<string | null>(null);
  const [coffeeG, setCoffeeG] = useState(15);
  const [ratio, setRatio] = useState(16);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ name: '', roast_date: '', origin: '', notes: '' });

  // Reload beans/brews when something changed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, br] = await Promise.all([listBeans(db), listBrews(db, 10)]);
      if (cancelled) return;
      setBeans(b);
      setBrews(br);
      if (selectedBeanId === null && b[0]) setSelectedBeanId(b[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey, selectedBeanId]);

  const settings = useMemo(() => buildBrewSettings(coffeeG, ratio), [coffeeG, ratio]);
  const selectedBean = beans.find((b) => b.id === selectedBeanId) ?? null;

  async function addBean() {
    const name = draft.name.trim();
    if (!name) {
      onToast('Give the bean a name first.');
      return;
    }
    const bean = await createBean(db, {
      name,
      roast_date: draft.roast_date || null,
      origin: draft.origin || null,
      notes: draft.notes || null,
    });
    setSelectedBeanId(bean.id);
    setDraft({ name: '', roast_date: '', origin: '', notes: '' });
    setComposing(false);
    onChanged();
    shippie.feel.texture('confirm');
  }

  async function removeBean(id: string) {
    await deleteBean(db, id);
    if (selectedBeanId === id) setSelectedBeanId(null);
    onChanged();
  }

  async function justBrewed() {
    const brewedAt = new Date().toISOString();
    const brew = await logBrew(db, {
      ratio: settings.ratio,
      water_g: settings.water_g,
      coffee_g: settings.coffee_g,
      bean_id: selectedBean?.id ?? null,
      bean_name: selectedBean?.name ?? null,
      brewed_at: brewedAt,
    });
    setBrews((prev) => [brew, ...prev].slice(0, 10));
    onChanged();
    shippie.feel.texture('milestone');

    shippie.intent.broadcast('coffee-brewed', [
      {
        ratio: brew.ratio,
        water_g: brew.water_g,
        coffee_g: brew.coffee_g,
        bean_name: brew.bean_name ?? null,
        brewed_at: brew.brewed_at,
      },
    ]);
    shippie.intent.broadcast('caffeine-logged', [
      {
        kind: 'coffee',
        mg: Math.round(brew.coffee_g * (APPROX_CAFFEINE_MG.coffee / 15)),
        logged_at: brew.brewed_at,
      },
    ]);
    onToast('Brew logged.');
  }

  return (
    <section className="page mode-page">
      <header className="page-header">
        <h2>Brew</h2>
        <span className="eyebrow">{settings.water_g}g water · {settings.coffee_g}g coffee</span>
      </header>

      {/* Ratio dial */}
      <div className="card">
        <label className="card-label" htmlFor="ratio-input">Ratio (water / coffee)</label>
        <div className="ratio-row">
          <input
            id="ratio-input"
            type="range"
            min={RATIO_MIN}
            max={RATIO_MAX}
            step={0.5}
            value={ratio}
            onChange={(e) => setRatio(clampRatio(e.target.value))}
            aria-label="Brew ratio"
          />
          <div className="ratio-display">1 : {ratio}</div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="coffee-g">Coffee (g)</label>
            <input
              id="coffee-g"
              type="number"
              min={1}
              max={100}
              value={coffeeG}
              onChange={(e) => setCoffeeG(clampCoffee(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Water (g)</label>
            <div className="readout">{settings.water_g}</div>
          </div>
        </div>
      </div>

      {/* Brew timer */}
      <div className="card">
        <div className="card-label">Timer</div>
        <SimpleTimer hint="Most pourovers wrap up between 02:30 and 04:00." />
      </div>

      {/* I just brewed */}
      <div className="actions">
        <button type="button" className="primary big" onClick={justBrewed}>
          I just brewed
        </button>
      </div>

      {/* Bean library */}
      <div className="card">
        <div className="card-header">
          <span className="card-label">Beans</span>
          <button
            type="button"
            className="ghost small"
            onClick={() => setComposing((v) => !v)}
            aria-expanded={composing}
          >
            {composing ? 'Cancel' : 'Add bean'}
          </button>
        </div>

        {composing ? (
          <div className="bean-form">
            <div className="field">
              <label htmlFor="bean-name">Name</label>
              <input
                id="bean-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Heart Roasters Stereo"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="bean-roast">Roast date</label>
                <input
                  id="bean-roast"
                  type="date"
                  value={draft.roast_date}
                  onChange={(e) => setDraft({ ...draft, roast_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="bean-origin">Origin</label>
                <input
                  id="bean-origin"
                  value={draft.origin}
                  onChange={(e) => setDraft({ ...draft, origin: e.target.value })}
                  placeholder="Ethiopia, washed"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="bean-notes">Notes</label>
              <input
                id="bean-notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Stone fruit, jasmine"
              />
            </div>
            <div className="actions">
              <button type="button" className="primary" onClick={addBean}>
                Save bean
              </button>
            </div>
          </div>
        ) : null}

        {beans.length === 0 ? (
          <div className="empty-state">No beans yet — add one above.</div>
        ) : (
          <ul className="bean-list" role="list">
            {beans.map((b) => (
              <li
                key={b.id}
                className={`bean-row ${selectedBeanId === b.id ? 'bean-row-selected' : ''}`}
              >
                <button
                  type="button"
                  className="bean-pick"
                  onClick={() => setSelectedBeanId(b.id)}
                  aria-pressed={selectedBeanId === b.id}
                >
                  <span className="bean-name">{b.name}</span>
                  <span className="bean-meta">
                    {b.origin ? b.origin : '—'}
                    {b.roast_date ? ` · roast ${b.roast_date}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="bean-remove"
                  onClick={() => removeBean(b.id)}
                  aria-label={`Remove ${b.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {brews.length > 0 ? (
        <div className="card">
          <div className="card-label">Recent brews</div>
          <ul className="recent-list" role="list">
            {brews.slice(0, 5).map((b) => (
              <li key={b.id} className="recent-row">
                <span>{b.bean_name ?? 'Unsaved bean'}</span>
                <span className="recent-meta">
                  {b.coffee_g}g · 1:{b.ratio} · {new Date(b.brewed_at).toLocaleTimeString([], {
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
