import type { Pitch } from '../lib/store.ts';
import { PITCH_STATUS_LABEL } from '../lib/store.ts';
import { PITCH_TYPE_LABEL } from '../lib/templates.ts';

export interface HomePageProps {
  pitches: Pitch[];
  onOpen: (id: string) => void;
  onNew: () => void;
}

/** Sort by deadline soonest-first; null deadlines (none) go last. */
function sortByDeadline(pitches: Pitch[]): Pitch[] {
  return [...pitches].sort((a, b) => {
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export function HomePage({ pitches, onOpen, onNew }: HomePageProps) {
  const sorted = sortByDeadline(pitches);
  return (
    <section className="page">
      <header className="page-header">
        <h2>Your pitches</h2>
        <button type="button" className="primary" onClick={onNew}>
          New pitch
        </button>
      </header>

      {sorted.length === 0 ? (
        <p className="empty">
          Nothing yet. Start a grant proposal, RFP response, or sponsorship ask — your drafts stay local unless you export them.
        </p>
      ) : (
        <ul className="pitch-list">
          {sorted.map((p) => {
            const days = daysUntil(p.deadline);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="pitch-row"
                  onClick={() => onOpen(p.id)}
                >
                  <div className="pitch-row-main">
                    <span className="pitch-title">{p.title || 'Untitled'}</span>
                    <span className="pitch-meta">
                      {PITCH_TYPE_LABEL[p.type]}
                      {p.target ? ` · ${p.target}` : ''}
                    </span>
                  </div>
                  <div className="pitch-row-tail">
                    <span className={`status-pill status-${p.status}`}>
                      {PITCH_STATUS_LABEL[p.status]}
                    </span>
                    {p.deadline ? (
                      <span className={`deadline ${days !== null && days < 7 ? 'urgent' : ''}`}>
                        {days === null
                          ? p.deadline
                          : days < 0
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                              ? 'due today'
                              : `${days}d`}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function daysUntil(deadline: string): number | null {
  if (!deadline) return null;
  const target = Date.parse(`${deadline}T00:00:00`);
  if (Number.isNaN(target)) return null;
  const today = new Date();
  const todayMs = Date.parse(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00`,
  );
  return Math.round((target - todayMs) / 86_400_000);
}
