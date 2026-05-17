import type { Brew } from '../db.ts';
import { BrewSessionRow } from '../components/BrewSessionRow.tsx';

interface HistoryPageProps {
  brews: ReadonlyArray<Brew>;
}

export function HistoryPage({ brews }: HistoryPageProps) {
  return (
    <main className="page page-history">
      <header className="page-header">
        <h2>Brew history</h2>
        <p className="muted small">{brews.length} brews logged</p>
      </header>
      {brews.length === 0 ? (
        <p className="empty">No brews yet. Pull a shot or pour one over.</p>
      ) : (
        <ul className="session-list">
          {brews.map((b) => (
            <BrewSessionRow key={b.id} brew={b} />
          ))}
        </ul>
      )}
    </main>
  );
}
