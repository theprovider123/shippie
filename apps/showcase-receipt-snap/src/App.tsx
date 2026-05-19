import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { CapturePage } from './pages/Capture.tsx';
import { ReviewPage } from './pages/Review.tsx';
import { HistoryPage } from './pages/History.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import {
  CATEGORIES,
  clearAll,
  discardAllPhotos,
  insert,
  load,
  markExported,
  newId,
  remove,
  save,
  update,
  type Receipt,
} from './lib/store.ts';
import { parseReceipt, type ExtractedReceipt } from './lib/parse-receipt.ts';
import type { ReviewFormValues } from './components/ReviewForm.tsx';
import {
  buildSampleReceipts,
  hasSampleData as hasSampleDataIn,
  withoutSamples,
} from './lib/sample-data.ts';
import {
  EVENT_DINED_OUT,
  EVENT_EXPENSE_LOGGED,
  type DinedOutPayload,
  type ExpenseLoggedPayload,
} from './lib/events.ts';

const shippie = createShippieIframeSdk({ appId: 'app_receipt_snap' });
const observations = createObservationClient(shippie);

const MODEL_WARM_KEY = 'shippie.receipt-snap.model-warm.v1';
const HEADER_SUBTITLE_SEEN_KEY = 'receiptSnap:onboarding:headerSubtitle:v1';
const REVIEW_MODE_KEY = 'shippie.receipt-snap.review-mode.v1';

type Tab = 'capture' | 'history' | 'settings';
type Screen = { kind: 'tab' } | { kind: 'review'; rawText: string; imageDataUrl: string };
interface NavState {
  tab: Tab;
  screen: Screen;
}

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'capture', label: 'Capture' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

const RESTAURANT_CATEGORIES = new Set<string>(['restaurant', 'food']);

function sameScreen(a: Screen, b: Screen): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'review' && b.kind === 'review') {
    return a.rawText === b.rawText && a.imageDataUrl === b.imageDataUrl;
  }
  return true;
}

function sameNavState(a: NavState, b: NavState): boolean {
  return a.tab === b.tab && sameScreen(a.screen, b.screen);
}

export function App() {
  const [receipts, setReceipts] = useState<Receipt[]>(() => load().receipts);
  const [tab, setTab] = useState<Tab>('capture');
  const [screen, setScreen] = useState<Screen>({ kind: 'tab' });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<NavState>(
        { tab: 'capture', screen: { kind: 'tab' } },
        (next) => {
          setTab(next.tab);
          setScreen(next.screen);
        },
        { isEqual: sameNavState },
      ),
    [],
  );
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [modelWarm, setModelWarm] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MODEL_WARM_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showHeaderSubtitle, setShowHeaderSubtitle] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HEADER_SUBTITLE_SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  // Review mode — Quick (today's 5 fields) or Accounting (full set).
  // Defaults to Quick to protect the existing audience; users opt into
  // Accounting via the Settings page (Phase E).
  const [reviewMode, setReviewMode] = useState<'quick' | 'accounting'>(() => {
    try {
      return localStorage.getItem(REVIEW_MODE_KEY) === 'accounting' ? 'accounting' : 'quick';
    } catch {
      return 'quick';
    }
  });

  useEffect(() => {
    save({ receipts });
  }, [receipts]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigateTab(next: Tab): void {
    void localNavigation.navigate({ tab: next, screen: { kind: 'tab' } }, { kind: 'crossfade' });
  }

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
    if (showHeaderSubtitle) {
      setShowHeaderSubtitle(false);
      try { localStorage.setItem(HEADER_SUBTITLE_SEEN_KEY, '1'); } catch { /* ignore */ }
    }
    // OCR finishes from a worker/canvas-heavy path. Enter Review via
    // direct state so a view-transition quirk can never strand users on
    // the capture screen with a finished progress state.
    setTab('capture');
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
      // Accounting widening (2026-05-19). All optional on the row — only
      // included when the user filled them in or the parser pre-filled
      // them. The export layer (Phase D) reads through these.
      supplier: values.supplier,
      net_cents: values.net_cents,
      tax_cents: values.tax_cents,
      tax_rate_bp: values.tax_rate_bp,
      tax_scheme: values.tax_scheme,
      payment_method: values.payment_method,
      receipt_ref: values.receipt_ref,
      project: values.project,
      client: values.client,
      reimbursable: values.reimbursable,
      export_status: 'not_exported',
      discarded_photo_at: null,
    };
    setReceipts((prev) => insert({ receipts: prev }, receipt).receipts);
    broadcastSaved(receipt);
    shippie.feel.texture('confirm');
    setExtracted(null);
    void localNavigation.navigate(
      { tab: 'history', screen: { kind: 'tab' } },
      { kind: 'crossfade', history: 'replace' },
    );
  }

  function broadcastSaved(receipt: Receipt) {
    // Ledger consumes expense-logged. Payload is intentionally minimal —
    // amount + when + where + category — no photo, no raw OCR text.
    // Type-checked via ExpenseLoggedPayload so any future schema drift
    // is caught at the call site, not by a downstream consumer at runtime.
    const occurredOn = receipt.occurred_on ?? receipt.captured_at.slice(0, 10);
    const expensePayload: ExpenseLoggedPayload = {
      amount_cents: receipt.total_cents ?? 0,
      currency: receipt.currency,
      category: receipt.category,
      vendor: receipt.vendor,
      occurred_on: occurredOn,
    };
    shippie.intent.broadcast(EVENT_EXPENSE_LOGGED, [expensePayload]);
    if (RESTAURANT_CATEGORIES.has(receipt.category) && receipt.vendor) {
      // Restaurant Memory + Atlas listen for this. Optional — skipped
      // when category implies a non-meal purchase.
      const dinedPayload: DinedOutPayload = {
        venue: receipt.vendor,
        occurred_on: occurredOn,
        amount_cents: receipt.total_cents ?? 0,
        currency: receipt.currency,
      };
      shippie.intent.broadcast(EVENT_DINED_OUT, [dinedPayload]);
    }
    // Observation bus — vendor as a single-item label set so Randomiser
    // can surface "the bakery on Tuesday" without seeing the photo or
    // total. No geo: that needs an explicit per-app grant.
    if (receipt.vendor) {
      observations.emit({
        kind: 'place.snapped',
        labels: [receipt.vendor],
        at: receipt.captured_at,
      });
    }
  }

  function onCancel() {
    setExtracted(null);
    void localNavigation.backOrReplace(
      { tab: 'capture', screen: { kind: 'tab' } },
      { kind: 'crossfade' },
    );
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

  function onDiscardAllPhotos() {
    setReceipts((prev) => discardAllPhotos({ receipts: prev }).receipts);
    shippie.feel.texture('confirm');
  }

  function onLoadSampleData() {
    // Prepend so the seeds show first in history. Don't duplicate
    // existing samples if the user taps twice.
    setReceipts((prev) => {
      const withoutOld = withoutSamples(prev);
      return [...buildSampleReceipts(), ...withoutOld];
    });
    shippie.feel.texture('confirm');
  }

  function onClearSampleData() {
    setReceipts((prev) => withoutSamples(prev));
  }

  function onExported(ids: readonly string[]) {
    setReceipts((prev) => markExported({ receipts: prev }, ids).receipts);
  }

  // Make the linter aware we'll use CATEGORIES via the form components.
  void CATEGORIES;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Receipt Snap</h1>
        {showHeaderSubtitle ? (
          <p className="subtitle">snap · review · save</p>
        ) : null}
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
              onClick={() => navigateTab(t.id)}
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
          mode={reviewMode}
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
        <HistoryPage
          receipts={receipts}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onCapture={() => navigateTab('capture')}
        />
      ) : (
        <SettingsPage
          receipts={receipts}
          modelWarm={modelWarm}
          reviewMode={reviewMode}
          onChangeReviewMode={(next) => {
            setReviewMode(next);
            try {
              localStorage.setItem(REVIEW_MODE_KEY, next);
            } catch {
              /* ignore */
            }
          }}
          onClearAll={onClearAll}
          onDiscardAllPhotos={onDiscardAllPhotos}
          onLoadSampleData={onLoadSampleData}
          onClearSampleData={onClearSampleData}
          hasSampleData={hasSampleDataIn(receipts)}
          onExported={onExported}
        />
      )}

    </div>
  );
}
