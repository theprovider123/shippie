/**
 * Programs — the block/week layer on top of templates.
 *
 * Each program is a block of weeks running an alternating session rotation
 * (Day A / B …). This panel shows where you are in the block and starts the
 * *next* session — pulling the right template, applying the week's load
 * multiplier (so a deload week starts lighter), and arming the program
 * pointer so the finish flow advances it. Missed days never lose your spot.
 */
import { useEffect, useState } from 'react';
import { useLift } from '../state/lift-state.tsx';
import {
  getProgramSessions,
  getProgramWeeks,
  startWorkoutFromTemplate,
} from '../db/queries.ts';
import { emitWorkoutStarted } from '../lib/intent-bus.ts';
import {
  getCompletedCount,
  setActiveProgram,
} from '../lib/program-progress.ts';
import {
  nextProgramPosition,
  programProgressFraction,
  weekLabel,
} from '../utils/program.ts';
import type { ProgramSession, ProgramWeek } from '../db/schema.ts';

interface Loaded {
  weeks: ProgramWeek[];
  sessions: ProgramSession[];
}

export function ProgramsSection() {
  const lift = useLift();
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  // Bumped after starting a session so the position readout refreshes.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, Loaded> = {};
      for (const p of lift.programs) {
        const [weeks, sessions] = await Promise.all([
          getProgramWeeks(lift.db, p.id),
          getProgramSessions(lift.db, p.id),
        ]);
        if (cancelled) return;
        out[p.id] = { weeks, sessions };
      }
      if (!cancelled) setLoaded(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [lift.programs, lift.db]);

  if (lift.programs.length === 0) return null;

  async function startNext(programId: string, programName: string) {
    const data = loaded[programId];
    if (!data || data.sessions.length === 0) return;
    const completed = getCompletedCount(programId);
    const total = data.sessions.length;
    const totalWeeks = data.weeks.length || 1;
    const pos = nextProgramPosition(completed, total, totalWeeks);
    if (pos.done) return;

    const session = data.sessions[pos.dayIndex];
    const week = data.weeks[pos.weekIndex];
    if (!session) return;

    const { workout, steps } = await startWorkoutFromTemplate(lift.db, session.template_id);
    setActiveProgram({
      programId,
      programName,
      weekIndex: pos.weekIndex,
      dayIndex: pos.dayIndex,
      weekLabel: weekLabel(pos.weekIndex, week?.label, Boolean(week?.is_deload)),
      loadPct: week?.load_pct ?? 1,
      isDeload: Boolean(week?.is_deload),
    });
    emitWorkoutStarted({
      workoutId: workout.id,
      source: 'program',
      templateId: session.template_id,
      exerciseCount: steps.length,
      startedAt: new Date().toISOString(),
    });
    setTick((t) => t + 1);
    await lift.refresh();
    lift.setTab('today');
  }

  return (
    <section className="lift-programs">
      <p className="lift-section-label">Programs</p>
      <ul className="lift-programs__list">
        {lift.programs.map((p) => {
          const data = loaded[p.id];
          const total = data?.sessions.length ?? 0;
          const totalWeeks = data?.weeks.length || p.weeks || 1;
          const completed = getCompletedCount(p.id);
          void tick; // re-read completed after a start
          const pos = nextProgramPosition(completed, Math.max(1, total), totalWeeks);
          const frac = programProgressFraction(completed, Math.max(1, total), totalWeeks);
          const session = data?.sessions[pos.dayIndex];
          const week = data?.weeks[pos.weekIndex];
          return (
            <li key={p.id} className="lift-programs__card">
              <div className="lift-programs__card-head">
                <span className="lift-programs__name">{p.name}</span>
                <span className="lift-programs__weeks">{p.weeks}-week block</span>
              </div>
              <div className="lift-programs__progress-track">
                <span className="lift-programs__progress-bar" style={{ width: `${Math.round(frac * 100)}%` }} />
              </div>
              {pos.done ? (
                <p className="lift-programs__next">Block complete — strong work.</p>
              ) : (
                <>
                  <p className="lift-programs__next">
                    Next: {weekLabel(pos.weekIndex, week?.label, Boolean(week?.is_deload))} ·{' '}
                    {session?.label ?? `Day ${pos.dayIndex + 1}`}
                    {week && week.load_pct < 1 ? ` · ${Math.round(week.load_pct * 100)}% loads` : ''}
                  </p>
                  <button
                    type="button"
                    className="lift-primary-btn lift-programs__start"
                    onClick={() => startNext(p.id, p.name)}
                    disabled={!data}
                  >
                    Start {session?.label ?? 'session'}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
