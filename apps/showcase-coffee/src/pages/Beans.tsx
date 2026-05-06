import { useState } from 'react';
import type { Bean } from '../db.ts';
import { BeanRow } from '../components/BeanRow.tsx';
import { FreshnessChart } from '../components/FreshnessChart.tsx';
import { BeanEditor } from '../components/BeanEditor.tsx';

interface BeansPageProps {
  beans: ReadonlyArray<Bean>;
  onSelect: (id: string) => void;
  onSave: (b: Bean) => void;
}

export function BeansPage({ beans, onSelect, onSave }: BeansPageProps) {
  const [composing, setComposing] = useState<boolean>(false);

  return (
    <main className="page page-beans">
      <header className="page-header">
        <div>
          <h2>Bean library</h2>
          <p className="muted small">{beans.length} beans · tap one to brew</p>
        </div>
        <button type="button" className="primary" onClick={() => setComposing(true)}>
          + Add bean
        </button>
      </header>

      <FreshnessChart beans={beans} onSelect={onSelect} />

      <section className="bean-list" aria-label="All beans">
        {beans.length === 0 ? (
          <p className="empty">No beans yet. Add one to get started.</p>
        ) : (
          beans.map((b) => <BeanRow key={b.id} bean={b} onClick={onSelect} />)
        )}
      </section>

      {composing ? (
        <BeanEditor
          bean={null}
          onSave={(b) => {
            onSave(b);
            setComposing(false);
          }}
          onCancel={() => setComposing(false)}
          onDelete={null}
        />
      ) : null}
    </main>
  );
}
