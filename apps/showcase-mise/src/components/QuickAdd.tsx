/**
 * The fast path. Slot selector + four shelves (Recents, Often, Favorites,
 * Meals), a free-text box with a live parse preview, Copy yesterday, and
 * import chips when Palate has sent a cooked or planned meal. Every shelf
 * is one tap to log.
 */
import { useMemo, useState } from 'react';
import type { Food } from '../lib/foods-data';
import type { Meal, Slot } from '../lib/types';
import { SLOTS, SLOT_LABEL } from '../lib/foods-data';
import type { QuickItem } from '../lib/store';
import type { ImportedMeal } from '../lib/intents';
import { parseFreeText } from '../lib/search';
import { fmt } from '../lib/format';

export interface ImportSuggestion {
  key: string;
  label: string;
  tag: string;
  meal: ImportedMeal;
}

type Shelf = 'recent' | 'often' | 'favorites' | 'meals';

interface Props {
  currentSlot: Slot;
  onSlotChange: (s: Slot) => void;
  recents: QuickItem[];
  frequents: QuickItem[];
  favorites: Food[];
  meals: Meal[];
  foods: readonly Food[];
  imports: ImportSuggestion[];
  hasYesterday: boolean;
  onQuickLog: (item: QuickItem) => void;
  onFoodTap: (food: Food) => void;
  onMealLog: (meal: Meal) => void;
  onImportLog: (s: ImportSuggestion) => void;
  onParsed: (text: string) => void;
  onCopyYesterday: () => void;
}

export function QuickAdd(props: Props) {
  const { currentSlot, onSlotChange } = props;
  const [shelf, setShelf] = useState<Shelf>(props.recents.length ? 'recent' : 'often');
  const [text, setText] = useState('');

  const preview = useMemo(
    () => (text.trim() ? parseFreeText(text, props.foods) : null),
    [text, props.foods],
  );

  function submitText() {
    if (!text.trim()) return;
    props.onParsed(text);
    setText('');
  }

  const shelves: Array<{ id: Shelf; label: string; count: number }> = [
    { id: 'recent', label: 'Recent', count: props.recents.length },
    { id: 'often', label: 'Often', count: props.frequents.length },
    { id: 'favorites', label: 'Favorites', count: props.favorites.length },
    { id: 'meals', label: 'Meals', count: props.meals.length },
  ];

  return (
    <div className="card">
      <div className="section-title">
        <span>Add to {SLOT_LABEL[currentSlot].toLowerCase()}</span>
        {props.hasYesterday ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onCopyYesterday}>
            ⧉ Copy yesterday
          </button>
        ) : null}
      </div>

      <div className="qa-slot">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            className={`slot-chip ${currentSlot === s ? 'slot-chip-on' : ''}`}
            onClick={() => onSlotChange(s)}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="freetext">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitText()}
          placeholder='Type it: "2 eggs", "200g chicken", "bowl of oats"'
          aria-label="Log by typing"
        />
        <button type="button" className="btn btn-accent" onClick={submitText}>Add</button>
      </div>
      {preview ? (
        <button type="button" className="parse-preview" onClick={submitText}>
          <span>
            {preview.food ? preview.food.name : preview.name}
            <span className="muted num">  ·  {fmt(preview.grams)} g{preview.food ? ` · ${fmt((preview.food.per100.kcal * preview.grams) / 100)} kcal` : ''}</span>
          </span>
          <span className="num">log →</span>
        </button>
      ) : null}

      {props.imports.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div className="section-title">From your kitchen</div>
          <div className="chips">
            {props.imports.map((s) => (
              <button key={s.key} type="button" className="chip chip-import" onClick={() => props.onImportLog(s)}>
                <span className="ct">{s.label}</span>
                <span className="cm">{s.tag}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="qa-tabs" style={{ marginTop: 14 }}>
        {shelves.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`qa-tab ${shelf === s.id ? 'qa-tab-on' : ''}`}
            onClick={() => setShelf(s.id)}
          >
            {s.label}{s.count ? ` ${s.count}` : ''}
          </button>
        ))}
      </div>

      <div className="chips">
        {shelf === 'recent' &&
          (props.recents.length ? (
            props.recents.map((it) => (
              <button key={it.key} type="button" className="chip" onClick={() => props.onQuickLog(it)}>
                <span className="ct">{it.name}</span>
                <span className="cm">{fmt(it.grams)} g · {fmt(it.nutrients.kcal)} kcal</span>
              </button>
            ))
          ) : (
            <p className="hint">Your recent foods will gather here.</p>
          ))}

        {shelf === 'often' &&
          (props.frequents.length ? (
            props.frequents.map((it) => (
              <button key={it.key} type="button" className="chip" onClick={() => props.onQuickLog(it)}>
                <span className="ct">{it.name}</span>
                <span className="cm">×{it.count} · {fmt(it.nutrients.kcal)} kcal</span>
              </button>
            ))
          ) : (
            <p className="hint">Foods you log often will surface here.</p>
          ))}

        {shelf === 'favorites' &&
          (props.favorites.length ? (
            props.favorites.map((f) => (
              <button key={f.id} type="button" className="chip" onClick={() => props.onFoodTap(f)}>
                <span className="ct">{f.name}</span>
                <span className="cm">{f.serving.label} · {fmt(f.per100.kcal * f.serving.grams / 100)} kcal</span>
              </button>
            ))
          ) : (
            <p className="hint">Star foods in the Foods tab to pin them here.</p>
          ))}

        {shelf === 'meals' &&
          (props.meals.length ? (
            props.meals.map((m) => (
              <button key={m.id} type="button" className="chip" onClick={() => props.onMealLog(m)}>
                <span className="ct">{m.name}</span>
                <span className="cm">{m.items.length} items</span>
              </button>
            ))
          ) : (
            <p className="hint">Save a combo as a meal to log it in one tap.</p>
          ))}
      </div>
    </div>
  );
}
