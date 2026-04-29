/**
 * __NAME__ — generated from `bun run new:showcase __SLUG__`.
 *
 * The scaffold ships a minimal "list of items" UI so the build/deploy
 * pipeline produces something visible the first time you run it. Wire
 * intents (`shippie.intent.broadcast` / `subscribe`) and AI tasks
 * (`shippie.ai.run`) once the showcase has actual behaviour to express.
 */
import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';

interface Item {
  id: string;
  title: string;
  createdAt: number;
}

export function App() {
  const sdk = useMemo(
    () => createShippieIframeSdk({ appId: '__SLUG__' }),
    [],
  );
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    // TODO: subscribe to a relevant intent here once the manifest
    // declares one in `intents.consumes`. Example:
    //   const off = sdk.intent.subscribe('cooked-meal', (b) => ...);
    //   return () => off();
  }, [sdk]);

  function add() {
    const title = draft.trim();
    if (!title) return;
    const item: Item = { id: crypto.randomUUID(), title, createdAt: Date.now() };
    setItems((prev) => [item, ...prev]);
    setDraft('');
    sdk.feel.texture('confirm');
  }

  return (
    <main>
      <header>
        <h1>__NAME__</h1>
        <p>Generated showcase. Replace this body with the real app.</p>
      </header>
      <section className="add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New item"
          aria-label="New item title"
        />
        <button type="button" onClick={add}>
          Add
        </button>
      </section>
      <ul>
        {items.length === 0 && <li className="empty">No items yet.</li>}
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </main>
  );
}
