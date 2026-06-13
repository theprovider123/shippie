import { describe, expect, it } from 'vitest';
import { GET, rev } from './+server';

describe('rev()', () => {
  it('is stable regardless of input order and changes with content', () => {
    expect(rev(['a', 'b'], [])).toBe(rev(['b', 'a'], []));
    expect(rev(['a'], [])).not.toBe(rev(['a'], ['b']));
    expect(typeof rev([], [])).toBe('string');
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
