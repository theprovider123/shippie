import { describe, expect, it } from 'vitest';
import { GET, _rev } from './+server';

describe('_rev()', () => {
  it('is stable regardless of input order and changes with content', () => {
    expect(_rev(['a', 'b'], [])).toBe(_rev(['b', 'a'], []));
    expect(_rev(['a'], [])).not.toBe(_rev(['a'], ['b']));
    expect(typeof _rev([], [])).toBe('string');
  });
});

describe('GET /api/arcade/roster', () => {
  it('503s with empty sets when DB is unavailable', async () => {
    const res = await GET({ platform: { env: {} } } as never);
    expect(res.status).toBe(503);
    const body = await res.json() as { enabled: string[]; blocked: string[]; rev: string };
    expect(body.enabled).toEqual([]);
    expect(body.blocked).toEqual([]);
    expect(body.rev).toBe('0');
  });
});
