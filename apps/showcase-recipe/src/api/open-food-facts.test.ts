import { describe, expect, it } from 'bun:test';
import {
  firstBrand,
  lookupBarcode,
  parseProduct,
  parseQuantity,
  type FetchLike,
} from './open-food-facts.ts';

describe('parseQuantity', () => {
  it('splits amount and unit', () => {
    expect(parseQuantity('500 g')).toEqual({ amount: '500', unit: 'g' });
    expect(parseQuantity('1.5L')).toEqual({ amount: '1.5', unit: 'l' });
    expect(parseQuantity('330ml')).toEqual({ amount: '330', unit: 'ml' });
  });

  it('handles european decimal commas', () => {
    expect(parseQuantity('1,5 kg')).toEqual({ amount: '1.5', unit: 'kg' });
  });

  it('returns null when input is missing', () => {
    expect(parseQuantity()).toEqual({ amount: null, unit: null });
    expect(parseQuantity('')).toEqual({ amount: null, unit: null });
  });

  it('passes weird strings through as amount-only', () => {
    expect(parseQuantity('about a handful')).toEqual({ amount: 'about a handful', unit: null });
  });
});

describe('firstBrand', () => {
  it('returns first comma-separated brand trimmed', () => {
    expect(firstBrand('Heinz, Kraft, Sysco')).toBe('Heinz');
    expect(firstBrand('  Mutti  ')).toBe('Mutti');
  });

  it('returns null on empty', () => {
    expect(firstBrand()).toBeNull();
    expect(firstBrand('')).toBeNull();
  });
});

describe('parseProduct', () => {
  it('builds a clean lookup from raw OFF data', () => {
    const result = parseProduct('123', {
      product_name: 'San Marzano tomatoes',
      brands: 'Mutti, Italian',
      quantity: '400 g',
      image_front_thumb_url: 'https://images/x.jpg',
    });
    expect(result).toEqual({
      barcode: '123',
      name: 'San Marzano tomatoes',
      brand: 'Mutti',
      amount: '400',
      unit: 'g',
      imageUrl: 'https://images/x.jpg',
    });
  });

  it('falls back to generic_name when product_name missing', () => {
    const result = parseProduct('5', { generic_name: 'Salt' });
    expect(result.name).toBe('Salt');
    expect(result.brand).toBeNull();
  });
});

describe('lookupBarcode', () => {
  it('rejects non-numeric or too-short barcodes', async () => {
    const fetchSpy: FetchLike = async () => {
      throw new Error('should not be called');
    };
    expect(await lookupBarcode('abc', fetchSpy)).toBeNull();
    expect(await lookupBarcode('123', fetchSpy)).toBeNull();
  });

  it('returns null when OFF status is 0', async () => {
    const fetchFn: FetchLike = async () =>
      new Response(JSON.stringify({ status: 0 }), { status: 200 });
    expect(await lookupBarcode('123456789012', fetchFn)).toBeNull();
  });

  it('returns parsed product on hit', async () => {
    const fetchFn: FetchLike = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: 'Olives',
            brands: 'Crespo',
            quantity: '120 g',
          },
        }),
        { status: 200 },
      );
    const result = await lookupBarcode('123456789012', fetchFn);
    expect(result?.name).toBe('Olives');
    expect(result?.brand).toBe('Crespo');
    expect(result?.amount).toBe('120');
  });

  it('returns null on network failure', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('offline');
    };
    expect(await lookupBarcode('123456789012', fetchFn)).toBeNull();
  });
});
