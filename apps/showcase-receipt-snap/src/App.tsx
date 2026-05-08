import { useEffect, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { CapturePage } from './pages/Capture.tsx';
import { ReviewPage } from './pages/Review.tsx';
import { HistoryPage } from './pages/History.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import {
  CATEGORIES,
  clearAll,
  insert,
  load,
  newId,
  remove,
  save,
  update,
  type Receipt,
} from './lib/store.ts';
import { parseReceipt, type ExtractedReceipt } from './lib/parse-receipt.ts';
import type { ReviewFormValues } from './components/ReviewForm.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_receipt_snap' });

const MODEL_WARM_KEY = 'shippie.receipt-snap.model-warm.v1';

type Tab = 'capture' | 'history' | 'settings';
type Screen = { kind: 'tab' } | { kind: 'review'; rawText: string; imageDataUrl: string };

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'capture', label: 'Capture' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

const RESTAURANT_CATEGORIES = new Set<string>(['restaurant', 'food']);

export function App() {
  const [receipts, setReceipts] = useState<Receipt[]>(() => load().receipts);
  const [tab, setTab] = useState<Tab>('capture');
  const [screen, setScreen] = useState<Screen>({ kind: 'tab' });
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [modelWarm, setModelWarm] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MODEL_WARM_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    save({ receipts });
  }, [receipts]);

  function markModelWarm() {
    if (modelWarm) return;
    setModelWarm(true);
    try {
      localStorage.setItem(MODEL_WARM_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function onExtracted(rawText: string, imageDataUrl: string) {
    setExtracted(parseReceipt(rawText));
    setScreen({ kind: 'review', rawText, imageDataUrl });
  }

  function onSave(values: ReviewFormValues) {
    if (screen.kind !== 'review' || !extracted) return;
    const receipt: Receipt = {
      id: newId(),
      vendor: values.vendor,
      total_cents: values.total_cents,
      currency: values.currency,
      category: values.category,
      occurred_on: values.occurred_on || null,
      captured_at: new Date().toISOString(),
      raw_ocr_text: screen.rawText,
      image_data_url: screen.imageDataUrl,
      note: values.note,
    };
    setReceipts((prev) => insert({ receipts: prev }, receipt).receipts);
    broadcastSaved(receipt);
    shippie.feel.texture('confirm');
    setScreen({ kind: 'tab' });
    setExtracted(null);
    setTab('history');
  }

  function broadcastSaved(receipt: Receipt) {
    // Ledger consumes expense-logged. Payload is intentionally minimal —
    // amount + when + where + category — no photo, no raw OCR text.
    shippie.intent.broadcast('expense-logged', [
      {
        amount_cents: receipt.total_cents ?? 0,
        currency: receipt.currency,
        category: receipt.category,
        vendor: receipt.vendor,
        occurred_on: receipt.occurred_on ?? receipt.captured_at.slice(0, 10),
      },
    ]);
    if (RESTAURANT_CATEGORIES.has(receipt.category) && receipt.vendor) {
      // Restaurant Memory + Atlas listen for this. Optional — skipped
      // when category implies a non-meal purchase.
      shippie.intent.broadcast('dined-out', [
        {
          venue: receipt.vendor,
          occurred_on: receipt.occurred_on ?? receipt.captured_at.slice(0, 10),
          amount_cents: receipt.total_cents ?? 0,
          currency: receipt.currency,
        },
      ]);
    }
  }

  function onCancel() {
    setScreen({ kind: 'tab' });
    setExtracted(null);
  }

  function onDelete(id: string) {
    setReceipts((prev) => remove({ receipts: prev }, id).receipts);
  }

  function onUpdate(id: string, patch: Partial<Receipt>) {
    setReceipts((prev) => update({ receipts: prev }, id, patch).receipts);
  }

  function onClearAll() {
    setReceipts([]);
    clearAll();
    shippie.feel.texture('milestone');
  }

  function openYourData() {
    shippie.openYourData({ appSlug: 'receipt-snap' });
  }

  // Make the linter aware we'll use CATEGORIES via the form components.
  void CATEGORIES;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Receipt Snap</h1>
        <p className="subtitle">snap · review · save</p>
      </header>

      {screen.kind === 'tab' ? (
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={t.id === tab}
              className={`tab ${t.id === tab ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {screen.kind === 'review' && extracted ? (
        <ReviewPage
          extracted={extracted}
          rawOcrText={screen.rawText}
          imageDataUrl={screen.imageDataUrl}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : tab === 'capture' ? (
        <CapturePage
          modelWarm={modelWarm}
          onExtracted={onExtracted}
          onMarkWarm={markModelWarm}
        />
      ) : tab === 'history' ? (
        <HistoryPage receipts={receipts} onDelete={onDelete} onUpdate={onUpdate} />
      ) : (
        <SettingsPage receipts={receipts} modelWarm={modelWarm} onClearAll={onClearAll} />
      )}

      <button type="button" className="your-data" onClick={openYourData}>
        Your Data
      </button>
    </div>
  );
}
