/**
 * Settings — Your Data + housekeeping. Kept tiny: open the data panel,
 * dump the inventory, clear everything.
 */
import { useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { PantryStore } from '../lib/store.ts';

interface SettingsProps {
  shippie: ShippieIframeSdk;
  store: PantryStore;
}

export function Settings({ shippie, store }: SettingsProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ items: store.items, consumption: store.consumption }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pantry-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page page-settings">
      <header>
        <h1>Settings</h1>
        <p>Privacy: every item lives on this device. Nothing leaves.</p>
      </header>

      <section>
        <h2>Your data</h2>
        <p className="hint">
          Open the platform Your Data panel to see exactly what's been
          stored, what's been broadcast, and what was received.
        </p>
        <button
          type="button"
          className="row-btn row-btn-primary"
          onClick={() => shippie.openYourData({ appSlug: 'pantry-scanner' })}
        >
          Open Your Data
        </button>
      </section>

      <section>
        <h2>Export</h2>
        <p className="hint">
          {store.items.length} items · {store.consumption.length} consumption
          events recorded.
        </p>
        <button
          type="button"
          className="row-btn row-btn-ghost"
          onClick={exportJson}
        >
          Download as JSON
        </button>
      </section>

      <section>
        <h2>Clear all</h2>
        <p className="hint">
          Wipes every row + the consumption log. Cannot be undone.
        </p>
        {confirmingClear ? (
          <div className="row">
            <button
              type="button"
              className="row-btn row-btn-danger"
              onClick={() => {
                store.clearAll();
                setConfirmingClear(false);
                shippie.feel.texture('delete');
              }}
            >
              Yes, wipe it
            </button>
            <button
              type="button"
              className="row-btn row-btn-ghost"
              onClick={() => setConfirmingClear(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="row-btn row-btn-ghost"
            onClick={() => setConfirmingClear(true)}
          >
            Clear all data
          </button>
        )}
      </section>

      <section>
        <h2>About</h2>
        <p className="hint">
          Pantry Scanner. Wrap. Run. Connect. Photo classify runs fully
          on-device via the platform's vision worker; barcode lookups are
          local-first with an Open Food Facts fallback that gets cached
          for offline use.
        </p>
      </section>
    </main>
  );
}
