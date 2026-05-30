/**
 * Settings — theme switcher, default unit, data export, coach access, about.
 */
import { useState } from 'react';
import { useLift, type ThemeName } from '../state/lift-state.tsx';
import { gatherAllData } from '../db/queries.ts';
import { buildPassport, buildSetsCsv } from '../utils/export.ts';
import type { Unit } from '../db/schema.ts';

function downloadFile(name: string, mime: string, contents: string): void {
  try {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // download blocked (sandboxed iframe) — best-effort only
  }
}

const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: 'iron', label: 'Iron', hint: 'Default — barbell halogen' },
  { id: 'chalk', label: 'Chalk', hint: 'Bright training notebook' },
  { id: 'clay', label: 'Clay', hint: 'Warm, expressive' },
  { id: 'signal', label: 'Signal', hint: 'High-visibility gym mode' },
];

export function SettingsPage() {
  const lift = useLift();
  const [exporting, setExporting] = useState(false);

  async function exportPassport() {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await gatherAllData(lift.db);
      const passport = buildPassport({ ...all, exportedAt: new Date().toISOString() });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`lift-data-${stamp}.json`, 'application/json', JSON.stringify(passport, null, 2));
    } finally {
      setExporting(false);
    }
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await gatherAllData(lift.db);
      const stepWorkout = new Map(all.steps.map((s) => [s.id, s.workout_id]));
      const exerciseName = new Map(all.exercises.map((e) => [e.id, e.name]));
      const stepExercise = new Map(all.steps.map((s) => [s.id, exerciseName.get(s.exercise_id) ?? s.exercise_id]));
      const csv = buildSetsCsv(
        all.sets,
        (stepId) => stepWorkout.get(stepId) ?? '',
        (stepId) => stepExercise.get(stepId) ?? '',
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`lift-sets-${stamp}.csv`, 'text/csv', csv);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="lift-page">
      <header className="lift-settings__head">
        <h1 className="lift-h1">Settings</h1>
      </header>

      <section className="lift-settings__section">
        <p className="lift-section-label">Theme</p>
        <ul className="lift-settings__theme-list">
          {THEMES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`lift-settings__theme-row ${lift.theme === t.id ? 'lift-settings__theme-row--active' : ''}`}
                onClick={() => lift.setTheme(t.id)}
                aria-pressed={lift.theme === t.id}
              >
                <span className="lift-settings__theme-name">{t.label}</span>
                <span className="lift-settings__theme-hint">{t.hint}</span>
                <span className={`lift-settings__theme-dot lift-settings__theme-dot--${t.id}`} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="lift-settings__section">
        <p className="lift-section-label">Default unit</p>
        <div className="lift-settings__unit-row">
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              className={`lift-chip ${lift.defaultUnit === u ? 'lift-chip--active' : ''}`}
              onClick={() => lift.setDefaultUnit(u)}
              aria-pressed={lift.defaultUnit === u}
            >
              {u}
            </button>
          ))}
        </div>
        <p className="lift-settings__hint">
          Past sets keep their original unit. New sets default to {lift.defaultUnit}.
        </p>
      </section>

      <section className="lift-settings__section">
        <p className="lift-section-label">Print report</p>
        <button
          type="button"
          className="lift-secondary-btn"
          onClick={() => lift.setTab('print')}
        >
          Open printable report
        </button>
        <p className="lift-settings__hint">
          Current bests and a 6-week trend, formatted for print or save-as-PDF.
        </p>
      </section>

      <section className="lift-settings__section">
        <p className="lift-section-label">Your data</p>
        <div className="lift-settings__export-row">
          <button type="button" className="lift-secondary-btn" onClick={exportPassport} disabled={exporting}>
            Export all (JSON)
          </button>
          <button type="button" className="lift-secondary-btn" onClick={exportCsv} disabled={exporting}>
            Export sets (CSV)
          </button>
        </div>
        <p className="lift-settings__hint">
          A complete <code>lift.v1</code> data passport, or a flat CSV of every set.
          It's your training history — take it anywhere.
        </p>
      </section>

      <section className="lift-settings__section">
        <p className="lift-section-label">Coach access</p>
        <p className="lift-settings__hint">
          Optional. You can share a <strong>read-only</strong> view with a coach through a
          private sealed-cloud space — they see your sessions and PRs, never edit them, and
          you can revoke it any time. Lift works fully without this; nothing syncs unless you
          turn it on.
        </p>
        <button
          type="button"
          className="lift-secondary-btn"
          onClick={() => {
            try {
              // The sealed-cloud space panel is container-mediated.
              (window as unknown as { shippie?: { data?: { openPanel?: () => void } } }).shippie?.data?.openPanel?.();
            } catch {
              // standalone / no container — no-op
            }
          }}
        >
          Manage sharing
        </button>
      </section>

      <section className="lift-settings__section lift-settings__about">
        <p className="lift-section-label">About</p>
        <p className="lift-settings__about-text">
          Lift is a private strength tracker. Every set, every PR, every photo lives
          on this device. Nothing is uploaded.
        </p>
      </section>
    </div>
  );
}
