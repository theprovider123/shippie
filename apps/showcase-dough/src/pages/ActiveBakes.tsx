import { useMemo } from 'react';
import type { Bake } from '../db.ts';
import { activeBakes } from '../db.ts';
import { BakeCard } from '../components/BakeCard.tsx';

interface Props {
  bakes: Bake[];
  onCancel: () => void;
  onOpenBake: (id: string) => void;
}

export function ActiveBakes({ bakes, onCancel, onOpenBake }: Props) {
  const list = useMemo(() => activeBakes(bakes), [bakes]);

  return (
    <main className="app">
      <header className="page-header">
        <button type="button" className="back" onClick={onCancel}>
          ← Back
        </button>
        <h1>In flight</h1>
        <p className="subtitle">{list.length} {list.length === 1 ? 'bake' : 'bakes'}</p>
      </header>
      {list.length === 0 ? (
        <p className="muted empty">
          Nothing fermenting right now. Pick a recipe from the home page to start.
        </p>
      ) : (
        <div className="bake-list">
          {list.map((b) => (
            <BakeCard key={b.id} bake={b} onOpen={() => onOpenBake(b.id)} />
          ))}
        </div>
      )}
    </main>
  );
}
