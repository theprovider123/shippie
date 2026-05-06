/**
 * One row in the recent-sips list with edit + remove affordances.
 *
 * The row is tap-to-expand; expanded reveals a small inline editor for
 * time + amounts, plus a delete button. We avoid a long-press gesture
 * because hover devices and screen readers can't fire it reliably; tap
 * the row to expand is universally usable.
 */
import { useState } from 'react';
import type { Sip } from '../db.ts';
import { PRESETS } from '../db.ts';

interface DrinkRowProps {
  sip: Sip;
  onUpdate: (id: string, patch: Partial<Omit<Sip, 'id'>>) => void;
  onRemove: (id: string) => void;
}

export function DrinkRow({ sip, onUpdate, onRemove }: DrinkRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [ml, setMl] = useState(sip.ml);
  const [mg, setMg] = useState(sip.mg);
  const [time, setTime] = useState(toLocalInputTime(sip.logged_at));
  const preset = PRESETS[sip.kind];
  const t = new Date(sip.logged_at);
  const display = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  function commit() {
    const next: Partial<Omit<Sip, 'id'>> = { ml, mg };
    const fromInput = fromLocalInputTime(time, sip.logged_at);
    if (fromInput) next.logged_at = fromInput;
    onUpdate(sip.id, next);
    setExpanded(false);
  }

  return (
    <li className={`drink-row ${expanded ? 'drink-row-open' : ''}`}>
      <button
        type="button"
        className="drink-summary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="drink-emoji" aria-hidden="true">{preset.emoji}</span>
        <span className="drink-text">
          <span className="drink-label">{preset.label}</span>
          <span className="drink-meta">
            {display} · {sip.ml}ml{sip.mg ? ` · ${sip.mg}mg` : ''}
          </span>
        </span>
        <span className="drink-chev" aria-hidden="true">{expanded ? '−' : '⋯'}</span>
      </button>
      {expanded ? (
        <div className="drink-editor">
          <label className="field">
            <span>time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
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
          {sip.kind !== 'water' ? (
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
          <div className="drink-actions">
            <button type="button" className="ghost" onClick={() => onRemove(sip.id)}>
              Remove
            </button>
            <button type="button" className="primary" onClick={commit}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function toLocalInputTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function fromLocalInputTime(hhmm: string, anchorIso: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const anchor = new Date(anchorIso);
  const next = new Date(anchor);
  next.setHours(h, m, 0, 0);
  return next.toISOString();
}
