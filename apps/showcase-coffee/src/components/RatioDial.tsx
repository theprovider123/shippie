import { METHOD_LABEL, RATIO_RANGE, modeForMethod, round1, type BrewMethod } from '../db.ts';
import { METHODS } from '../lib/options.ts';

interface RatioDialProps {
  method: BrewMethod;
  weightG: number;
  ratio: number;
  onChangeMethod: (m: BrewMethod) => void;
  onChangeWeight: (g: number) => void;
  onChangeRatio: (r: number) => void;
}

/**
 * Two-axis ratio control. Picks beans, picks ratio, and the water grams
 * follow as a derived output. Method picker is a sibling — choosing a
 * method scopes the ratio range (filter 1:12–1:20, espresso 1:1–1:3) and
 * resets the ratio if it falls outside the new scope.
 */
export function RatioDial({
  method,
  weightG,
  ratio,
  onChangeMethod,
  onChangeWeight,
  onChangeRatio,
}: RatioDialProps) {
  const mode = modeForMethod(method);
  const range = RATIO_RANGE[mode];
  const waterG = round1(weightG * ratio);

  return (
    <section className="dial" aria-label="Ratio dial">
      <div className="dial-row">
        <label className="dial-label">
          <span>Beans</span>
          <input
            type="number"
            min={5}
            max={80}
            step={0.5}
            value={weightG}
            onChange={(e) => onChangeWeight(Number(e.target.value) || 0)}
          />
          <span className="unit">g</span>
        </label>
        <span className="dial-arrow" aria-hidden="true">
          →
        </span>
        <label className="dial-label">
          <span>Water</span>
          <output className="big">{waterG}</output>
          <span className="unit">g</span>
        </label>
      </div>

      <label className="dial-label dial-label-row">
        <span>
          Ratio 1:{ratio} <em className="muted small">{mode === 'espresso' ? '· espresso scope' : '· filter scope'}</em>
        </span>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={ratio}
          onChange={(e) => onChangeRatio(Number(e.target.value))}
        />
      </label>

      <div className="method-row" role="tablist" aria-label="Brew method">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={m === method}
            className={`method-chip ${m === method ? 'active' : ''}`}
            onClick={() => onChangeMethod(m)}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
    </section>
  );
}
