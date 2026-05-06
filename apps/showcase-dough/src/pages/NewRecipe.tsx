import { useMemo, useState } from 'react';
import {
  type FlourPart,
  type LeavenKind,
  leavenLabel,
} from '../lib/percentages.ts';
import { checkHydration } from '../lib/hydration-check.ts';
import { checkSalt } from '../lib/salt-check.ts';
import { defaultStages } from '../lib/schedule.ts';
import { ModeToggle } from '../components/ModeToggle.tsx';
import { FlourMix } from '../components/FlourMix.tsx';
import { HydrationWarning } from '../components/HydrationWarning.tsx';
import { SaltWarning } from '../components/SaltWarning.tsx';
import { type Mode, type Recipe } from '../recipes.ts';
import { newId } from '../db.ts';

interface Props {
  defaultMode: Mode;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
}

const SOURDOUGH_LEAVENS: LeavenKind[] = ['sourdough'];
const YEAST_LEAVENS: LeavenKind[] = ['instant-yeast', 'fresh-yeast', 'poolish'];

const DEFAULT_FLOURS_SOURDOUGH: FlourPart[] = [
  { kind: 'bread', pct: 80 },
  { kind: 'whole-wheat', pct: 20 },
];
const DEFAULT_FLOURS_YEAST: FlourPart[] = [{ kind: 'bread', pct: 100 }];

export function NewRecipe({ defaultMode, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [name, setName] = useState<string>('My country loaf');
  const [flours, setFlours] = useState<FlourPart[]>(
    defaultMode === 'sourdough' ? DEFAULT_FLOURS_SOURDOUGH : DEFAULT_FLOURS_YEAST,
  );
  const [hydration, setHydration] = useState<number>(
    defaultMode === 'sourdough' ? 78 : 65,
  );
  const [salt, setSalt] = useState<number>(2.0);
  const [leaven, setLeaven] = useState<LeavenKind>(
    defaultMode === 'sourdough' ? 'sourdough' : 'instant-yeast',
  );
  const [leavenPct, setLeavenPct] = useState<number>(
    defaultMode === 'sourdough' ? 20 : 0.5,
  );
  const [defaultTotalG, setDefaultTotalG] = useState<number>(900);

  function switchMode(next: Mode) {
    setMode(next);
    if (next === 'sourdough') {
      setFlours(DEFAULT_FLOURS_SOURDOUGH);
      setHydration(78);
      setLeaven('sourdough');
      setLeavenPct(20);
    } else {
      setFlours(DEFAULT_FLOURS_YEAST);
      setHydration(65);
      setLeaven('instant-yeast');
      setLeavenPct(0.5);
    }
  }

  const hydrationCheck = useMemo(
    () => checkHydration(flours, hydration),
    [flours, hydration],
  );
  const saltCheck = useMemo(() => checkSalt(salt), [salt]);

  const leavenChoices = mode === 'sourdough' ? SOURDOUGH_LEAVENS : YEAST_LEAVENS;

  function handleSave() {
    const stages = defaultStages({
      leaven,
      bulkHours: mode === 'sourdough' ? 4 : 1.5,
      useColdRetard: mode === 'sourdough',
    });
    const recipe: Recipe = {
      id: newId('r'),
      name: name.trim() || 'Untitled recipe',
      description: `${hydration}% hydration · ${leavenLabel(leaven)}`,
      flours,
      hydration,
      salt,
      leaven,
      leavenPct,
      defaultTotalG,
      stages,
      preset: false,
      createdAt: new Date().toISOString(),
    };
    onSave(recipe);
  }

  return (
    <main className="app">
      <header className="page-header">
        <button type="button" className="back" onClick={onCancel}>
          ← Back
        </button>
        <h1>New recipe</h1>
      </header>

      <section className="form-block">
        <p className="eyebrow">leaven mode</p>
        <ModeToggle mode={mode} onChange={switchMode} />
        <p className="muted small mode-hint">
          {mode === 'sourdough'
            ? 'Wild starter, longer bulk, cold retard. The schedule will gate on starter feed first.'
            : 'Commercial yeast, same-day. Shorter bulk, no starter math.'}
        </p>
      </section>

      <section className="form-block">
        <label className="field">
          <span>name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </section>

      <section className="form-block">
        <p className="eyebrow">flour mix</p>
        <FlourMix flours={flours} onChange={setFlours} />
      </section>

      <section className="form-block">
        <p className="eyebrow">numbers</p>
        <div className="field-row">
          <label className="field">
            <span>hydration %</span>
            <input
              type="number"
              min={40}
              max={100}
              step={1}
              value={hydration}
              onChange={(e) => setHydration(Number(e.target.value) || 0)}
            />
          </label>
          <label className="field">
            <span>salt %</span>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={salt}
              onChange={(e) => setSalt(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <HydrationWarning check={hydrationCheck} />
        <SaltWarning check={saltCheck} />
      </section>

      <section className="form-block">
        <p className="eyebrow">leaven</p>
        <div className="field-row">
          <label className="field">
            <span>kind</span>
            <select
              value={leaven}
              onChange={(e) => setLeaven(e.target.value as LeavenKind)}
            >
              {leavenChoices.map((k) => (
                <option key={k} value={k}>
                  {leavenLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>% of flour</span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={leavenPct}
              onChange={(e) => setLeavenPct(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <p className="muted small">
          {mode === 'sourdough'
            ? '15–25% levain is the typical range. Higher = faster, lower = more flavour development.'
            : '0.3–1% instant yeast is plenty for most loaves; poolish runs higher because the pre-ferment carries the load.'}
        </p>
      </section>

      <section className="form-block">
        <p className="eyebrow">default loaf weight</p>
        <label className="field">
          <span>grams</span>
          <input
            type="number"
            min={200}
            max={5000}
            step={50}
            value={defaultTotalG}
            onChange={(e) => setDefaultTotalG(Number(e.target.value) || 200)}
          />
        </label>
      </section>

      <div className="page-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleSave}
          disabled={
            hydrationCheck.severity === 'error' ||
            saltCheck.severity === 'error' ||
            flours.length === 0
          }
        >
          Save to library
        </button>
      </div>
    </main>
  );
}
