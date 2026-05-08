/**
 * Scan — three on-ramps stacked top-to-bottom:
 *   1. Photo identify (on-device vision) — the headline AI moment
 *   2. Barcode scan / type
 *   3. Add by hand
 *
 * Ordering is deliberate: the photo path is the most novel, and putting
 * it first turns "I bought random veg" into the obvious flow.
 */
import { useEffect, useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import { isValidBarcode, lookupByBarcode } from '../barcode.ts';
import { lookupAndCache, readCached } from '../lib/off.ts';
import type { PantryStore } from '../lib/store.ts';
import { LOCATIONS, LOCATION_LABELS, type Location } from '../lib/types.ts';
import { ClassifyConfirm } from '../components/ClassifyConfirm.tsx';
import { BarcodeForm } from '../components/BarcodeForm.tsx';

interface ScanProps {
  shippie: ShippieIframeSdk;
  store: PantryStore;
}

export function Scan({ shippie, store }: ScanProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [location, setLocation] = useState<Location>('pantry');
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | 'error'>('ok');

  const [classifyHint, setClassifyHint] = useState<{
    label: string;
    confidence: number;
  } | null>(null);

  function setNote(message: string, kind: 'ok' | 'warn' | 'error' = 'ok') {
    setStatus(message);
    setStatusKind(kind);
  }

  async function tryAddByBarcode(raw: string) {
    const trimmed = raw.trim();
    if (!isValidBarcode(trimmed)) {
      setNote(`Invalid barcode (${trimmed.length} digits)`, 'error');
      shippie.feel.texture('error');
      return;
    }

    // 1. Local catalogue.
    const known = lookupByBarcode(trimmed);
    if (known) {
      const item = store.addItem({
        name: known.name,
        unit: known.defaultUnit,
        location: known.defaultLocation,
        barcode: trimmed,
        expiresOn: shelfLifeDate(known.shelfLifeDays),
      });
      setNote(`Added ${item.name} to ${LOCATION_LABELS[item.location]}`);
      shippie.feel.texture('confirm');
      return;
    }

    // 2. OFF cache (offline path).
    const cached = readCached(trimmed);
    if (cached?.name) {
      const item = store.addItem({
        name: cached.name,
        unit: cached.unit ?? 'ea',
        barcode: trimmed,
      });
      setNote(`Added ${item.name} (from cached scan)`);
      shippie.feel.texture('confirm');
      return;
    }

    // 3. Live OFF lookup.
    setNote(`Looking up ${trimmed}…`, 'warn');
    try {
      const product = await lookupAndCache(trimmed);
      if (product?.name) {
        const item = store.addItem({
          name: product.name,
          unit: product.unit ?? 'ea',
          barcode: trimmed,
          notes: product.brand ?? undefined,
        });
        setNote(`Added ${item.name}${product.brand ? ` (${product.brand})` : ''}`);
        shippie.feel.texture('confirm');
        return;
      }
    } catch {
      // network down — fall through
    }
    setBarcode(trimmed);
    setNote(`Barcode ${trimmed} not found. Name it manually below.`, 'warn');
  }

  function addManual(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const item = store.addItem({
      name: trimmed,
      barcode: barcode.trim() || undefined,
      quantity,
      unit: unit.trim() || 'ea',
      expiresOn: expiresOn || undefined,
      location,
      notes: notes.trim() || undefined,
    });
    setNote(`Added ${item.name} to ${LOCATION_LABELS[item.location]}`);
    shippie.feel.texture('confirm');
    setName('');
    setBarcode('');
    setQuantity(1);
    setUnit('');
    setExpiresOn('');
    setNotes('');
    setLocation('pantry');
    setClassifyHint(null);
  }

  // Auto-clear status after a moment so the panel doesn't stay loud.
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(''), 6000);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <main className="page page-scan">
      <header>
        <h1>Add</h1>
        <p>Photo, barcode, or by hand.</p>
      </header>

      <ClassifyConfirm
        shippie={shippie}
        onPick={(label, confidence) => {
          setName(label);
          setClassifyHint({ label, confidence });
          setNote(
            `looks like ${label} (${(confidence * 100).toFixed(0)}%) — confirm or rename`,
            'warn',
          );
          shippie.feel.texture('confirm');
        }}
      />

      <BarcodeForm
        onResolve={(code) => void tryAddByBarcode(code)}
        onError={(msg) => setNote(msg, 'error')}
      />

      <section>
        <h2>Add by hand</h2>
        <form onSubmit={addManual} className="manual-form">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name (e.g. leek, half-onion, salmon)"
            aria-label="Name"
          />
          <div className="row">
            <input
              type="number"
              value={quantity}
              min={1}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
              aria-label="Quantity"
            />
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Unit (g, ml, ea)"
              aria-label="Unit"
            />
          </div>
          <div className="row">
            <input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              aria-label="Expires on"
            />
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as Location)}
              aria-label="Location"
            >
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCATION_LABELS[loc]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional — brand, source, etc.)"
            aria-label="Notes"
          />
          <button
            type="submit"
            className="row-btn row-btn-primary"
            disabled={!name.trim()}
          >
            {classifyHint ? `Add as ${classifyHint.label}` : 'Add'}
          </button>
        </form>
      </section>

      {status && (
        <p className={`status status-${statusKind}`}>{status}</p>
      )}
    </main>
  );
}

function shelfLifeDate(days: number | undefined): string | undefined {
  if (!days || !Number.isFinite(days)) return undefined;
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
