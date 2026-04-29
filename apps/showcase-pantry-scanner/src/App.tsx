import { useEffect, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { isValidBarcode, listKnownBarcodes, lookupByBarcode } from './barcode.ts';

const shippie = createShippieIframeSdk({ appId: 'app_pantry_scanner' });

interface Item {
  id: string;
  name: string;
  barcode?: string;
  quantity: number;
  unit: string;
  addedAt: string;
}

const STORAGE_KEY = 'shippie.pantry-scanner.v1';

function load(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Item[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function broadcastInventory(items: readonly Item[]): void {
  shippie.intent.broadcast('pantry-inventory', items);
}

export function App() {
  const [items, setItems] = useState<Item[]>(() => load());
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function tryAddByBarcode(raw: string) {
    const trimmed = raw.trim();
    if (!isValidBarcode(trimmed)) {
      setStatus(`Invalid barcode (${trimmed.length} digits)`);
      return;
    }
    const known = lookupByBarcode(trimmed);
    if (!known) {
      setStatus(`Barcode ${trimmed} not in local catalogue — name it manually`);
      setCode(trimmed);
      return;
    }
    const item: Item = {
      id: `i_${Date.now()}`,
      name: known.name,
      barcode: trimmed,
      quantity: 1,
      unit: known.defaultUnit,
      addedAt: new Date().toISOString(),
    };
    setItems((prev) => {
      const next = [item, ...prev];
      broadcastInventory(next);
      return next;
    });
    setStatus(`Added ${item.name}`);
    setCode('');
  }

  function addManual(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const item: Item = {
      id: `i_${Date.now()}`,
      name: trimmedName,
      barcode: code.trim() || undefined,
      quantity,
      unit: unit.trim() || 'ea',
      addedAt: new Date().toISOString(),
    };
    setItems((prev) => {
      const next = [item, ...prev];
      broadcastInventory(next);
      return next;
    });
    setName('');
    setCode('');
    setQuantity(1);
    setUnit('');
    setStatus(`Added ${item.name}`);
  }

  function remove(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      broadcastInventory(next);
      return next;
    });
  }

  return (
    <main>
      <header>
        <h1>Pantry</h1>
        <p>{items.length} item{items.length === 1 ? '' : 's'} on hand</p>
      </header>

      <section className="scan">
        <h2>Scan</h2>
        <p className="hint">Type or paste a 12/13-digit barcode. Real device scanning happens through `BarcodeDetector` on supported browsers.</p>
        <div className="row">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Barcode (digits only)"
            inputMode="numeric"
            aria-label="Barcode"
          />
          <button onClick={() => tryAddByBarcode(code)}>Resolve</button>
        </div>
        {status && <p className="status">{status}</p>}
        <details>
          <summary>Demo barcodes (offline catalogue)</summary>
          <ul className="known">
            {listKnownBarcodes().map((b) => (
              <li key={b}>
                <button onClick={() => { setCode(b); tryAddByBarcode(b); }}>{b}</button>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section>
        <h2>Add by hand</h2>
        <form onSubmit={addManual}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
            aria-label="Name"
          />
          <div className="row">
            <input
              type="number"
              value={quantity}
              min={1}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Quantity"
            />
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Unit (g, ml, ea)"
              aria-label="Unit"
            />
            <button type="submit">Add</button>
          </div>
        </form>
      </section>

      <section>
        <h2>Inventory</h2>
        {items.length === 0 ? (
          <p className="empty">Nothing yet. Scan or add an item above.</p>
        ) : (
          <ul className="items">
            {items.map((it) => (
              <li key={it.id}>
                <div>
                  <strong>{it.name}</strong>
                  <small>
                    {it.quantity} {it.unit}
                    {it.barcode && ` · ${it.barcode}`}
                  </small>
                </div>
                <button onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
