import { useMemo, useState } from 'react';
import type { Food } from '../lib/foods-data';
import type { Meal } from '../lib/types';
import { searchFoods } from '../lib/search';
import { totalsForMeal } from '../lib/store';
import { fmt } from '../lib/format';

interface Props {
  foods: Food[];
  customFoods: Food[];
  meals: Meal[];
  favoriteIds: string[];
  onLogFood: (food: Food) => void;
  onToggleFavorite: (id: string) => void;
  onNewFood: () => void;
  onDeleteFood: (id: string) => void;
  onLogMeal: (meal: Meal) => void;
  onDeleteMeal: (id: string) => void;
  onNewMeal: () => void;
}

function FoodRow({
  food,
  fav,
  onLog,
  onToggle,
  onDelete,
}: {
  food: Food;
  fav: boolean;
  onLog: () => void;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="result">
      <button
        type="button"
        onClick={onLog}
        style={{ flex: 1, border: 0, background: 'transparent', textAlign: 'left', padding: 0 }}
      >
        <div className="nm">{food.name}{food.brand ? ` · ${food.brand}` : ''}</div>
        <div className="det">
          {food.serving.label} ({fmt(food.serving.grams)} g) · {fmt((food.per100.kcal * food.serving.grams) / 100)} kcal · {fmt((food.per100.protein_g * food.serving.grams) / 100)} g P
        </div>
      </button>
      <button type="button" className={`star ${fav ? 'on' : ''}`} onClick={onToggle} aria-label="Favorite">
        {fav ? '★' : '☆'}
      </button>
      {onDelete ? (
        <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete">🗑</button>
      ) : null}
    </div>
  );
}

export function Foods(props: Props) {
  const [query, setQuery] = useState('');
  const favSet = useMemo(() => new Set(props.favoriteIds), [props.favoriteIds]);
  const results = useMemo(
    () => (query.trim() ? searchFoods(query, props.foods, 40) : []),
    [query, props.foods],
  );
  const favorites = useMemo(
    () => props.foods.filter((f) => favSet.has(f.id)),
    [props.foods, favSet],
  );

  return (
    <div className="stack">
      <div className="field">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          aria-label="Search foods"
        />
      </div>

      <div className="qa-slot">
        <button type="button" className="btn btn-sm" onClick={props.onNewFood}>＋ New food</button>
        <button type="button" className="btn btn-sm" onClick={props.onNewMeal}>＋ Save a meal</button>
      </div>

      {query.trim() ? (
        <div>
          <div className="section-title">{results.length} result{results.length === 1 ? '' : 's'}</div>
          <div className="list">
            {results.map((f) => (
              <FoodRow
                key={f.id}
                food={f}
                fav={favSet.has(f.id)}
                onLog={() => props.onLogFood(f)}
                onToggle={() => props.onToggleFavorite(f.id)}
                onDelete={f.source === 'custom' ? () => props.onDeleteFood(f.id) : undefined}
              />
            ))}
            {results.length === 0 ? (
              <div className="empty">
                <div className="big">No match</div>
                <div>Make it a custom food and it's yours from now on.</div>
                <button type="button" className="btn btn-accent btn-sm" style={{ marginTop: 12 }} onClick={props.onNewFood}>
                  Create “{query.trim()}”
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div>
            <div className="section-title">Favorites</div>
            {favorites.length ? (
              <div className="list">
                {favorites.map((f) => (
                  <FoodRow
                    key={f.id}
                    food={f}
                    fav
                    onLog={() => props.onLogFood(f)}
                    onToggle={() => props.onToggleFavorite(f.id)}
                    onDelete={f.source === 'custom' ? () => props.onDeleteFood(f.id) : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="hint">Star foods to keep them one tap away on Today.</p>
            )}
          </div>

          {props.customFoods.length ? (
            <div>
              <div className="section-title">Your foods</div>
              <div className="list">
                {props.customFoods.map((f) => (
                  <FoodRow
                    key={f.id}
                    food={f}
                    fav={favSet.has(f.id)}
                    onLog={() => props.onLogFood(f)}
                    onToggle={() => props.onToggleFavorite(f.id)}
                    onDelete={() => props.onDeleteFood(f.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="section-title">Saved meals</div>
            {props.meals.length ? (
              <div className="list">
                {props.meals.map((m) => {
                  const t = totalsForMeal(m, props.customFoods);
                  return (
                    <div className="result" key={m.id}>
                      <button
                        type="button"
                        onClick={() => props.onLogMeal(m)}
                        style={{ flex: 1, border: 0, background: 'transparent', textAlign: 'left', padding: 0 }}
                      >
                        <div className="nm">{m.name}</div>
                        <div className="det">{m.items.length} items · {fmt(t.kcal)} kcal · {fmt(t.protein_g)} g P</div>
                      </button>
                      <button type="button" className="icon-btn" onClick={() => props.onDeleteMeal(m.id)} aria-label="Delete meal">🗑</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="hint">Build a go-to combo (e.g. “Usual breakfast”) and log it in one tap.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
