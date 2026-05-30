import { useState } from 'react';
import type { Goals, Mode, Targets, Units } from '../lib/types';
import { MODES } from '../lib/modes';
import type { EnrichConfig } from '../lib/enrich';

interface Props {
  goals: Goals;
  enrich: EnrichConfig;
  counts: { entries: number; foods: number; meals: number };
  onSetMode: (m: Mode) => void;
  onSetBodyweight: (kg: number | undefined) => void;
  onSetUnits: (u: Units) => void;
  onEditTarget: (key: keyof Targets, value: number) => void;
  onResetTargets: () => void;
  onSetEnrich: (c: EnrichConfig) => void;
  onExport: () => void;
  onImport: (text: string) => void;
}

const TARGET_ROWS: Array<{ key: keyof Targets; label: string; unit: string }> = [
  { key: 'kcal', label: 'Energy', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carb_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'fiber_g', label: 'Fiber', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium line', unit: 'mg' },
  { key: 'water_ml', label: 'Water', unit: 'ml' },
  { key: 'caffeine_mg', label: 'Caffeine line', unit: 'mg' },
  { key: 'caffeine_cutoff_hour', label: 'Caffeine cutoff', unit: 'h' },
  { key: 'protein_per_meal_g', label: 'Protein / meal', unit: 'g' },
];

export function Settings(props: Props) {
  const { goals } = props;
  const imperial = goals.units === 'imperial';
  const bwDisplay = goals.bodyweightKg
    ? imperial
      ? Math.round(goals.bodyweightKg * 2.20462)
      : Math.round(goals.bodyweightKg)
    : '';
  const [bwInput, setBwInput] = useState(String(bwDisplay));

  function commitBodyweight(raw: string) {
    setBwInput(raw);
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v <= 0) {
      props.onSetBodyweight(undefined);
      return;
    }
    props.onSetBodyweight(imperial ? v / 2.20462 : v);
  }

  return (
    <div className="stack">
      <div>
        <div className="section-title">Mode</div>
        <div className="modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-card ${goals.mode === m.id ? 'on' : ''}`}
              onClick={() => props.onSetMode(m.id)}
            >
              <div className="mn">{m.label}</div>
              <div className="mb">{m.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="grid2">
          <div className="field">
            <label>Bodyweight ({imperial ? 'lb' : 'kg'})</label>
            <input
              className="num"
              inputMode="decimal"
              value={bwInput}
              placeholder="optional"
              onChange={(e) => commitBodyweight(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Units</label>
            <select value={goals.units} onChange={(e) => props.onSetUnits(e.target.value as Units)}>
              <option value="metric">Metric (kg)</option>
              <option value="imperial">Imperial (lb)</option>
            </select>
          </div>
        </div>
        <p className="hint">Bodyweight tunes protein and energy targets. It's optional and stays on this device.</p>
      </div>

      <div className="card">
        <div className="section-title">
          <span>Daily reference lines</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onResetTargets}>
            Reset to {goals.mode}
          </button>
        </div>
        {TARGET_ROWS.map((row) => (
          <div className="target-row" key={row.key}>
            <span>{row.label}</span>
            <span>
              <input
                className="num"
                inputMode="numeric"
                value={goals.targets[row.key]}
                onChange={(e) => props.onEditTarget(row.key, parseFloat(e.target.value) || 0)}
              />
              <span className="muted num">  {row.unit}</span>
            </span>
          </div>
        ))}
        {goals.customized ? <p className="hint">Edited from the {goals.mode} preset.</p> : null}
      </div>

      <div className="card">
        <div className="section-title">Online enrichment (optional)</div>
        <label className="row-between" style={{ marginBottom: 8 }}>
          <span className="hint">Look foods up online when not found locally</span>
          <input
            type="checkbox"
            checked={props.enrich.enabled}
            onChange={(e) => props.onSetEnrich({ ...props.enrich, enabled: e.target.checked })}
          />
        </label>
        {props.enrich.enabled ? (
          <div className="field">
            <label>Lookup endpoint</label>
            <input
              value={props.enrich.endpoint ?? ''}
              placeholder="https://…/search"
              onChange={(e) => props.onSetEnrich({ ...props.enrich, endpoint: e.target.value })}
            />
          </div>
        ) : null}
        <p className="hint">Off by default. Mise works fully offline; enrichment only ever adds foods, never replaces your local data.</p>
      </div>

      <div className="card">
        <div className="section-title">Your food log · stays on this device</div>
        <p className="hint" style={{ marginBottom: 10 }}>
          {props.counts.entries} entries · {props.counts.foods} custom foods · {props.counts.meals} meals.
          Nothing leaves this device unless you export it. Private cloud and sealed backup live in the Shippie drawer.
        </p>
        <div className="qa-slot">
          <button type="button" className="btn btn-sm" onClick={props.onExport}>↓ Export JSON</button>
          <label className="btn btn-sm">
            ↑ Import JSON
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void file.text().then(props.onImport);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="disclaimer">
        <strong>Nutrition support, not medical care.</strong> Mise offers food information and
        gentle patterns to help your own choices. It is not medical advice, diagnosis, or
        treatment, and nutrient values are estimates. For medical concerns — or if food or eating
        feels distressing — please talk to a doctor or registered dietitian.
      </div>
    </div>
  );
}
