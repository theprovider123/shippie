/**
 * Goal page — set/edit a target, see honest projection.
 */
import { useState } from 'react';
import { GoalProjectionCard } from '../components/GoalProjection.tsx';
import type { Entry, Goal } from '../lib/store.ts';

interface GoalPageProps {
  entries: readonly Entry[];
  goal: Goal | null;
  onSave: (goal: Goal | null) => void;
}

export function GoalPage({ entries, goal, onSave }: GoalPageProps) {
  const [editing, setEditing] = useState(goal === null);
  const [target, setTarget] = useState(goal?.weightKg.toString() ?? '');
  const lastEntry = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const startWeight = lastEntry?.weightKg ?? 75;
  const inOneMonth = new Date();
  inOneMonth.setMonth(inOneMonth.getMonth() + 3);
  const [date, setDate] = useState(
    goal?.targetDate ?? inOneMonth.toISOString().slice(0, 10),
  );

  function save() {
    const kg = parseFloat(target);
    if (!Number.isFinite(kg) || kg <= 0) return;
    onSave({
      weightKg: kg,
      targetDate: date,
      startDate: goal?.startDate ?? new Date().toISOString().slice(0, 10),
      startWeightKg: goal?.startWeightKg ?? startWeight,
    });
    setEditing(false);
  }

  function clear() {
    onSave(null);
    setEditing(true);
    setTarget('');
  }

  if (!editing && goal) {
    return (
      <>
        <GoalProjectionCard
          goal={goal}
          measurements={entries}
          onEdit={() => setEditing(true)}
        />
        <p className="prose prose--small">
          The pace shown above is your linear regression slope over your
          entire history. Two weeks of data is enough to start trusting
          it; less is mostly noise.
        </p>
        <button type="button" className="ghost-btn" onClick={clear}>
          Clear goal
        </button>
      </>
    );
  }

  return (
    <section className="goal-form">
      <h2>{goal ? 'Edit your goal' : 'Set a goal'}</h2>
      <p className="prose prose--small">
        Pick a weight and a date. We'll compute the weekly pace
        required and show whether your current trajectory hits it.
        Honest copy: if you'd miss, we say so.
      </p>
      <label>
        <span>Target weight (kg)</span>
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="72.0"
        />
      </label>
      <label>
        <span>Target date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="row">
        <button type="button" onClick={save} disabled={!target}>
          Save goal
        </button>
        {goal && (
          <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
