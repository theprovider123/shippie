import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  RECIPES,
  compute,
  formatHM,
  planFromReady,
  totalScheduleMinutes,
  type Recipe,
} from './recipes.ts';
import { load, newId, save, type Bake } from './db.ts';

const shippie = createShippieIframeSdk({ appId: 'app_dough' });

interface ShippieRoot {
  openYourData?: () => void;
}

function defaultReadyTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24, 0, 0, 0);
  // datetime-local format: YYYY-MM-DDTHH:MM
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function App() {
  const initial = load();
  const [bakes, setBakes] = useState<Bake[]>(initial.bakes);
  const [recipeId, setRecipeId] = useState<string>(RECIPES[0]!.id);
  const recipe = RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0]!;
  const [balls, setBalls] = useState<number>(recipe.defaultBalls);
  const [ballG, setBallG] = useState<number>(recipe.defaultBallG);
  const [readyAt, setReadyAt] = useState<string>(defaultReadyTime());

  useEffect(() => {
    save({ bakes });
  }, [bakes]);

  function pickRecipe(r: Recipe) {
    setRecipeId(r.id);
    setBalls(r.defaultBalls);
    setBallG(r.defaultBallG);
  }

  const totals = useMemo(
    () => compute(recipe, balls, ballG),
    [recipe, balls, ballG],
  );

  const readyDate = useMemo(() => {
    const t = new Date(readyAt);
    return isNaN(t.getTime()) ? new Date(Date.now() + 24 * 60 * 60_000) : t;
  }, [readyAt]);

  const plan = useMemo(() => planFromReady(recipe, readyDate), [recipe, readyDate]);
  const startAt = plan[0]?.start_at ?? readyDate;
  const totalMinutes = totalScheduleMinutes(recipe);

  function startFerment() {
    const bake: Bake = {
      id: newId(),
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      balls,
      ball_g: ballG,
      hydration: recipe.hydration,
      flour_g: totals.flour_g,
      water_g: totals.water_g,
      salt_g: totals.salt_g,
      leaven_g: totals.leaven_g,
      started_at: new Date().toISOString(),
      ready_at: readyDate.toISOString(),
      crumb_rating: null,
      notes: '',
    };
    setBakes((prev) => [bake, ...prev].slice(0, 100));
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('dough-ferment-started', [
      {
        recipe: recipe.id,
        recipe_name: recipe.name,
        hydration: recipe.hydration,
        flour_g: totals.flour_g,
        balls,
        started_at: bake.started_at,
        ready_at: bake.ready_at,
      },
    ]);
    // Schedule a `dough-ready` broadcast so daily-briefing / future
    // kitchen-clock can react. For v1 just fire setTimeout while the
    // page is open — production wires the SW for a push at the right
    // moment.
    const ms = readyDate.getTime() - Date.now();
    if (ms > 0 && ms < 24 * 60 * 60 * 1000) {
      window.setTimeout(() => {
        shippie.intent.broadcast('dough-ready', [
          {
            recipe: recipe.id,
            recipe_name: recipe.name,
            ready_at: bake.ready_at,
          },
        ]);
        shippie.feel.texture('milestone');
      }, ms);
    }
  }

  function rateBake(id: string, rating: number) {
    setBakes((prev) =>
      prev.map((b) => (b.id === id ? { ...b, crumb_rating: rating } : b)),
    );
    shippie.feel.texture('confirm');
  }

  function openYourData() {
    if (typeof window === 'undefined') return;
    const root = (window as unknown as { shippie?: ShippieRoot }).shippie;
    if (typeof root?.openYourData === 'function') root.openYourData();
    else window.open('/__shippie/data', '_blank', 'noopener');
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Dough</h1>
        <p className="subtitle">baker's percentages · schedule</p>
      </header>

      {/* Recipe picker */}
      <section className="recipe-grid">
        {RECIPES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`recipe-chip ${r.id === recipe.id ? 'active' : ''}`}
            onClick={() => pickRecipe(r)}
          >
            <span className="recipe-name">{r.name}</span>
            <span className="recipe-meta">
              {r.hydration}% · {r.leaven}
            </span>
          </button>
        ))}
      </section>

      {/* Yield input */}
      <section className="yield">
        <div className="field-row">
          <label className="field">
            <span>balls / loaves</span>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={balls}
              onChange={(e) => setBalls(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="field">
            <span>each (g)</span>
            <input
              type="number"
              min={50}
              max={2000}
              step={10}
              value={ballG}
              onChange={(e) => setBallG(Math.max(50, Number(e.target.value) || 50))}
            />
          </label>
        </div>
        <p className="muted small total-line">
          total dough: <strong>{totals.total_g}g</strong>
        </p>
      </section>

      {/* Quantities */}
      <section className="quantities">
        <p className="eyebrow">to mix</p>
        <ul>
          <li>
            <span className="qty-name">Flour</span>
            <span className="qty-value">{totals.flour_g}g</span>
            <span className="muted small qty-pct">100%</span>
          </li>
          <li>
            <span className="qty-name">Water</span>
            <span className="qty-value">{totals.water_g}g</span>
            <span className="muted small qty-pct">{recipe.hydration}%</span>
          </li>
          <li>
            <span className="qty-name">Salt</span>
            <span className="qty-value">{totals.salt_g}g</span>
            <span className="muted small qty-pct">{recipe.salt}%</span>
          </li>
          <li>
            <span className="qty-name">{leavenName(recipe)}</span>
            <span className="qty-value">{totals.leaven_g}g</span>
            <span className="muted small qty-pct">{recipe.leavenPct}%</span>
          </li>
        </ul>
      </section>

      {/* Schedule generator */}
      <section className="schedule">
        <p className="eyebrow">working backwards</p>
        <label className="field">
          <span>ready at</span>
          <input
            type="datetime-local"
            value={readyAt}
            onChange={(e) => setReadyAt(e.target.value)}
          />
        </label>
        <p className="muted small">
          start at <strong>{startAt.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</strong>{' '}
          · total {formatHM(totalMinutes)}
        </p>
        <ol className="plan">
          {plan.map((step, i) => (
            <li key={i}>
              <p className="plan-line">
                <strong>{step.label}</strong>
                <span className="muted small">
                  {step.start_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' → '}
                  {step.end_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </p>
              <p className="muted small">{formatHM(step.minutes)}{step.note ? ` · ${step.note}` : ''}</p>
            </li>
          ))}
        </ol>
        <button type="button" className="primary" onClick={startFerment}>
          Start ferment
        </button>
      </section>

      {/* Past bakes */}
      {bakes.length > 0 ? (
        <section className="log">
          <p className="eyebrow">recent bakes</p>
          <ul>
            {bakes.slice(0, 6).map((b) => (
              <li key={b.id}>
                <div className="log-line">
                  <strong>{b.recipe_name}</strong>
                  <span className="muted small">
                    {b.balls} × {b.ball_g}g · {b.hydration}%
                  </span>
                </div>
                <p className="muted small">
                  {new Date(b.started_at).toLocaleDateString()}
                </p>
                <div className="rate-row">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`star ${b.crumb_rating && n <= b.crumb_rating ? 'on' : ''}`}
                      onClick={() => rateBake(b.id, n)}
                      aria-label={`Crumb ${n}/5`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </main>
  );
}

function leavenName(r: Recipe): string {
  switch (r.leaven) {
    case 'instant-yeast':
      return 'Instant yeast';
    case 'fresh-yeast':
      return 'Fresh yeast';
    case 'sourdough':
      return 'Levain';
    case 'poolish':
      return 'Poolish';
  }
}
