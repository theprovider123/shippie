import { useMemo } from 'react';
import { WeeklyReviewCard } from '../components/WeeklyReviewCard.tsx';
import type { Person, Task, Touch } from '../db/schema.ts';
import { synthesise } from '../lib/review.ts';

interface Props {
  people: Person[];
  touches: Touch[];
  tasks: Task[];
  onOpen: (personId: string) => void;
  onToggleTask: (taskId: string, done: boolean) => void;
}

export function Review({ people, touches, tasks, onOpen, onToggleTask }: Props) {
  const result = useMemo(
    () => synthesise({ people, touches, tasks }),
    [people, touches, tasks],
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>Review</h2>
      </div>
      <p className="muted small">
        Sunday-morning surface. Three buckets: who's gone quiet, who you're on a roll with, and
        promises you owe.
      </p>
      <WeeklyReviewCard result={result} onOpen={onOpen} onToggleTask={onToggleTask} />
    </div>
  );
}
