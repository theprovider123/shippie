/**
 * Internal-temp reference card — the screen the user reaches for at a
 * friend's BBQ. Safe minimum + ideal pull-temp + one-line explainer for
 * every common protein.
 */

import { TEMP_CARD } from '../data.ts';

export function InternalTemps() {
  return (
    <section className="temps">
      <header>
        <p className="eyebrow">internal temps</p>
        <h2>Pull at the ideal — rest finishes the cook</h2>
        <p className="lede">
          Safe is the regulatory floor. Ideal is where the protein actually
          tastes best. Whole-muscle beef and pork can be enjoyed below the
          USDA safe; ground meat and poultry cannot.
        </p>
      </header>
      <div className="temp-table-scroll">
        <table className="temp-table">
          <thead>
            <tr>
              <th>Protein</th>
              <th>Safe</th>
              <th>Ideal</th>
            </tr>
          </thead>
          <tbody>
            {TEMP_CARD.map((entry) => (
              <tr key={entry.protein}>
                <th scope="row">
                  <span className="row-name">{entry.protein}</span>
                  <span className="row-note muted small">{entry.note}</span>
                </th>
                <td>
                  <span className="temp-pill">{entry.safe_c}°C</span>
                </td>
                <td>
                  <span className="temp-pill temp-pill--ideal">{entry.ideal_c}°C</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="footnote muted small">
        °C → °F: multiply by 9/5 then add 32. (54°C = 130°F · 71°C = 160°F · 93°C = 200°F.)
      </p>
    </section>
  );
}
