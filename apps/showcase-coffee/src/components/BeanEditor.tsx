import { useState } from 'react';
import {
  METHOD_DEFAULTS,
  METHOD_LABEL,
  PROCESS_LABEL,
  RATIO_RANGE,
  modeForMethod,
  newId,
  todayIso,
  type Bean,
  type BrewMethod,
  type Process,
  type RoastLevel,
} from '../db.ts';
import { METHODS, PROCESSES, ROAST_LEVELS } from '../lib/options.ts';
import { TastingChips } from './TastingChips.tsx';

interface BeanEditorProps {
  bean: Bean | null;
  onSave: (b: Bean) => void;
  onCancel: () => void;
  onDelete: (() => void) | null;
}

export function BeanEditor({ bean, onSave, onCancel, onDelete }: BeanEditorProps) {
  const [name, setName] = useState(bean?.name ?? '');
  const [roaster, setRoaster] = useState(bean?.roaster ?? '');
  const [origin, setOrigin] = useState(bean?.origin ?? '');
  const [process, setProcess] = useState<Process | ''>(bean?.process ?? '');
  const [roast, setRoast] = useState<RoastLevel>(bean?.roast ?? 'medium');
  const [roastDate, setRoastDate] = useState(bean?.roast_date ?? '');
  const [cuppingScore, setCuppingScore] = useState<string>(
    bean?.cupping_score !== undefined ? String(bean.cupping_score) : '',
  );
  const [grind, setGrind] = useState(bean?.grind ?? '');
  const [method, setMethod] = useState<BrewMethod>(bean?.method ?? 'v60');
  const [ratio, setRatio] = useState<number>(bean?.ratio ?? METHOD_DEFAULTS['v60'].ratio);
  const [notes, setNotes] = useState(bean?.notes ?? '');
  const [photoUrl, setPhotoUrl] = useState(bean?.photo_url ?? '');

  const isNew = bean === null;
  const range = RATIO_RANGE[modeForMethod(method)];

  function commit() {
    if (!name.trim()) return;
    const score = cuppingScore ? Math.max(1, Math.min(100, Number(cuppingScore))) : undefined;
    onSave({
      id: bean?.id ?? newId('bean'),
      name: name.trim(),
      roaster: roaster.trim() || undefined,
      origin: origin.trim() || undefined,
      process: process || undefined,
      roast,
      roast_date: roastDate || undefined,
      cupping_score: Number.isFinite(score) ? score : undefined,
      grind: grind.trim(),
      method,
      ratio,
      notes: notes.trim() || undefined,
      photo_url: photoUrl.trim() || undefined,
      created_at: bean?.created_at ?? new Date().toISOString(),
    });
  }

  return (
    <div
      className={isNew ? 'sheet-overlay' : 'editor inline'}
      onClick={isNew ? onCancel : undefined}
    >
      <div
        className={isNew ? 'sheet' : 'editor-card'}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{isNew ? 'New bean' : 'Edit bean'}</h2>

        <label className="field">
          <span>name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cult of Done"
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>roaster</span>
            <input value={roaster} onChange={(e) => setRoaster(e.target.value)} />
          </label>
          <label className="field">
            <span>roast date</span>
            <input
              type="date"
              value={roastDate}
              max={todayIso()}
              onChange={(e) => setRoastDate(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>origin</span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Ethiopia · Yirgacheffe / Konga"
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>process</span>
            <select
              value={process}
              onChange={(e) => setProcess(e.target.value as Process | '')}
            >
              <option value="">—</option>
              {PROCESSES.map((p) => (
                <option key={p} value={p}>
                  {PROCESS_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>roast level</span>
            <select value={roast} onChange={(e) => setRoast(e.target.value as RoastLevel)}>
              {ROAST_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>method</span>
            <select
              value={method}
              onChange={(e) => {
                const next = e.target.value as BrewMethod;
                setMethod(next);
                const r = RATIO_RANGE[modeForMethod(next)];
                if (ratio < r.min || ratio > r.max) setRatio(METHOD_DEFAULTS[next].ratio);
              }}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>cupping (1–100)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={cuppingScore}
              onChange={(e) => setCuppingScore(e.target.value)}
              placeholder="optional"
            />
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
            min={range.min}
            max={range.max}
            step={range.step}
            value={ratio}
            onChange={(e) => setRatio(Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>tasting notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="cocoa, plum, soft acidity"
          />
          <TastingChips value={notes} onAppend={setNotes} />
        </label>

        <label className="field">
          <span>photo URL (optional)</span>
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://…"
          />
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
