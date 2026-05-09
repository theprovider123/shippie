/**
 * Inventory — track herbs you have on hand. Update grams + low
 * threshold per row. Low-stock badges call out what to restock.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Herb, InventoryRow } from '../db/schema.ts';
import { listHerbs, listInventory, setInventory } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { formatGrams } from '../utils/scale.ts';

interface InventoryPageProps {
  onClose: () => void;
}

interface Joined {
  herb: Herb;
  row: InventoryRow | null;
}

export function InventoryPage({ onClose }: InventoryPageProps) {
  const [herbs, setHerbs] = useState<Herb[]>([]);
  const [inventory, setInventoryRows] = useState<InventoryRow[]>([]);
  const [editing, setEditing] = useState<{ herbId: string; grams: string; threshold: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'stocked' | 'low'>('all');

  const refresh = async () => {
    const db = resolveLocalDb();
    const [h, inv] = await Promise.all([listHerbs(db), listInventory(db)]);
    setHerbs(h);
    setInventoryRows(inv);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const joined: Joined[] = useMemo(() => {
    const byHerb = new Map(inventory.map((row) => [row.herb_id, row]));
    return herbs.map((h) => ({ herb: h, row: byHerb.get(h.id) ?? null }));
  }, [herbs, inventory]);

  const filtered = useMemo(() => {
    if (filter === 'all') return joined;
    if (filter === 'stocked') return joined.filter((j) => (j.row?.grams_on_hand ?? 0) > 0);
    return joined.filter((j) => isLow(j.row));
  }, [joined, filter]);

  const lowCount = joined.filter((j) => isLow(j.row)).length;

  const save = async () => {
    if (!editing) return;
    const grams = Number(editing.grams);
    const threshold = editing.threshold === '' ? null : Number(editing.threshold);
    if (!Number.isFinite(grams) || grams < 0) return;
    setBusy(true);
    try {
      await setInventory(resolveLocalDb(), {
        herb_id: editing.herbId,
        grams_on_hand: grams,
        low_threshold_g: threshold,
      });
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Inventory</h1>
          <p className="muted">
            {joined.length} herbs · {lowCount > 0 ? `${lowCount} low` : 'all stocked'}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Back
        </button>
      </header>

      <div className="intent-chip-row" aria-label="Filter inventory">
        {(['all', 'stocked', 'low'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`intent-chip intent-chip-sm${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'stocked' ? 'In stock' : `Low (${lowCount})`}
          </button>
        ))}
      </div>

      <ul className="recipe-list" aria-label="Herb inventory">
        {filtered.map(({ herb, row }) => (
          <li key={herb.id} className="recipe-card-wrapper">
            <article className="recipe-card inventory-row">
              <div className="inventory-row-main">
                <h3>{herb.common_name}</h3>
                {herb.latin_name ? <p className="muted">{herb.latin_name}</p> : null}
              </div>
              <div className="inventory-row-stock">
                <span
                  className={`inventory-grams${isLow(row) ? ' low' : ''}`}
                  aria-label={`${row?.grams_on_hand ?? 0} grams in stock`}
                >
                  {row ? formatGrams(row.grams_on_hand) : '—'}
                </span>
                {isLow(row) ? <span className="inventory-badge">low</span> : null}
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      herbId: herb.id,
                      grams: String(row?.grams_on_hand ?? 0),
                      threshold: row?.low_threshold_g ? String(row.low_threshold_g) : '',
                    })
                  }
                >
                  Edit
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="data-panel-backdrop" role="presentation" onClick={() => setEditing(null)}>
          <section
            className="data-panel"
            role="dialog"
            aria-labelledby="inventory-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="data-panel-header">
              <h2 id="inventory-edit-title">
                {herbs.find((h) => h.id === editing.herbId)?.common_name ?? 'Edit'}
              </h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing(null)}
                aria-label="Cancel edit"
              >
                ×
              </button>
            </header>

            <label className="field">
              <span>Grams on hand</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={editing.grams}
                onChange={(e) => setEditing({ ...editing, grams: e.target.value })}
                autoFocus
              />
            </label>

            <label className="field">
              <span>Low warning at (grams)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={editing.threshold}
                onChange={(e) => setEditing({ ...editing, threshold: e.target.value })}
                placeholder="Optional"
              />
            </label>

            <div className="data-panel-actions">
              <button type="button" className="primary" onClick={save} disabled={busy}>
                Save
              </button>
              <button type="button" className="ghost" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function isLow(row: InventoryRow | null): boolean {
  if (!row) return false;
  if (row.low_threshold_g == null) return false;
  return row.grams_on_hand <= row.low_threshold_g;
}
