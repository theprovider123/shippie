/**
 * Library — exercises + templates. Search by name, filter by muscle
 * group, tap to start a blank workout with that exercise queued.
 *
 * Phase 1: search + muscle filter on exercises, template list with
 * step preview, "add to current workout" if a workout is open.
 */
import { useMemo, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  addStepToWorkout,
  startBlankWorkout,
  startWorkoutFromTemplate,
} from '../db/queries.ts';
import type { MuscleGroup } from '../db/schema.ts';

const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
  'full-body',
];

export function LibraryPage() {
  const lift = useLift();
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lift.exercises.filter((ex) => {
      if (muscleFilter !== 'all' && ex.muscle_group !== muscleFilter) return false;
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lift.exercises, query, muscleFilter]);

  return (
    <div className="lift-page">
      <header className="lift-library__head">
        <h1 className="lift-h1">Library</h1>
      </header>

      <section className="lift-library__templates">
        <div className="lift-library__templates-head">
          <p className="lift-section-label">Templates</p>
          <button
            type="button"
            className="lift-library__new-tpl"
            onClick={() => {
              lift.setTemplateForkOf(null);
              lift.setTab('template-edit');
            }}
          >
            + New
          </button>
        </div>
        <ul className="lift-library__template-list">
          {lift.templates.map((tpl) => (
            <li key={tpl.id} className="lift-library__template-li">
              <button
                type="button"
                className="lift-library__template-row"
                onClick={async () => {
                  await startWorkoutFromTemplate(lift.db, tpl.id);
                  await lift.refresh();
                  lift.setTab('today');
                }}
              >
                <span className="lift-library__tpl-name">{tpl.name}</span>
                <span className="lift-library__tpl-scheme">
                  {tpl.scheme ?? (tpl.source === 'custom' ? 'custom' : 'builtin')}
                </span>
              </button>
              <button
                type="button"
                className="lift-library__customize"
                aria-label={`Customize ${tpl.name}`}
                onClick={() => {
                  lift.setTemplateForkOf(tpl.id);
                  lift.setTab('template-edit');
                }}
              >
                Customize
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="lift-library__exercises">
        <div className="lift-library__filter-row">
          <input
            type="search"
            className="lift-search"
            placeholder="Search exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search exercises"
          />
        </div>

        <div className="lift-library__muscle-row" role="tablist" aria-label="Muscle group">
          <MuscleChip
            active={muscleFilter === 'all'}
            label="All"
            onClick={() => setMuscleFilter('all')}
          />
          {MUSCLE_GROUPS.map((m) => (
            <MuscleChip
              key={m}
              active={muscleFilter === m}
              label={m}
              onClick={() => setMuscleFilter(m)}
            />
          ))}
        </div>

        <ul className="lift-library__exercise-list">
          {filtered.map((ex) => (
            <li key={ex.id} className="lift-library__exercise-row">
              <div className="lift-library__exercise-info">
                <p className="lift-library__exercise-name">{ex.name}</p>
                <p className="lift-library__exercise-muscle">{ex.muscle_group}</p>
              </div>
              <button
                type="button"
                className="lift-secondary-btn"
                onClick={async () => {
                  let workoutId = lift.openWorkout?.id;
                  if (!workoutId) {
                    const w = await startBlankWorkout(lift.db);
                    workoutId = w.id;
                  }
                  await addStepToWorkout(lift.db, workoutId, ex.id, ex.variant_id ?? null);
                  await lift.refresh();
                  lift.setTab('today');
                }}
              >
                {lift.openWorkout ? 'Add' : 'Start'}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="lift-empty">No exercises match.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function MuscleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`lift-chip ${active ? 'lift-chip--active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
