import { useMemo } from 'react';
import type { Bake } from '../db.ts';
import { activeBakes } from '../db.ts';
import { RECIPES, type Recipe, modeForLeaven } from '../recipes.ts';
import { BakeCard } from '../components/BakeCard.tsx';
import { leavenLabel } from '../lib/percentages.ts';

interface Props {
  bakes: Bake[];
  customRecipes: Recipe[];
  onPickRecipe: (r: Recipe) => void;
  onNewRecipe: () => void;
  onOpenBake: (id: string) => void;
  onOpenActive: () => void;
  onOpenHistory: () => void;
}

export function Home({
  bakes,
  customRecipes,
  onPickRecipe,
  onNewRecipe,
  onOpenBake,
  onOpenActive,
  onOpenHistory,
}: Props) {
  const active = useMemo(() => activeBakes(bakes), [bakes]);
  const completedCount = useMemo(
    () => bakes.length - active.length,
    [bakes.length, active.length],
  );

  const allRecipes: Recipe[] = useMemo(
    () => [...customRecipes, ...RECIPES],
    [customRecipes],
  );

  return (
    <main className="app">
      <header className="app-header">
        <h1>Dough</h1>
        <p className="subtitle">multi-stage timeline · bakers' percentages</p>
      </header>

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

      <section>
        <div className="strip-head">
          <p className="eyebrow">start a bake</p>
          <button type="button" className="ghost" onClick={onNewRecipe}>
            + new recipe
          </button>
        </div>
        <div className="recipe-grid">
          {allRecipes.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`recipe-chip ${r.preset ? '' : 'mine'}`}
              onClick={() => onPickRecipe(r)}
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

      {completedCount > 0 ? (
        <section>
          <button type="button" className="ghost wide" onClick={onOpenHistory}>
            History · {completedCount} {completedCount === 1 ? 'bake' : 'bakes'}
          </button>
        </section>
      ) : null}
    </main>
  );
}
