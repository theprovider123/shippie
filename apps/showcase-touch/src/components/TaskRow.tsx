import type { Task } from '../db/schema.ts';

interface Props {
  task: Task;
  personLabel?: string;
  onToggle: (id: string, done: boolean) => void;
}

function formatDue(iso: string | null): string {
  if (!iso) return '';
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return '';
  const diffDays = Math.round((due - Date.now()) / 86_400_000);
  if (diffDays === 0) return 'due today';
  if (diffDays === 1) return 'due tomorrow';
  if (diffDays < 0) return `overdue ${Math.abs(diffDays)}d`;
  return `due in ${diffDays}d`;
}

export function TaskRow({ task, personLabel, onToggle }: Props) {
  const done = Boolean(task.done_at);
  return (
    <div className={`task-row ${done ? 'done' : ''}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggle(task.id, !done)}
        aria-label={done ? 'Mark task open' : 'Mark task done'}
      />
      <div className="body">
        {task.body}
        {personLabel ? <span className="muted small"> · {personLabel}</span> : null}
      </div>
      <span className="due">{formatDue(task.due_at)}</span>
    </div>
  );
}
