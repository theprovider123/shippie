import { DEFAULT_COST_PER_SERVING } from '../lib/cost-estimate.ts';

interface SettingsProps {
  fallbackPerServing: number;
  currency: string;
  onChange: (next: { fallbackPerServing: number; currency: string }) => void;
  onClearWeek: () => void;
}

/**
 * Lightweight settings — the user adjusts the per-serving fallback
 * (so cost estimates match their region) and the currency prefix.
 * Clear-week lives here so it's not one tap away from a real plan.
 */
export function Settings({ fallbackPerServing, currency, onChange, onClearWeek }: SettingsProps) {
  return (
    <div>
      <header>
        <h1>Settings</h1>
        <p className="muted">Quick knobs. Nothing here syncs anywhere yet.</p>
      </header>

      <section className="card">
        <h2>Cost fallback</h2>
        <p className="caveat">
          Used when a recipe didn't carry its own per-serving cost. Default ~
          {DEFAULT_COST_PER_SERVING.toFixed(2)} per serving — set whatever feels honest for
          your shop.
        </p>
        <label className="field">
          <span className="field-label">Per serving</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={fallbackPerServing}
            onChange={(e) =>
              onChange({
                fallbackPerServing: Math.max(0, Number(e.target.value) || 0),
                currency,
              })
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Currency prefix</span>
          <input
            type="text"
            maxLength={4}
            value={currency}
            onChange={(e) => onChange({ fallbackPerServing, currency: e.target.value })}
            placeholder="$, £, €"
          />
        </label>
      </section>

      <section className="card">
        <h2>Reset</h2>
        <p className="caveat">
          Clears every slot. Recipes saved in Recipe app aren't touched.
        </p>
        <button type="button" className="ghost danger" onClick={onClearWeek}>
          Clear week
        </button>
      </section>
    </div>
  );
}
