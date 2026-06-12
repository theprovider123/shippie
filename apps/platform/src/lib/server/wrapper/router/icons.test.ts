import { describe, expect, test } from 'vitest';
import { handleIcon } from './icons';
import type { WrapperContext } from '../env';

/**
 * Stub R2 bucket: empty (no per-app icon, no uploaded default), so the
 * handler must fall through to the bundled real default icons.
 */
function makeCtx(slug: string): WrapperContext {
  return {
    request: new Request(`https://${slug}.shippie.app/__shippie/icons/192.png`),
    env: {
      PLATFORM_ASSETS: {
        get: async () => null,
      } as unknown as WrapperContext['env']['PLATFORM_ASSETS'],
    } as unknown as WrapperContext['env'],
    slug,
    traceId: 'test-trace',
  };
}

/** Read PNG pixel dimensions from the IHDR chunk (bytes 16-23). */
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('handleIcon — bundled default fallback', () => {
  test('serves a real 192px PNG when no icon exists anywhere', async () => {
    const res = await handleIcon(makeCtx('no-icons'), '192.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Real icon, not the old 1x1 placeholder (which was 68 bytes).
    expect(bytes.length).toBeGreaterThan(1000);
    expect([...bytes.slice(0, 8)]).toEqual(PNG_MAGIC);
    expect(pngDimensions(bytes)).toEqual({ width: 192, height: 192 });
  });

  test('serves the 512px default for 512 requests', async () => {
    const res = await handleIcon(makeCtx('no-icons'), '512');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual(PNG_MAGIC);
    expect(pngDimensions(bytes)).toEqual({ width: 512, height: 512 });
  });

  test('rejects non-numeric sizes', async () => {
    const res = await handleIcon(makeCtx('no-icons'), '../etc');
    expect(res.status).toBe(400);
  });
});
