import { useEffect, useMemo, useState } from 'react';
import type { Bake } from '../db.ts';
import { activeBakes } from '../db.ts';
import {
  RECIPES,
  type Recipe,
  modeForLeaven,
  planFromReady,
  totalMinutes,
} from '../recipes.ts';
import { BakeCard } from '../components/BakeCard.tsx';
import { leavenLabel } from '../lib/percentages.ts';
import { formatDayClock, formatHM } from '../lib/schedule.ts';

interface Props {
  bakes: Bake[];
  customRecipes: Recipe[];
  onPickRecipe: (r: Recipe) => void;
  onQuickStart: (recipe: Recipe, totalG: number, readyAt: Date) => void;
  onNewRecipe: () => void;
  onOpenBake: (id: string) => void;
  onOpenActive: () => void;
  onOpenHistory: () => void;
}

function datetimeLocal(hoursAhead: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursAhead, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Home({
  bakes,
  customRecipes,
  onPickRecipe,
  onQuickStart,
  onNewRecipe,
  onOpenBake,
  onOpenActive,
  onOpenHistory,
}: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(customRecipes[0]?.id ?? RECIPES[0]?.id ?? '');
  const active = useMemo(() => activeBakes(bakes), [bakes]);
  const completedCount = useMemo(
    () => bakes.length - active.length,
    [bakes.length, active.length],
  );

  const allRecipes: Recipe[] = useMemo(
    () => [...customRecipes, ...RECIPES],
    [customRecipes],
  );
  const selectedRecipe = useMemo(
    () => allRecipes.find((recipe) => recipe.id === selectedRecipeId) ?? allRecipes[0],
    [allRecipes, selectedRecipeId],
  );
  const defaultReadyHours = selectedRecipe
    ? Math.max(2, Math.ceil(totalMinutes(selectedRecipe.stages) / 60) + 1)
    : 4;
  const [totalG, setTotalG] = useState<number>(selectedRecipe?.defaultTotalG ?? 900);
  const [readyAt, setReadyAt] = useState<string>(() => datetimeLocal(defaultReadyHours));

  useEffect(() => {
    if (!selectedRecipe) return;
    setSelectedRecipeId(selectedRecipe.id);
    setTotalG(selectedRecipe.defaultTotalG);
    setReadyAt(datetimeLocal(Math.max(2, Math.ceil(totalMinutes(selectedRecipe.stages) / 60) + 1)));
  }, [selectedRecipe?.id]);

  const readyDate = useMemo(() => {
    const parsed = new Date(readyAt);
    return Number.isNaN(parsed.getTime())
      ? new Date(Date.now() + defaultReadyHours * 60 * 60_000)
      : parsed;
  }, [defaultReadyHours, readyAt]);
  const preview = useMemo(
    () => (selectedRecipe ? planFromReady(selectedRecipe.stages, readyDate) : null),
    [readyDate, selectedRecipe],
  );
  const startsInPast = preview ? preview.startAt.getTime() < Date.now() : false;

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Dough</h1>
          <p className="subtitle">schedule a bake</p>
        </div>
        <button type="button" className="ghost app-header-action" onClick={() => setToolsOpen(true)}>
          Tools
        </button>
      </header>

      {selectedRecipe ? (
        <section className="quick-start">
          <div className="quick-recipe">
            <div>
              <p className="eyebrow">next bake</p>
              <h2>{selectedRecipe.name}</h2>
              <p className="muted small">
                {selectedRecipe.hydration}% · {leavenLabel(selectedRecipe.leaven)} · {formatHM(totalMinutes(selectedRecipe.stages))}
              </p>
            </div>
            <button type="button" className="ghost" onClick={() => setToolsOpen(true)}>
              Change
            </button>
          </div>
          <div className="field-row">
            <label className="field">
              <span>total dough (g)</span>
              <input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={totalG}
                onChange={(event) => setTotalG(Math.max(100, Number(event.target.value) || 100))}
              />
            </label>
            <label className="field">
              <span>ready at</span>
              <input
                type="datetime-local"
                value={readyAt}
                onChange={(event) => setReadyAt(event.target.value)}
              />
            </label>
          </div>
          {preview ? (
            <p className={`quick-preview ${startsInPast ? 'warn' : ''}`}>
              Start {formatDayClock(preview.startAt)}
            </p>
          ) : null}
          <button
            type="button"
            className="primary quick-action"
            disabled={startsInPast}
            onClick={() => onQuickStart(selectedRecipe, totalG, readyDate)}
          >
            Schedule bake
          </button>
        </section>
      ) : null}

      {active.length > 0 ? (
        <section className="active-strip">
          <div className="strip-head">
            <p className="eyebrow">in flight · {active.length}</p>
            <button type="button" className="ghost" onClick={onOpenActive}>
              See all
            </button>
          </div>
          <div className="bake-list">
            {active.slice(0, 3).map((b) => (
              <BakeCard key={b.id} bake={b} onOpen={() => onOpenBake(b.id)} />
            ))}
          </div>
        </section>
      ) : null}

      {toolsOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setToolsOpen(false)}>
          <section
            className="bottom-sheet"
            role="dialog"
            aria-label="Dough tools"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden="true" />
            <header className="sheet-head">
              <div>
                <p className="eyebrow">Dough tools</p>
                <h2>Recipes and history</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setToolsOpen(false)}>
                Close
              </button>
            </header>
            <div className="tool-actions">
              <button type="button" className="ghost" onClick={onNewRecipe}>
                New recipe
              </button>
              {selectedRecipe ? (
                <button type="button" className="ghost" onClick={() => onPickRecipe(selectedRecipe)}>
                  Recipe details
                </button>
              ) : null}
              {completedCount > 0 ? (
                <button type="button" className="ghost" onClick={onOpenHistory}>
                  History · {completedCount}
                </button>
              ) : null}
            </div>
            <div className="recipe-grid sheet-recipes">
              {allRecipes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`recipe-chip ${r.preset ? '' : 'mine'} ${r.id === selectedRecipe?.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRecipeId(r.id);
                    setToolsOpen(false);
                  }}
                >
                  <span className="recipe-name">{r.name}</span>
                  <span className="recipe-meta">
                    {r.hydration}% · {leavenLabel(r.leaven)} · {modeForLeaven(r.leaven)}
                  </span>
                  <span className="recipe-desc">{r.description}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
