import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  CATEGORIES,
  clearAll,
  discardAllPhotos,
  discardPhoto,
  effectiveSupplier,
  insert,
  load,
  markExported,
  newId,
  normalise,
  remove,
  save,
  update,
  type Receipt,
} from './store.ts';

function memStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, v);
    },
  };
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = memStorage();
});
afterEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = memStorage();
});

function fixture(over: Partial<Receipt> = {}): Receipt {
  return {
    id: over.id ?? newId(),
    vendor: over.vendor ?? 'Test Vendor',
    total_cents: over.total_cents ?? 1234,
    currency: over.currency ?? 'USD',
    category: over.category ?? 'food',
    occurred_on: over.occurred_on ?? '2026-05-01',
    captured_at: over.captured_at ?? new Date().toISOString(),
    raw_ocr_text: over.raw_ocr_text ?? '',
    image_data_url: over.image_data_url ?? null,
    note: over.note ?? '',
    // Spread any extra fields (accounting widening — supplier, tax_*,
    // payment_method, etc.) so tests can construct rich rows without
    // updating this fixture every time the schema grows.
    ...over,
  };
}

describe('store · constants', () => {
  test('CATEGORIES are non-empty and unique', () => {
    expect(CATEGORIES.length).toBeGreaterThan(0);
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });
});

describe('store · ids', () => {
  test('newId is unique and starts with prefix', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a.startsWith('rcpt_')).toBe(true);
  });
});

describe('store · load + save', () => {
  test('load on a fresh device returns empty', () => {
    const state = load();
    expect(state.receipts).toEqual([]);
  });

  test('save round-trips a receipt', () => {
    const r = fixture({ vendor: 'Café Loaf', total_cents: 450 });
    save({ receipts: [r] });
    const back = load();
    expect(back.receipts).toHaveLength(1);
    expect(back.receipts[0]?.vendor).toBe('Café Loaf');
    expect(back.receipts[0]?.total_cents).toBe(450);
  });

  test('load tolerates malformed JSON', () => {
    globalThis.localStorage.setItem('shippie.receipt-snap.v1', '{not-json');
    const state = load();
    expect(state.receipts).toEqual([]);
  });
});

describe('store · insert / update / remove', () => {
  test('insert puts new receipt at the head', () => {
    const a = fixture({ id: 'a', vendor: 'A' });
    const b = fixture({ id: 'b', vendor: 'B' });
    let state = { receipts: [a] };
    state = insert(state, b);
    expect(state.receipts[0]?.id).toBe('b');
    expect(state.receipts).toHaveLength(2);
  });

  test('remove drops by id', () => {
    const a = fixture({ id: 'a' });
    const b = fixture({ id: 'b' });
    let state = { receipts: [a, b] };
    state = remove(state, 'a');
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0]?.id).toBe('b');
  });

  test('update patches a single receipt', () => {
    const a = fixture({ id: 'a', vendor: 'old' });
    let state = { receipts: [a] };
    state = update(state, 'a', { vendor: 'new', category: 'coffee' });
    expect(state.receipts[0]?.vendor).toBe('new');
    expect(state.receipts[0]?.category).toBe('coffee');
  });

  test('update on missing id is a no-op', () => {
    const a = fixture({ id: 'a' });
    const state = update({ receipts: [a] }, 'nope', { vendor: 'x' });
    expect(state.receipts[0]?.vendor).toBe(a.vendor);
  });
});

describe('store · clearAll', () => {
  test('clears persisted state', () => {
    save({ receipts: [fixture()] });
    clearAll();
    expect(load().receipts).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────
// Accounting widening — 2026-05-19
// ──────────────────────────────────────────────────────────────────

describe('store · normalise (back-compat for legacy rows)', () => {
  test('fills accounting defaults on legacy row', () => {
    // Legacy row only has the core fields.
    const legacy = fixture({ id: 'legacy' });
    const out = normalise(legacy);
    expect(out.supplier).toBeNull();
    expect(out.net_cents).toBeNull();
    expect(out.tax_cents).toBeNull();
    expect(out.tax_rate_bp).toBeNull();
    expect(out.tax_scheme).toBe('unknown');
    expect(out.payment_method).toBeNull();
    expect(out.receipt_ref).toBeNull();
    expect(out.project).toBeNull();
    expect(out.client).toBeNull();
    expect(out.export_status).toBe('not_exported');
    expect(out.discarded_photo_at).toBeNull();
    // Reimbursable is intentionally NOT defaulted (would silently flip
    // legacy rows to a business decision the user didn't make).
    expect(out.reimbursable).toBeUndefined();
  });

  test('is idempotent', () => {
    const once = normalise(fixture());
    const twice = normalise(once);
    expect(twice).toEqual(once);
  });

  test('preserves caller-set accounting fields', () => {
    const row = normalise({
      ...fixture(),
      tax_cents: 200,
      tax_scheme: 'vat',
      reimbursable: true,
    });
    expect(row.tax_cents).toBe(200);
    expect(row.tax_scheme).toBe('vat');
    expect(row.reimbursable).toBe(true);
  });

  test('load() normalises rows read from storage', () => {
    // Persist a legacy-shaped row directly.
    save({ receipts: [fixture({ id: 'legacy' })] });
    const out = load();
    expect(out.receipts[0]?.tax_scheme).toBe('unknown');
    expect(out.receipts[0]?.export_status).toBe('not_exported');
  });
});

describe('store · effectiveSupplier', () => {
  test('falls back to vendor when supplier is unset', () => {
    expect(effectiveSupplier(fixture({ vendor: 'Hagen', supplier: null }))).toBe('Hagen');
  });

  test('falls back to vendor when supplier is empty whitespace', () => {
    expect(effectiveSupplier(fixture({ vendor: 'Hagen', supplier: '   ' }))).toBe('Hagen');
  });

  test('returns supplier override when set', () => {
    expect(effectiveSupplier(fixture({ vendor: 'Hagen', supplier: 'Hagen Coffee Ltd' }))).toBe(
      'Hagen Coffee Ltd',
    );
  });
});

describe('store · update (resets export_status on edit)', () => {
  test('editing fields on an exported row resets export_status', () => {
    // Don't narrow with `as const` — `update()` returns rows typed
    // ExportStatus | undefined, and assigning back to a narrowed type
    // breaks the reassignment.
    const row: Receipt = { ...fixture({ id: 'a' }), export_status: 'exported' };
    let state = { receipts: [row] };
    state = update(state, 'a', { vendor: 'Updated' });
    expect(state.receipts[0]?.export_status).toBe('not_exported');
  });

  test('explicit export_status patch wins (used by mark-as-exported)', () => {
    const row = fixture({ id: 'a' });
    let state = { receipts: [row] };
    state = update(state, 'a', { export_status: 'exported' });
    expect(state.receipts[0]?.export_status).toBe('exported');
  });

  test('editing an already-not-exported row leaves status unchanged', () => {
    const row = fixture({ id: 'a' });
    let state = { receipts: [row] };
    state = update(state, 'a', { vendor: 'Updated' });
    // Not-exported stays not-exported; nothing to reset.
    expect(state.receipts[0]?.export_status).toBeUndefined();
  });
});

describe('store · discardPhoto / discardAllPhotos', () => {
  test('discardPhoto nulls image_data_url and stamps discarded_photo_at', () => {
    const row = fixture({ id: 'a', image_data_url: 'data:image/jpeg;base64,Zm9v' });
    let state = { receipts: [row] };
    state = discardPhoto(state, 'a');
    expect(state.receipts[0]?.image_data_url).toBeNull();
    expect(typeof state.receipts[0]?.discarded_photo_at).toBe('string');
  });

  test('discardPhoto does not touch unrelated fields', () => {
    const row = fixture({ id: 'a', vendor: 'Hagen', total_cents: 500 });
    let state = { receipts: [row] };
    state = discardPhoto(state, 'a');
    expect(state.receipts[0]?.vendor).toBe('Hagen');
    expect(state.receipts[0]?.total_cents).toBe(500);
  });

  test('discardAllPhotos skips rows that already have no photo (no churn)', () => {
    const withPhoto = fixture({ id: 'a', image_data_url: 'data:image/jpeg;base64,Zm9v' });
    const without = fixture({ id: 'b', image_data_url: null });
    let state = { receipts: [withPhoto, without] };
    state = discardAllPhotos(state);
    expect(state.receipts[0]?.image_data_url).toBeNull();
    expect(state.receipts[0]?.discarded_photo_at).toBeTruthy();
    // Untouched row stays untouched (no new discarded_photo_at).
    expect(state.receipts[1]?.discarded_photo_at).toBeUndefined();
  });
});

describe('store · markExported', () => {
  test('flips matching rows to exported', () => {
    let state = { receipts: [fixture({ id: 'a' }), fixture({ id: 'b' }), fixture({ id: 'c' })] };
    state = markExported(state, ['a', 'c']);
    expect(state.receipts[0]?.export_status).toBe('exported');
    expect(state.receipts[1]?.export_status).toBeUndefined();
    expect(state.receipts[2]?.export_status).toBe('exported');
  });

  test('empty ids is a no-op', () => {
    const initial = { receipts: [fixture({ id: 'a' })] };
    const out = markExported(initial, []);
    expect(out.receipts[0]?.export_status).toBeUndefined();
  });
});
