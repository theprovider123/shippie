import { useMemo, useState } from 'react';
import type { Habit, HabitCheck } from '../types.ts';
import { StreakHeatmap } from '../components/StreakHeatmap.tsx';
import { ReturnRate } from '../components/ReturnRate.tsx';
import { DifficultyPicker } from '../components/DifficultyPill.tsx';
import { CueAnchorPicker } from '../components/CueAnchorPicker.tsx';
import { bestStreak, currentStreak, dayKey } from '../lib/streak-math.ts';
import { returnStats } from '../lib/return-rate.ts';

/**
 * Per-habit detail. Heatmap is the headline; everything else stacks
 * below. Streak shown alongside return-rate, never alone.
 */
export function HabitDetail({
  habit,
  checks,
  eligibleIntents,
  onUpdate,
  onArchive,
  onBack,
}: {
  habit: Habit;
  checks: readonly HabitCheck[];
  eligibleIntents: ReadonlyArray<{ intent: string; label: string }>;
  onUpdate: (next: Habit) => void;
  onArchive: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(habit.name);
  const [reward, setReward] = useState(habit.reward ?? '');
  const today = useMemo(() => dayKey(new Date()), []);
  const cur = useMemo(() => currentStreak(habit.id, today, checks), [habit.id, today, checks]);
  const best = useMemo(() => bestStreak(habit.id, checks), [habit.id, checks]);
  const stats = useMemo(() => returnStats(habit.id, today, checks, 28), [habit.id, today, checks]);

  const save = (patch: Partial<Habit>) => onUpdate({ ...habit, ...patch });

  return (
    <main className="page-habit">
      <header className="page-head with-back">
        <button type="button" className="back" onClick={onBack} aria-label="Back to today">
          ← back
        </button>
        <h1>{habit.name}</h1>
      </header>

      <section className="streaks">
        <div className="streak-block">
          <span className="streak-label">on a roll</span>
          <span className="streak-value">{cur}</span>
          <span className="muted">day{cur === 1 ? '' : 's'} in a row</span>
        </div>
        <div className="streak-block">
          <span className="streak-label">best ever</span>
          <span className="streak-value">{best}</span>
          <span className="muted">day{best === 1 ? '' : 's'}</span>
        </div>
        <div className="streak-block return-block">
          <span className="streak-label">return rate</span>
          <ReturnRate stats={stats} />
        </div>
      </section>

      <section className="heatmap-section">
        <h2>Year</h2>
        <StreakHeatmap habit={habit} today={today} checks={checks} />
        <p className="muted small">
          Missed days are grey, not red. Coming back is the streak.
        </p>
      </section>

      <section className="edit-section">
        <h2>Edit</h2>
        <label className="form-row">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== habit.name && save({ name: name.trim() })}
          />
        </label>
        <div className="form-row">
          <span>Difficulty</span>
          <DifficultyPicker value={habit.difficulty} onChange={(d) => save({ difficulty: d })} />
        </div>
        <div className="form-row">
          <span>Cue</span>
          <CueAnchorPicker
            value={habit.cue}
            eligibleIntents={eligibleIntents}
            onChange={(cue) => save({ cue })}
          />
        </div>
        <label className="form-row">
          <span>Reward (optional)</span>
          <input
            type="text"
            value={reward}
            placeholder="a square of dark chocolate"
            onChange={(e) => setReward(e.target.value)}
            onBlur={() => reward.trim() !== (habit.reward ?? '') && save({ reward: reward.trim() || undefined })}
          />
        </label>
      </section>

      <section className="archive-section">
        <button type="button" className="ghost danger" onClick={onArchive}>
          I'm not doing this anymore (archive)
        </button>
        <p className="muted small">History is preserved. You can reactivate later.</p>
      </section>
    </main>
  );
}
