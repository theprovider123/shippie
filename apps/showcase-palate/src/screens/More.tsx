// palate. — More instruments (quiet word-list)
// DDT, Convert, Log (bake log), kitchen note

import { useState } from 'react';
import type { Bake, Formula, KitchenNote } from '../lib/types.ts';
import { ddtWaterTemp, VOLUME_TO_GRAMS, OVEN_MAP, SUBSTITUTIONS } from '../lib/engine.ts';
import { newId, saveBakePhoto } from '../lib/store.ts';
import React from 'react';

type MoreView = 'index' | 'ddt' | 'convert' | 'log' | 'note';

interface Props {
  bakes: Bake[];
  formulas: Formula[];
  notes: KitchenNote[];
  tonightsNote: string;
  onAddBake: (b: Bake) => void;
  onNoteChange: (content: string) => void;
  onTonightsNoteChange: (s: string) => void;
}

export function More({ bakes, formulas, notes, tonightsNote, onAddBake, onNoteChange, onTonightsNoteChange }: Props) {
  const [view, setView] = useState<MoreView>('index');

  function back() { setView('index'); }

  if (view === 'ddt') return <DdtScreen onBack={back} />;
  if (view === 'convert') return <ConvertScreen onBack={back} />;
  if (view === 'log') return <LogScreen bakes={bakes} formulas={formulas} onAddBake={onAddBake} onBack={back} />;
  if (view === 'note') return <NoteScreen note={tonightsNote} onChange={onTonightsNoteChange} onBack={back} />;

  return (
    <div className="more-screen">
      <div className="more-header">
        <span className="wordmark">palate.</span>
      </div>
      <div className="more-list">
        <button className="more-row" onClick={() => setView('ddt')}>
          <span className="more-row-name">DDT calculator</span>
          <span className="more-row-hint">desired dough temperature → water temp</span>
        </button>
        <button className="more-row" onClick={() => setView('convert')}>
          <span className="more-row-name">convert & substitute</span>
          <span className="more-row-hint">volume → grams, oven temps, substitutions</span>
        </button>
        <button className="more-row" onClick={() => setView('log')}>
          <span className="more-row-name">bake log</span>
          <span className="more-row-hint">{bakes.length} bake{bakes.length !== 1 ? 's' : ''} recorded</span>
        </button>
        <button className="more-row" onClick={() => setView('note')}>
          <span className="more-row-name">kitchen note</span>
          <span className="more-row-hint">{tonightsNote ? tonightsNote.slice(0, 40) + (tonightsNote.length > 40 ? '…' : '') : 'no note'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── DDT Calculator ───────────────────────────────────────────

function DdtScreen({ onBack }: { onBack: () => void }) {
  const [ddt, setDdt] = useState(24);
  const [room, setRoom] = useState(20);
  const [flour, setFlour] = useState(18);
  const [friction, setFriction] = useState(25);

  const waterTemp = ddtWaterTemp(ddt, room, flour, friction);

  return (
    <div className="more-detail">
      <div className="more-detail-header">
        <button className="back-btn" onClick={onBack}>← back</button>
        <span className="more-detail-title">DDT calculator</span>
      </div>

      <div className="ddt-result">{waterTemp}°C</div>
      <div className="ddt-result-label">water temperature</div>

      <div className="ddt-inputs">
        {[
          { label: 'Desired dough temp', val: ddt, set: setDdt },
          { label: 'Room temp', val: room, set: setRoom },
          { label: 'Flour temp', val: flour, set: setFlour },
          { label: 'Friction (25 spiral, 28 hand)', val: friction, set: setFriction },
        ].map(({ label, val, set }) => (
          <div key={label} className="ddt-input-row">
            <label className="ddt-label">{label}</label>
            <input
              className="ddt-input"
              type="number"
              value={val}
              onChange={(e) => set(parseFloat(e.target.value) || 0)}
            />
            <span className="ddt-unit">°C</span>
          </div>
        ))}
      </div>

      <div className="ddt-formula">
        water = DDT × 3 − room − flour − friction
      </div>
    </div>
  );
}

// ─── Convert & Substitute ─────────────────────────────────────

function ConvertScreen({ onBack }: { onBack: () => void }) {
  const [subSearch, setSubSearch] = useState('');
  const filteredSubs = SUBSTITUTIONS.filter((s) =>
    !subSearch || s.ingredient.toLowerCase().includes(subSearch.toLowerCase())
  );

  return (
    <div className="more-detail">
      <div className="more-detail-header">
        <button className="back-btn" onClick={onBack}>← back</button>
        <span className="more-detail-title">convert & substitute</span>
      </div>

      <div className="convert-section-title">volume → grams</div>
      <div className="convert-table">
        {VOLUME_TO_GRAMS.map((row) => (
          <div key={row.ingredient} className="convert-row">
            <span className="convert-ing">{row.ingredient}</span>
            <span className="convert-val">{row.grams_per_cup} g / cup</span>
          </div>
        ))}
      </div>

      <div className="convert-section-title">oven temperatures</div>
      <div className="convert-table">
        {OVEN_MAP.map((row) => (
          <div key={row.celsius} className="convert-row">
            <span className="convert-ing">{row.celsius}°C</span>
            <span className="convert-val">{row.fan}° fan · {row.fahrenheit}°F · gas {row.gas}</span>
          </div>
        ))}
      </div>

      <div className="convert-section-title">substitutions</div>
      <input
        className="sub-search"
        placeholder="search…"
        value={subSearch}
        onChange={(e) => setSubSearch(e.target.value)}
      />
      <div className="subs-list">
        {filteredSubs.map((s) => (
          <div key={`${s.ingredient}-${s.substitute}`} className="sub-row">
            <div className="sub-ing">{s.ingredient}</div>
            <div className="sub-for">{s.substitute}</div>
            {s.notes && <div className="sub-notes">{s.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bake Log ────────────────────────────────────────────────

interface CrumbDraft {
  formula_id: string;
  rise: number;
  crumb: number;
  crust: number;
  flavour: number;
  ease: number;
  what_changed: string;
  notes: string;
}

function LogScreen({ bakes, formulas, onAddBake, onBack }: {
  bakes: Bake[];
  formulas: Formula[];
  onAddBake: (b: Bake) => void;
  onBack: () => void;
}) {
  const [showEntry, setShowEntry] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);
  const [draft, setDraft] = useState<CrumbDraft>({
    formula_id: formulas[0]?.id ?? '',
    rise: 3, crumb: 3, crust: 3, flavour: 3, ease: 3,
    what_changed: '', notes: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const AXES: Array<{ key: keyof CrumbDraft & ('rise' | 'crumb' | 'crust' | 'flavour' | 'ease'); label: string }> = [
    { key: 'rise', label: 'rise' },
    { key: 'crumb', label: 'crumb' },
    { key: 'crust', label: 'crust' },
    { key: 'flavour', label: 'flavour' },
    { key: 'ease', label: 'ease' },
  ];

  const avg = AXES.reduce((s, a) => s + (draft[a.key] as number), 0) / AXES.length;
  const crumb_score = parseFloat((avg * 2).toFixed(1));

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
  }

  async function submit() {
    const id = newId();
    const bake: Bake = {
      id,
      formula_id: draft.formula_id || undefined,
      baked_at: Date.now(),
      crumb_score,
      rise: draft.rise,
      crumb: draft.crumb,
      crust: draft.crust,
      flavour: draft.flavour,
      ease: draft.ease,
      what_changed: draft.what_changed || undefined,
      notes: draft.notes || undefined,
    };

    if (photoFile) {
      const dataUrl = await fileToJpegDataUrl(photoFile);
      const saved = saveBakePhoto(id, dataUrl);
      if (!saved) setPhotoWarning(true);
    }

    onAddBake(bake);
    setShowEntry(false);
    setPhotoFile(null);
    setDraft({ formula_id: formulas[0]?.id ?? '', rise: 3, crumb: 3, crust: 3, flavour: 3, ease: 3, what_changed: '', notes: '' });
  }

  return (
    <div className="more-detail">
      <div className="more-detail-header">
        <button className="back-btn" onClick={onBack}>← back</button>
        <span className="more-detail-title">bake log</span>
        <button className="add-bake-btn" onClick={() => setShowEntry(true)}>+ bake</button>
      </div>

      {photoWarning && (
        <div className="photo-warn">photo not saved — storage full</div>
      )}

      {showEntry && (
        <div className="bake-entry-sheet">
          <div className="bake-entry-title">new bake</div>

          <select
            className="editor-input"
            value={draft.formula_id}
            onChange={(e) => setDraft((d) => ({ ...d, formula_id: e.target.value }))}
          >
            {formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {AXES.map(({ key, label }) => (
            <div key={key} className="bake-axis-row">
              <span className="bake-axis-label">{label}</span>
              <div className="bake-axis-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`star-btn${(draft[key] as number) >= n ? ' star-active' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, [key]: n }))}
                  >
                    {(draft[key] as number) >= n ? '●' : '○'}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="crumb-score-display">
            crumb score {crumb_score} / 10
          </div>

          <input
            className="editor-input"
            placeholder="what changed?"
            value={draft.what_changed}
            onChange={(e) => setDraft((d) => ({ ...d, what_changed: e.target.value }))}
          />
          <textarea
            className="editor-textarea"
            placeholder="notes…"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />

          <label className="photo-label">
            attach photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </label>
          {photoFile && <div className="photo-selected">{photoFile.name}</div>}

          <div className="bake-entry-actions">
            <button className="ticket-btn ticket-btn-extend" onClick={() => setShowEntry(false)}>cancel</button>
            <button className="ticket-btn ticket-btn-done" onClick={() => void submit()}>save bake</button>
          </div>
        </div>
      )}

      <div className="bake-list">
        {bakes.length === 0 && <div className="bake-empty">no bakes yet</div>}
        {[...bakes].reverse().map((b) => {
          const formula = formulas.find((f) => f.id === b.formula_id);
          const d = new Date(b.baked_at);
          return (
            <div key={b.id} className="bake-row">
              <div className="bake-row-top">
                <span className="bake-row-name">{formula?.name ?? 'Unknown'}</span>
                <span className="bake-row-score">{b.crumb_score?.toFixed(1) ?? '—'} / 10</span>
              </div>
              <div className="bake-row-date">{d.toLocaleDateString()}</div>
              {b.what_changed && <div className="bake-row-changed">{b.what_changed}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function fileToJpegDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') { reject(new Error('Bad result')); return; }
      // Re-encode as JPEG at 0.7 quality via canvas to keep under 200KB
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Kitchen Note ─────────────────────────────────────────────

function NoteScreen({ note, onChange, onBack }: { note: string; onChange: (s: string) => void; onBack: () => void }) {
  return (
    <div className="more-detail">
      <div className="more-detail-header">
        <button className="back-btn" onClick={onBack}>← back</button>
        <span className="more-detail-title">kitchen note</span>
      </div>
      <div className="note-card">
        <textarea
          className="note-textarea"
          placeholder="Salt the duck legs tonight for tomorrow. Wind the dial when the milk goes on."
          value={note}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
