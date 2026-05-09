/**
 * Settings — theme switcher, default unit, plate inventory edit, about.
 */
import { useLift, type ThemeName } from '../state/lift-state.tsx';
import type { Unit } from '../db/schema.ts';

const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: 'iron', label: 'Iron', hint: 'Default — barbell halogen' },
  { id: 'chalk', label: 'Chalk', hint: 'Bright training notebook' },
  { id: 'clay', label: 'Clay', hint: 'Warm, expressive' },
  { id: 'signal', label: 'Signal', hint: 'High-visibility gym mode' },
];

export function SettingsPage() {
  const lift = useLift();

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
