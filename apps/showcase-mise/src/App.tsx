/**
 * Mise — root. Single source of truth in useState, persisted to
 * localStorage on every change. Logging is the fast path; everything
 * broadcasts the right cross-app intents and folds inbound ones into a
 * bounded context used for import chips and neutral insights.
 *
 * Provides: nutrition-logged, meal-logged, protein-target-hit,
 *           hydration-logged, caffeine-logged, macro-target-updated.
 * Consumes: cooked-meal, meal-planned, shopping-list, pantry-inventory,
 *           workout-completed, cycle-logged, body-metrics-logged, mood-logged.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

import type { Food } from './lib/foods-data';
import type { Entry, Goals, Meal, MealItem, Mode, Slot, Targets, Units } from './lib/types';
import { EMPTY_NUTRIENTS, totalsForEntries } from './lib/nutrition';
import { targetsForMode } from './lib/modes';
import { buildInsights } from './lib/insights';
import { dayKey, lastNDayKeys, todayKey } from './lib/dates';
import { parseFreeText, slotForHour } from './lib/search';
import type { EnrichConfig } from './lib/enrich';
import {
  allFoods,
  copyYesterday,
  entriesFromMeal,
  entryFromGrams,
  entryFromImportedMeal,
  entryFromQuickItem,
  exportData,
  foodById,
  frequentItems,
  load,
  newId,
  parseImport,
  pruneEntries,
  recentItems,
  save,
  toggleFavorite,
  type Persisted,
} from './lib/store';
import {
  caffeineRow,
  hydrationRow,
  macroTargetRow,
  mealLoggedRow,
  mergeBodyMetrics,
  mergeCookedMeals,
  mergeCycle,
  mergeMoods,
  mergePantry,
  mergePlannedMeals,
  mergeShopping,
  mergeWorkouts,
  nutritionRowFromEntry,
  proteinTargetRow,
} from './lib/intents';

import { Today } from './pages/Today';
import { Foods } from './pages/Foods';
import { Patterns, type WeekDay } from './pages/Patterns';
import { Settings } from './pages/Settings';
import { PortionSheet, type PortionResult } from './components/PortionSheet';
import { EntrySheet } from './components/EntrySheet';
import { CustomFoodSheet } from './components/CustomFoodSheet';
import { MealBuilderSheet } from './components/MealBuilderSheet';
import type { ImportSuggestion } from './components/QuickAdd';

const shippie = createShippieIframeSdk({ appId: 'app_mise' });

const CONSUMED = [
  'cooked-meal',
  'meal-planned',
  'shopping-list',
  'pantry-inventory',
  'workout-completed',
  'cycle-logged',
  'body-metrics-logged',
  'mood-logged',
] as const;

type Route = 'today' | 'foods' | 'patterns' | 'settings';

const TABS: Array<{ id: Route; label: string; glyph: string }> = [
  { id: 'today', label: 'Today', glyph: '◆' },
  { id: 'foods', label: 'Foods', glyph: '⌘' },
  { id: 'patterns', label: 'Patterns', glyph: '∿' },
  { id: 'settings', label: 'You', glyph: '☰' },
];

interface PortionState {
  food: Food | null;
  name: string;
  qty: number;
  grams: number;
  slot: Slot;
}

export function App() {
  const initial = useMemo(() => load(), []);
  const [entries, setEntries] = useState<Entry[]>(initial.entries);
  const [customFoods, setCustomFoods] = useState<Food[]>(initial.foods);
  const [meals, setMeals] = useState<Meal[]>(initial.meals);
  const [goals, setGoals] = useState<Goals>(initial.goals);
  const [favoriteFoodIds, setFavoriteFoodIds] = useState<string[]>(initial.favoriteFoodIds);
  const [external, setExternal] = useState(initial.external);
  const [enrich, setEnrich] = useState<EnrichConfig>(initial.enrich);

  const [route, setRoute] = useState<Route>('today');
  const [currentSlot, setCurrentSlot] = useState<Slot>(slotForHour(new Date().getHours()));
  const [portion, setPortion] = useState<PortionState | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [customFoodOpen, setCustomFoodOpen] = useState<string | null>(null);
  const [mealBuilderOpen, setMealBuilderOpen] = useState(false);

  const proteinHitRef = useRef<Set<string>>(new Set());
  const localNavigation = useMemo(() => createLocalNavigation<Route>('today', setRoute), []);

  // Persist on every change.
  useEffect(() => {
    const state: Persisted = {
      version: 1,
      entries,
      foods: customFoods,
      meals,
      goals,
      favoriteFoodIds,
      external,
      enrich,
    };
    save(state);
  }, [entries, customFoods, meals, goals, favoriteFoodIds, external, enrich]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  // Cross-app intents: request permission, subscribe, announce targets.
  useEffect(() => {
    for (const intent of CONSUMED) shippie.requestIntent(intent);
    const offs = [
      shippie.intent.subscribe('cooked-meal', (b) => setExternal((c) => mergeCookedMeals(c, b.rows))),
      shippie.intent.subscribe('meal-planned', (b) => setExternal((c) => mergePlannedMeals(c, b.rows))),
      shippie.intent.subscribe('pantry-inventory', (b) => setExternal((c) => mergePantry(c, b.rows))),
      shippie.intent.subscribe('shopping-list', (b) => setExternal((c) => mergeShopping(c, b.rows))),
      shippie.intent.subscribe('workout-completed', (b) => setExternal((c) => mergeWorkouts(c, b.rows))),
      shippie.intent.subscribe('cycle-logged', (b) => setExternal((c) => mergeCycle(c, b.rows))),
      shippie.intent.subscribe('body-metrics-logged', (b) => setExternal((c) => mergeBodyMetrics(c, b.rows))),
      shippie.intent.subscribe('mood-logged', (b) => setExternal((c) => mergeMoods(c, b.rows))),
    ];
    shippie.intent.broadcast('macro-target-updated', [macroTargetRow(initial.goals)]);
    return () => {
      for (const off of offs) off();
    };
  }, [initial.goals]);

  // ── Derived ──────────────────────────────────────────────────
  const mergedFoods = useMemo(
    () => allFoods(customFoods, favoriteFoodIds),
    [customFoods, favoriteFoodIds],
  );
  const tKey = todayKey();
  const todayEntries = useMemo(
    () => entries.filter((e) => dayKey(e.logged_at) === tKey),
    [entries, tKey],
  );
  const totals = useMemo(() => totalsForEntries(todayEntries), [todayEntries]);
  const recents = useMemo(() => recentItems(entries), [entries]);
  const frequents = useMemo(() => frequentItems(entries), [entries]);
  const favorites = useMemo(() => mergedFoods.filter((f) => f.favorite), [mergedFoods]);

  const insights = useMemo(
    () => buildInsights({ todayEntries, allEntries: entries, goals, external }),
    [todayEntries, entries, goals, external],
  );

  const hasYesterday = useMemo(() => {
    const yKey = dayKey(new Date(Date.now() - 86_400_000));
    return entries.some((e) => dayKey(e.logged_at) === yKey);
  }, [entries]);

  const imports = useMemo<ImportSuggestion[]>(() => {
    const loggedNames = new Set(todayEntries.map((e) => e.name.toLowerCase()));
    const out: ImportSuggestion[] = [];
    const seen = new Set<string>();
    for (const m of [...external.cookedMeals, ...external.plannedMeals]) {
      const k = m.name.toLowerCase();
      if (seen.has(k) || loggedNames.has(k)) continue;
      seen.add(k);
      out.push({
        key: `${m.source}:${k}`,
        label: m.name,
        tag: m.source === 'cooked-meal' ? 'just cooked' : 'planned',
        meal: m,
      });
      if (out.length >= 4) break;
    }
    return out;
  }, [external.cookedMeals, external.plannedMeals, todayEntries]);

  const week = useMemo<WeekDay[]>(() => {
    const keys = lastNDayKeys(7).reverse();
    return keys.map((key) => {
      const dayEntries = entries.filter((e) => dayKey(e.logged_at) === key);
      const t = totalsForEntries(dayEntries);
      return {
        key,
        label: new Date(`${key}T00:00:00`).toLocaleDateString([], { weekday: 'short' }).slice(0, 2),
        kcal: t.kcal,
        protein: t.protein_g,
        logged: dayEntries.length > 0,
      };
    });
  }, [entries]);

  // ── Logging ──────────────────────────────────────────────────
  function broadcastEntry(e: Entry) {
    shippie.intent.broadcast('nutrition-logged', [nutritionRowFromEntry(e)]);
    if (e.nutrients.water_ml > 0) shippie.intent.broadcast('hydration-logged', [hydrationRow(e.nutrients.water_ml, e.logged_at)]);
    if (e.nutrients.caffeine_mg > 0) shippie.intent.broadcast('caffeine-logged', [caffeineRow(e.nutrients.caffeine_mg, e.logged_at)]);
  }

  function addEntries(newOnes: Entry[], mealName?: string) {
    const first = newOnes[0];
    if (!first) return;
    setEntries((prev) => pruneEntries([...newOnes, ...prev]));
    shippie.feel.texture('confirm');
    for (const e of newOnes) broadcastEntry(e);
    if (mealName) {
      shippie.intent.broadcast('meal-logged', [
        mealLoggedRow(mealName, first.slot, newOnes, first.logged_at),
      ]);
    }
    // protein-target-hit — once per day, on the crossing.
    const before = totals.protein_g;
    const added = newOnes.reduce((s, e) => s + e.nutrients.protein_g, 0);
    const target = goals.targets.protein_g;
    if (target > 0 && before < target && before + added >= target && !proteinHitRef.current.has(tKey)) {
      proteinHitRef.current.add(tKey);
      shippie.intent.broadcast('protein-target-hit', [proteinTargetRow(before + added, target, tKey)]);
      shippie.feel.texture('milestone');
    }
  }

  function broadcastTargets(next: Goals) {
    shippie.intent.broadcast('macro-target-updated', [macroTargetRow(next)]);
  }

  function logQuick(item: import('./lib/store').QuickItem) {
    addEntries([entryFromQuickItem(item, currentSlot)]);
  }

  function openPortionForFood(food: Food) {
    setPortion({ food, name: food.name, qty: 1, grams: food.serving.grams, slot: currentSlot });
  }

  function onParsed(text: string) {
    const p = parseFreeText(text, mergedFoods);
    setPortion({ food: p.food, name: p.name, qty: p.qty, grams: p.grams, slot: p.slotHint ?? currentSlot });
  }

  function confirmPortion(result: PortionResult) {
    if (!portion) return;
    const source: Entry['source'] = portion.food ? 'search' : 'free-text';
    const e = entryFromGrams(portion.food, portion.name, result.grams, result.slot, new Date(), source);
    if (!portion.food && result.manual) {
      e.nutrients = { ...EMPTY_NUTRIENTS, ...result.manual };
    }
    addEntries([e]);
    setPortion(null);
  }

  function logMeal(meal: Meal) {
    const newOnes = entriesFromMeal(meal, customFoods, currentSlot);
    addEntries(newOnes, meal.name);
  }

  function logImport(s: ImportSuggestion) {
    const slot = s.meal.slot ?? currentSlot;
    addEntries([entryFromImportedMeal(s.meal, slot)], s.meal.name);
  }

  function doCopyYesterday() {
    const cloned = copyYesterday(entries);
    if (cloned.length) addEntries(cloned);
  }

  function saveEditedEntry(updated: Entry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    shippie.feel.texture('confirm');
    setEditEntry(null);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    shippie.feel.texture('delete');
    setEditEntry(null);
  }

  // ── Foods & meals ────────────────────────────────────────────
  function addCustomFood(food: Food) {
    setCustomFoods((prev) => [food, ...prev]);
    setCustomFoodOpen(null);
    openPortionForFood(food);
  }
  function deleteCustomFood(id: string) {
    setCustomFoods((prev) => prev.filter((f) => f.id !== id));
    setFavoriteFoodIds((prev) => prev.filter((x) => x !== id));
  }
  function saveMeal(name: string, items: MealItem[]) {
    const meal: Meal = { id: newId('meal'), name, items, createdAt: new Date().toISOString() };
    setMeals((prev) => [meal, ...prev]);
    setMealBuilderOpen(false);
    shippie.feel.texture('complete');
  }
  function deleteMeal(id: string) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  // ── Goals ────────────────────────────────────────────────────
  function setMode(mode: Mode) {
    const next: Goals = { ...goals, mode, customized: false, targets: targetsForMode(mode, goals.bodyweightKg) };
    setGoals(next);
    broadcastTargets(next);
    shippie.feel.texture('toggle');
  }
  function setBodyweight(kg: number | undefined) {
    const base: Goals = kg === undefined ? { ...goals } : { ...goals, bodyweightKg: kg };
    if (kg === undefined) delete base.bodyweightKg;
    if (!goals.customized) base.targets = targetsForMode(goals.mode, kg);
    setGoals(base);
    broadcastTargets(base);
  }
  function setUnits(units: Units) {
    setGoals((g) => ({ ...g, units }));
  }
  function editTarget(key: keyof Targets, value: number) {
    const next: Goals = { ...goals, customized: true, targets: { ...goals.targets, [key]: value } };
    setGoals(next);
    broadcastTargets(next);
  }
  function resetTargets() {
    const next: Goals = { ...goals, customized: false, targets: targetsForMode(goals.mode, goals.bodyweightKg) };
    setGoals(next);
    broadcastTargets(next);
  }

  // ── Data ─────────────────────────────────────────────────────
  function currentPersisted(): Persisted {
    return { version: 1, entries, foods: customFoods, meals, goals, favoriteFoodIds, external, enrich };
  }
  function doExport() {
    try {
      const blob = new Blob([exportData(currentPersisted())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mise-export-${tKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* download unavailable */
    }
  }
  function doImport(text: string) {
    const p = parseImport(text);
    if (!p) return;
    setEntries(p.entries);
    setCustomFoods(p.foods);
    setMeals(p.meals);
    setGoals(p.goals);
    setFavoriteFoodIds(p.favoriteFoodIds);
    setExternal(p.external);
    setEnrich(p.enrich);
    shippie.feel.texture('complete');
  }

  const editFood = editEntry ? foodById(editEntry.foodId, customFoods) ?? null : null;
  const mealCandidates = todayEntries.filter((e) => e.foodId && foodById(e.foodId, customFoods));

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Mise</h1>
          <span className="date">{new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
        <span className="mode-pill">{goals.mode.replace('-', ' ')}</span>
      </header>

      {route === 'today' ? (
        <Today
          todayEntries={todayEntries}
          totals={totals}
          goals={goals}
          recents={recents}
          frequents={frequents}
          favorites={favorites}
          meals={meals}
          foods={mergedFoods}
          imports={imports}
          hasYesterday={hasYesterday}
          insights={insights}
          currentSlot={currentSlot}
          onSlotChange={setCurrentSlot}
          onQuickLog={logQuick}
          onFoodTap={openPortionForFood}
          onMealLog={logMeal}
          onImportLog={logImport}
          onParsed={onParsed}
          onCopyYesterday={doCopyYesterday}
          onEditEntry={setEditEntry}
        />
      ) : null}

      {route === 'foods' ? (
        <Foods
          foods={mergedFoods}
          customFoods={customFoods}
          meals={meals}
          favoriteIds={favoriteFoodIds}
          onLogFood={openPortionForFood}
          onToggleFavorite={(id) => setFavoriteFoodIds((prev) => toggleFavorite(prev, id))}
          onNewFood={() => setCustomFoodOpen('')}
          onDeleteFood={deleteCustomFood}
          onLogMeal={logMeal}
          onDeleteMeal={deleteMeal}
          onNewMeal={() => setMealBuilderOpen(true)}
        />
      ) : null}

      {route === 'patterns' ? <Patterns insights={insights} week={week} goals={goals} /> : null}

      {route === 'settings' ? (
        <Settings
          goals={goals}
          enrich={enrich}
          counts={{ entries: entries.length, foods: customFoods.length, meals: meals.length }}
          onSetMode={setMode}
          onSetBodyweight={setBodyweight}
          onSetUnits={setUnits}
          onEditTarget={editTarget}
          onResetTargets={resetTargets}
          onSetEnrich={setEnrich}
          onExport={doExport}
          onImport={doImport}
        />
      ) : null}

      <nav className="tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${route === tab.id ? 'tab-on' : ''}`}
            onClick={() => void localNavigation.navigate(tab.id, { kind: 'crossfade' })}
          >
            <span className="glyph" aria-hidden="true">{tab.glyph}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {portion ? (
        <PortionSheet
          food={portion.food}
          name={portion.name}
          initialQty={portion.qty}
          initialGrams={portion.grams}
          initialSlot={portion.slot}
          onConfirm={confirmPortion}
          onClose={() => setPortion(null)}
        />
      ) : null}

      {editEntry ? (
        <EntrySheet
          entry={editEntry}
          food={editFood}
          onSave={saveEditedEntry}
          onRemove={removeEntry}
          onClose={() => setEditEntry(null)}
        />
      ) : null}

      {customFoodOpen !== null ? (
        <CustomFoodSheet
          initialName={customFoodOpen}
          onSave={addCustomFood}
          onClose={() => setCustomFoodOpen(null)}
        />
      ) : null}

      {mealBuilderOpen ? (
        <MealBuilderSheet
          candidates={mealCandidates}
          onSave={saveMeal}
          onClose={() => setMealBuilderOpen(false)}
        />
      ) : null}
    </main>
  );
}
