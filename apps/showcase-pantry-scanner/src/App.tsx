import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { isValidBarcode, listKnownBarcodes, lookupByBarcode } from './barcode.ts';
import {
  detectCameraScanAvailability,
  scanFromCamera,
} from './camera-scan.ts';
import { PhotoClassify } from './PhotoClassify.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_pantry_scanner' });

interface Item {
  id: string;
  name: string;
  barcode?: string;
  quantity: number;
  unit: string;
  /** ISO date (YYYY-MM-DD) — when the item is no longer good. Optional. */
  expiresOn?: string;
  addedAt: string;
}

interface InventoryRow {
  id: string;
  name: string;
  inStock: boolean;
  quantity: number;
  unit: string;
  expiresOn?: string;
}

const STORAGE_KEY = 'shippie.pantry-scanner.v1';
const EXPIRY_WARNING_DAYS = 2;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * P3 — broadcast pantry-inventory with `inStock` and expiry metadata.
 * Recipe Saver renders rows green/red against `inStock`; Meal Planner
 * uses the name list. Empty inventory still fires (delivers `[]`)
 * so consumers know the user just emptied their pantry.
 */
function broadcastInventory(items: readonly Item[]): void {
  const rows: InventoryRow[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    inStock: it.quantity > 0,
    quantity: it.quantity,
    unit: it.unit,
    expiresOn: it.expiresOn,
  }));
  shippie.intent.broadcast('pantry-inventory', rows);
}

function broadcastPantryLow(item: Item): void {
  shippie.intent.broadcast('pantry-low', [
    { name: item.name, barcode: item.barcode, lastSeenAt: item.addedAt },
  ]);
}

function daysUntil(dateStr: string, now: number = Date.now()): number {
  const target = Date.parse(dateStr);
  if (!Number.isFinite(target)) return Number.POSITIVE_INFINITY;
  return Math.floor((target - now) / ONE_DAY_MS);
}

export function App() {
  const [items, setItems] = useState<Item[]>(() => load());
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [status, setStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraAvail = useMemo(() => detectCameraScanAvailability(), []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // P3 — broadcast initial inventory once the SDK is ready so consumers
  // don't have to wait for the next add/remove. Empty arrays are fine.
  useEffect(() => {
    broadcastInventory(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return items.filter((it) => {
      if (!it.expiresOn) return false;
      const days = daysUntil(it.expiresOn, now);
      return days >= 0 && days <= EXPIRY_WARNING_DAYS;
    });
  }, [items]);

  function tryAddByBarcode(raw: string) {
    const trimmed = raw.trim();
    if (!isValidBarcode(trimmed)) {
      setStatus(`Invalid barcode (${trimmed.length} digits)`);
      shippie.feel.texture('error');
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
    shippie.feel.texture('confirm');
    setCode('');
  }

  async function startCameraScan() {
    if (!cameraAvail.detector || !cameraAvail.camera) return;
    setScanning(true);
    setStatus('Point the camera at the barcode…');
    try {
      const video = videoRef.current;
      if (!video) throw new Error('Video element missing');
      const result = await scanFromCamera(video);
      shippie.feel.texture('confirm');
      tryAddByBarcode(result.rawValue);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Scan failed.');
      shippie.feel.texture('error');
    } finally {
      setScanning(false);
    }
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
      expiresOn: expiresOn || undefined,
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
    setExpiresOn('');
    setStatus(`Added ${item.name}`);
    shippie.feel.texture('confirm');
  }

  function remove(id: string) {
    setItems((prev) => {
      const removed = prev.find((i) => i.id === id);
      const next = prev.filter((i) => i.id !== id);
      broadcastInventory(next);
      // P3 — `pantry-low` fires when the user removes the last unit
      // of an item. Other apps (Shopping List) react by adding it
      // automatically.
      if (removed) {
        broadcastPantryLow(removed);
        shippie.feel.texture('delete');
      }
      return next;
    });
  }

  return (
    <main>
      <header>
        <h1>Pantry</h1>
        <p>{items.length} item{items.length === 1 ? '' : 's'} on hand</p>
      </header>

      {expiringSoon.length > 0 && (
        <section className="expiry-warn" aria-label="Expiring soon">
          <strong>Expiring soon:</strong>{' '}
          {expiringSoon.map((it, i) => (
            <span key={it.id}>
              {i > 0 && ', '}
              {it.name}
              {it.expiresOn && ` (in ${daysUntil(it.expiresOn)}d)`}
            </span>
          ))}
        </section>
      )}

      <section className="scan">
        <h2>Scan</h2>
        {cameraAvail.detector && cameraAvail.camera ? (
          <div className="camera">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`camera-feed ${scanning ? 'active' : ''}`}
            />
            <button onClick={startCameraScan} disabled={scanning}>
              {scanning ? 'Scanning…' : 'Scan with camera'}
            </button>
          </div>
        ) : (
          <p className="hint">{cameraAvail.unsupportedReason}</p>
        )}
        <p className="hint">Or type a 12/13-digit barcode below.</p>
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

      <PhotoClassify
        shippie={shippie}
        onPick={(label) => {
          setName(label);
          setStatus(`Suggested: ${label}`);
          shippie.feel.texture('confirm');
        }}
      />

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
            <input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              aria-label="Expires on"
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
            {items.map((it) => {
              const days = it.expiresOn ? daysUntil(it.expiresOn) : null;
              const expiringSoonRow = days !== null && days >= 0 && days <= EXPIRY_WARNING_DAYS;
              const expired = days !== null && days < 0;
              return (
                <li
                  key={it.id}
                  className={
                    expired ? 'expired' : expiringSoonRow ? 'expiring' : ''
                  }
                >
                  <div>
                    <strong>{it.name}</strong>
                    <small>
                      {it.quantity} {it.unit}
                      {it.barcode && ` · ${it.barcode}`}
                      {it.expiresOn && ` · expires ${it.expiresOn}`}
                    </small>
                  </div>
                  <button onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>×</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
