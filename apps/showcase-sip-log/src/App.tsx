import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  PRESETS,
  dayKey,
  load,
  newId,
  pruneOld,
  save,
  todayKey,
  type Sip,
  type SipKind,
} from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_sip_log' });

const HYDRATION_TARGET_ML = 2000; // 8 × 250ml
const CAFFEINE_LIMIT_MG = 400;

interface ShippieRoot {
  openYourData?: () => void;
}

export function App() {
  const initial = load();
  const [sips, setSips] = useState<Sip[]>(initial.sips);
  const [customOpen, setCustomOpen] = useState<SipKind | null>(null);

  // Persist on every change. Prune-old happens here so localStorage
  // doesn't grow unbounded.
  useEffect(() => {
    save({ sips });
  }, [sips]);

  function logSip(kind: SipKind, ml?: number, mg?: number) {
    const preset = PRESETS[kind];
    const sip: Sip = {
      id: newId(),
      kind,
      ml: ml ?? preset.ml,
      mg: mg ?? preset.mg,
      logged_at: new Date().toISOString(),
    };
    setSips((prev) => pruneOld([sip, ...prev]));
    shippie.feel.texture('confirm');
    // Broadcast both intents — sleep-logger consumes caffeine-logged,
    // daily-briefing consumes hydration-logged.
    if (sip.ml > 0) {
      shippie.intent.broadcast('hydration-logged', [
        { ml: sip.ml, kind: sip.kind, logged_at: sip.logged_at },
      ]);
    }
    if (sip.mg > 0) {
      shippie.intent.broadcast('caffeine-logged', [
        { mg: sip.mg, kind: sip.kind, logged_at: sip.logged_at },
      ]);
    }
  }

  function undoLast() {
    setSips((prev) => prev.slice(1));
    shippie.feel.texture('delete');
  }

  // Today's totals
  const today = todayKey();
  const todaySips = useMemo(
    () => sips.filter((s) => dayKey(s.logged_at) === today),
    [sips, today],
  );
  const totalMl = todaySips.reduce((sum, s) => sum + s.ml, 0);
  const totalMg = todaySips.reduce((sum, s) => sum + s.mg, 0);
  const hydrationPct = Math.min(100, Math.round((totalMl / HYDRATION_TARGET_ML) * 100));
  const caffeineNearLimit = totalMg >= CAFFEINE_LIMIT_MG * 0.75;
  const caffeineOver = totalMg > CAFFEINE_LIMIT_MG;

  // 7-day chart
  const last7 = useMemo(() => {
    const days: Array<{ key: string; ml: number; mg: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayRows = sips.filter((s) => dayKey(s.logged_at) === key);
      days.push({
        key,
        ml: dayRows.reduce((s, r) => s + r.ml, 0),
        mg: dayRows.reduce((s, r) => s + r.mg, 0),
      });
    }
    return days;
  }, [sips]);

  const maxMl = Math.max(HYDRATION_TARGET_ML, ...last7.map((d) => d.ml));

  function openYourData() {
    if (typeof window === 'undefined') return;
    const root = (window as unknown as { shippie?: ShippieRoot }).shippie;
    if (typeof root?.openYourData === 'function') root.openYourData();
    else window.open('/__shippie/data', '_blank', 'noopener');
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Sip Log</h1>
        <p className="subtitle">water · coffee · tea</p>
      </header>

      <section className="totals">
        <div className="total">
          <p className="eyebrow">today · hydration</p>
          <p className="big">
            {totalMl}
            <span className="unit">ml</span>
          </p>
          <div className="bar" aria-label={`${hydrationPct}% of daily target`}>
            <div className="bar-fill bar-fill-water" style={{ width: `${hydrationPct}%` }} />
          </div>
          <p className="small muted">
            {hydrationPct}% of {HYDRATION_TARGET_ML}ml
          </p>
        </div>

        <div className="total">
          <p className="eyebrow">today · caffeine</p>
          <p className={`big ${caffeineOver ? 'big-warn' : ''}`}>
            {totalMg}
            <span className="unit">mg</span>
          </p>
          <p className={`small ${caffeineOver ? 'over' : caffeineNearLimit ? 'near' : 'muted'}`}>
            {caffeineOver
              ? `over the typical ${CAFFEINE_LIMIT_MG}mg ceiling`
              : caffeineNearLimit
                ? `nearing the ${CAFFEINE_LIMIT_MG}mg ceiling`
                : `well under ${CAFFEINE_LIMIT_MG}mg`}
          </p>
        </div>
      </section>

      <section className="actions">
        {(['water', 'coffee', 'tea'] as const).map((kind) => {
          const p = PRESETS[kind];
          return (
            <button
              key={kind}
              type="button"
              className={`tap-btn tap-${kind}`}
              onClick={() => logSip(kind)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCustomOpen(kind);
              }}
              aria-label={`Log ${p.label} (${p.ml}ml${p.mg ? `, ${p.mg}mg caffeine` : ''}). Long-press for custom.`}
            >
              <span className="tap-emoji" aria-hidden="true">{p.emoji}</span>
              <span className="tap-label">{p.label}</span>
              <span className="tap-meta">
                {p.ml}ml{p.mg > 0 ? ` · ${p.mg}mg` : ''}
              </span>
            </button>
          );
        })}
      </section>

      {todaySips.length > 0 ? (
        <p className="small muted center">
          last sip {new Date(todaySips[0]!.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
          ·{' '}
          <button type="button" className="undo" onClick={undoLast}>
            undo last
          </button>
        </p>
      ) : (
        <p className="small muted center">tap a button above to log your first sip</p>
      )}

      <section className="chart">
        <p className="eyebrow">last 7 days</p>
        <div className="bars">
          {last7.map((d) => {
            const dayLabel = new Date(d.key + 'T00:00').toLocaleDateString(undefined, {
              weekday: 'short',
            });
            const h = Math.max(2, Math.round((d.ml / maxMl) * 100));
            return (
              <div key={d.key} className="day">
                <div className="day-bar-track">
                  <div className="day-bar" style={{ height: `${h}%` }} title={`${d.ml}ml · ${d.mg}mg`} />
                </div>
                <p className="day-label">{dayLabel}</p>
              </div>
            );
          })}
        </div>
      </section>

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>

      {customOpen ? (
        <CustomSheet
          kind={customOpen}
          onClose={() => setCustomOpen(null)}
          onSubmit={(ml, mg) => {
            logSip(customOpen, ml, mg);
            setCustomOpen(null);
          }}
        />
      ) : null}
    </main>
  );
}

interface CustomSheetProps {
  kind: SipKind;
  onClose: () => void;
  onSubmit: (ml: number, mg: number) => void;
}

function CustomSheet({ kind, onClose, onSubmit }: CustomSheetProps) {
  const preset = PRESETS[kind];
  const [ml, setMl] = useState(preset.ml);
  const [mg, setMg] = useState(preset.mg);
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>
          Custom {preset.emoji} {preset.label}
        </h2>
        <label className="field">
          <span>volume (ml)</span>
          <input
            type="number"
            min={0}
            max={2000}
            step={10}
            value={ml}
            onChange={(e) => setMl(Number(e.target.value) || 0)}
          />
        </label>
        {kind !== 'water' ? (
          <label className="field">
            <span>caffeine (mg)</span>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              value={mg}
              onChange={(e) => setMg(Number(e.target.value) || 0)}
            />
          </label>
        ) : null}
        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onSubmit(ml, mg)}>
            Log it
          </button>
        </div>
      </div>
    </div>
  );
}
