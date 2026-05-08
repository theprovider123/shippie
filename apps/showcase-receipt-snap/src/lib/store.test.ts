import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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
