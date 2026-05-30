/**
 * Readiness banner — the first thing you see before you start.
 *
 * Folds cross-app recovery signals (sleep, fuel, hydration, caffeine,
 * cycle, bodyweight) into one honest verdict and a load nudge. When no
 * signals have arrived, it stays honest: it tells you which apps would
 * light it up rather than inventing a number.
 *
 * Surfaced on the start screen, where the autoregulation decision is
 * actually made. Logic-only data; nothing here leaves the device.
 */
import { useReadiness } from '../lib/readiness-store.ts';

export function ReadinessBanner() {
  const { readiness } = useReadiness();

  if (!readiness.honest) {
    return (
      <section className="lift-readiness lift-readiness--unknown">
        <p className="lift-readiness__head">Readiness</p>
        <p className="lift-readiness__hint">
          No recovery signals yet. Log sleep, food, or hydration in another Shippie app and
          Lift will autoregulate your load — privately, on this device.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`lift-readiness lift-readiness--${readiness.band}`}
      role={readiness.band === 'caution' ? 'status' : undefined}
    >
      <div className="lift-readiness__top">
        <span className="lift-readiness__score" aria-hidden="true">
          {readiness.score}
        </span>
        <p className="lift-readiness__headline">{readiness.headline}</p>
      </div>

      {readiness.factors.length > 0 ? (
        <ul className="lift-readiness__factors">
          {readiness.factors.map((f, i) => (
            <li key={i} className={`lift-readiness__factor lift-readiness__factor--${f.effect}`}>
              <span className="lift-readiness__factor-label">{f.label}</span>
              <span className="lift-readiness__factor-detail">{f.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {readiness.loadAdvice ? (
        <p className="lift-readiness__advice">{readiness.loadAdvice}</p>
      ) : null}
    </section>
  );
}
