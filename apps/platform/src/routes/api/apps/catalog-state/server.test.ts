import { describe, expect, test, vi } from 'vitest';
import { GET } from './+server';

function eventFor(db?: unknown) {
  return {
    platform: db ? { env: { DB: db } } : undefined,
  } as unknown as Parameters<typeof GET>[0];
}

function dbReturning(row: unknown) {
  return {
    prepare: vi.fn(() => ({
      first: vi.fn(async () => row),
    })),
  };
}

describe('GET /api/apps/catalog-state', () => {
  test('uses static catalog state when no D1 binding is available', async () => {
    const response = await GET(eventFor());
    const body = (await response.json()) as { version: string; live_count: number; updated_at: string | null };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.version).toMatch(/^static:/);
    expect(body.live_count).toBeGreaterThan(0);
    expect(body.updated_at).toBeNull();
  });

  test('uses D1 app metadata when the app table is available', async () => {
    const db = dbReturning({
      count: 42,
      latest_app_update: '2026-06-01T10:00:00.000Z',
      latest_deploy: '2026-06-02T12:00:00.000Z',
    });

    const response = await GET(eventFor(db));
    const body = (await response.json()) as { version: string; live_count: number; updated_at: string | null };

    expect(response.status).toBe(200);
    expect(body.version).toContain(':42:2026-06-01T10:00:00.000Z:2026-06-02T12:00:00.000Z');
    expect(body.version).toMatch(/^db:/);
    expect(body.live_count).toBe(42);
    expect(body.updated_at).toBe('2026-06-02T12:00:00.000Z');
  });

  test('falls back to static catalog state when local D1 is missing the apps table', async () => {
    const db = {
      prepare: vi.fn(() => ({
        first: vi.fn(async () => {
          throw new Error('D1_ERROR: no such table: apps');
        }),
      })),
    };

    const response = await GET(eventFor(db));
    const body = (await response.json()) as { version: string; live_count: number; updated_at: string | null };

    expect(response.status).toBe(200);
    expect(body.version).toMatch(/^static:/);
    expect(body.live_count).toBeGreaterThan(0);
    expect(body.updated_at).toBeNull();
  });
});
