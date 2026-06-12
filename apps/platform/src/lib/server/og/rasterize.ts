/**
 * SVG → PNG rasterization via @resvg/resvg-wasm.
 *
 * The wasm binary is deliberately NOT bundled — satori/resvg wasm doesn't
 * bundle cleanly under the SvelteKit Cloudflare adapter (see the note in
 * /api/golazo/og). Instead the .wasm lives in static/__shippie/resvg.wasm
 * and callers inject it at runtime:
 *   - the Worker fetches it from its own static assets (Workers Assets)
 *   - vitest reads it from disk with fs
 *
 * Same deal for fonts: resvg cannot draw <text> without a font buffer, so
 * static/__shippie/og-font.ttf (Inter SemiBold) is injected the same way.
 */
import { initWasm, Resvg, type InitInput } from '@resvg/resvg-wasm';

let wasmInit: Promise<void> | null = null;

/**
 * One-time wasm initialization. The loader is only invoked on the first
 * call; subsequent calls share the cached promise. A failed init clears the
 * cache so a transient asset-fetch error doesn't poison the isolate.
 */
export function ensureResvgWasm(load: () => Promise<InitInput> | InitInput): Promise<void> {
  if (!wasmInit) {
    wasmInit = Promise.resolve()
      .then(load)
      .then((input) => initWasm(input))
      .catch((error: unknown) => {
        // resvg-wasm throws if initWasm runs twice (e.g. another module
        // instance already initialized it in this isolate). That's success.
        if (error instanceof Error && /already initialized/i.test(error.message)) return;
        wasmInit = null;
        throw error;
      });
  }
  return wasmInit;
}

export interface RasterizeInputs {
  /** resvg wasm binary — Response (Worker) or bytes (tests). */
  wasm: () => Promise<InitInput> | InitInput;
  /** Raw TTF/OTF buffers for <text> rendering. */
  fonts: Uint8Array[];
  /** Family name resvg falls back to; must match the SVG's font-family. */
  defaultFontFamily?: string;
  width?: number;
  /**
   * resvg never fetches external <image href> targets itself (app icons).
   * When provided, each unresolved href is fetched through this callback and
   * fed back via resolveImage. Failures skip the image, never the card.
   */
  resolveImage?: (href: string) => Promise<Uint8Array | null>;
}

export async function rasterizeSvgToPng(svg: string, inputs: RasterizeInputs): Promise<Uint8Array> {
  await ensureResvgWasm(inputs.wasm);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: inputs.width ?? 1200 },
    font: {
      fontBuffers: inputs.fonts,
      defaultFontFamily: inputs.defaultFontFamily ?? 'Inter',
    },
  });
  try {
    if (inputs.resolveImage) {
      for (const href of resvg.imagesToResolve()) {
        try {
          const bytes = await inputs.resolveImage(String(href));
          if (bytes) resvg.resolveImage(String(href), bytes);
        } catch {
          // Icon fetch/decode failed — render the card without it.
        }
      }
    }
    const rendered = resvg.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    resvg.free();
  }
}
