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
  insertCustomExercise,
  startBlankWorkout,
  startWorkoutFromTemplate,
} from '../db/queries.ts';
import { ProgramsSection } from '../components/ProgramsSection.tsx';
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
  const [showCustom, setShowCustom] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lift.exercises.filter((ex) => {
      if (muscleFilter !== 'all' && ex.muscle_group !== muscleFilter) return false;
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lift.exercises, query, muscleFilter]);

  // Count sibling variants per lineage — the de-facto "alternatives" for a lift.
  const altCountByLineage = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of lift.variants) {
      m.set(v.lineage_id, (m.get(v.lineage_id) ?? 0) + 1);
    }
    return m;
  }, [lift.variants]);

  return (
    <div className="lift-page">
      <header className="lift-library__head">
        <h1 className="lift-h1">Library</h1>
      </header>

      <ProgramsSection />

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

        <div className="lift-library__add-custom">
          <button
            type="button"
            className="lift-library__new-tpl"
            onClick={() => setShowCustom((s) => !s)}
            aria-expanded={showCustom}
          >
            {showCustom ? '× Cancel' : '+ Custom exercise'}
          </button>
        </div>
        {showCustom ? (
          <CustomExerciseForm
            onCreate={async (input) => {
              await insertCustomExercise(lift.db, { ...input, unit: lift.defaultUnit });
              await lift.refresh();
              setShowCustom(false);
            }}
          />
        ) : null}

        <ul className="lift-library__exercise-list">
          {filtered.map((ex) => {
            const alts = ex.lineage_id ? (altCountByLineage.get(ex.lineage_id) ?? 1) - 1 : 0;
            return (
              <li key={ex.id} className="lift-library__exercise-row">
                <div className="lift-library__exercise-info">
                  <p className="lift-library__exercise-name">
                    {ex.name}
                    {ex.source === 'custom' ? <span className="lift-library__custom-tag">custom</span> : null}
                  </p>
                  <p className="lift-library__exercise-muscle">
                    {ex.muscle_group}
                    {ex.is_bodyweight ? ' · bodyweight' : ''}
                    {ex.equipment ? ` · ${ex.equipment}` : ''}
                    {alts > 0 ? ` · ${alts} alt${alts === 1 ? '' : 's'}` : ''}
                  </p>
                  {ex.cues ? <p className="lift-library__exercise-cues">{ex.cues}</p> : null}
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
            );
          })}
          {filtered.length === 0 ? (
            <li className="lift-empty">No exercises match.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function CustomExerciseForm({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    muscleGroup: MuscleGroup;
    equipment?: string | null;
    cues?: string | null;
    isBodyweight?: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState('');
  const [cues, setCues] = useState('');
  const [bodyweight, setBodyweight] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="lift-custom-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        try {
          await onCreate({
            name: name.trim(),
            muscleGroup,
            equipment: equipment.trim() || null,
            cues: cues.trim() || null,
            isBodyweight: bodyweight,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        className="lift-search"
        placeholder="Exercise name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Custom exercise name"
      />
      <select
        className="lift-custom-form__select"
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
        aria-label="Muscle group"
      >
        {MUSCLE_GROUPS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        className="lift-search"
        placeholder="Equipment (optional)"
        value={equipment}
        onChange={(e) => setEquipment(e.target.value)}
        aria-label="Equipment"
      />
      <input
        className="lift-search"
        placeholder="Cues (optional)"
        value={cues}
        onChange={(e) => setCues(e.target.value)}
        aria-label="Coaching cues"
      />
      <label className="lift-custom-form__check">
        <input type="checkbox" checked={bodyweight} onChange={(e) => setBodyweight(e.target.checked)} />
        Bodyweight exercise
      </label>
      <button type="submit" className="lift-primary-btn" disabled={busy || !name.trim()}>
        {busy ? 'Adding…' : 'Add exercise'}
      </button>
    </form>
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
