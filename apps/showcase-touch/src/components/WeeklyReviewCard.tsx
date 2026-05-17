import type { Person } from '../db/schema.ts';
import type { ReviewResult } from '../lib/review.ts';

interface Props {
  result: ReviewResult;
  onOpen: (personId: string) => void;
  onToggleTask: (taskId: string, done: boolean) => void;
}

export function WeeklyReviewCard({ result, onOpen, onToggleTask }: Props) {
  return (
    <div className="card">
      <h3>Weekly review</h3>
      <p className="muted small">
        Generated {new Date(result.generatedAt).toLocaleString()}. No data leaves this device.
      </p>

      <div className="review-section">
        <h4>You've gone quiet on these</h4>
        {result.goneQuiet.length === 0 ? (
          <p className="muted small">Nobody overdue. Rare and good.</p>
        ) : (
          <ul className="person-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {result.goneQuiet.slice(0, 5).map((item) => (
              <li key={item.person.id}>
                <button
                  type="button"
                  className="person-card"
                  onClick={() => onOpen(item.person.id)}
                >
                  <div className="name">{item.person.name}</div>
                  <div className="meta">
                    <span className="pill overdue">
                      {item.daysSinceLastTouch === null
                        ? 'no touches yet'
                        : `${item.daysSinceLastTouch}d quiet`}
                    </span>
                    {item.lastSummary ? (
                      <span className="small muted">last: {item.lastSummary}</span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="review-section">
        <h4>These went well — any next steps?</h4>
        {result.positive.length === 0 ? (
          <p className="muted small">No positive recent touches yet. Log one when something good happens.</p>
        ) : (
          <ul className="person-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {result.positive.slice(0, 5).map((item) => (
              <li key={item.person.id}>
                <button
                  type="button"
                  className="person-card"
                  onClick={() => onOpen(item.person.id)}
                >
                  <div className="name">{item.person.name}</div>
                  <div className="meta">
                    <span className="pill fresh">good · {item.daysSinceLastTouch ?? 0}d ago</span>
                    {item.lastSummary ? <span className="small muted">{item.lastSummary}</span> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="review-section">
        <h4>Things you said you'd do</h4>
        {result.dueActions.length === 0 ? (
          <p className="muted small">No open promises. Either you're caught up or nobody asked.</p>
        ) : (
          <div>
            {result.dueActions.map(({ task, person }) => (
              <div className={`task-row ${task.done_at ? 'done' : ''}`} key={task.id}>
                <input
                  type="checkbox"
                  checked={Boolean(task.done_at)}
                  onChange={() => onToggleTask(task.id, !task.done_at)}
                  aria-label="Toggle task"
                />
                <div className="body">
                  {task.body}
                  {person ? (
                    <button
                      type="button"
                      className="ghost small"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: '#7E7570',
                        padding: 0,
                        marginLeft: 6,
                        cursor: 'pointer',
                      }}
                      onClick={() => onOpen(person.id)}
                    >
                      · {(person as Person).name}
                    </button>
                  ) : null}
                </div>
                <span className="due">
                  {task.due_at ? new Date(task.due_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
