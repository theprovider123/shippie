import type { Habit } from '../types.ts';

/**
 * Archive view — the graveyard, but not framed as one. Habits the
 * user said "I'm not doing this anymore" to. Reactivatable; history
 * always preserved.
 */
export function Archive({
  habits,
  onReactivate,
  onBack,
}: {
  habits: readonly Habit[];
  onReactivate: (habit: Habit) => void;
  onBack: () => void;
}) {
  const archived = habits.filter((h) => h.archivedAt);
  return (
    <main className="page-archive">
      <header className="page-head with-back">
        <button type="button" className="back" onClick={onBack} aria-label="Back">
          ← back
        </button>
        <h1>Archive</h1>
      </header>

      {archived.length === 0 ? (
        <p className="muted">Nothing archived. Habits you stop doing land here, with their history intact.</p>
      ) : (
        <ul className="archive-list">
          {archived.map((h) => (
            <li key={h.id} className="archive-row">
              <div>
                <span className="name">{h.name}</span>
                <span className="muted small">archived {h.archivedAt!.slice(0, 10)}</span>
              </div>
              <button type="button" className="ghost" onClick={() => onReactivate(h)}>
                Reactivate
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
