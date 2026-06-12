/**
 * PNG share card — same card as og.svg, rasterized with resvg-wasm.
 *
 * WhatsApp and iMessage (and several other unfurlers) refuse SVG og:images,
 * so every share surface points at this endpoint instead. The wasm binary
 * and the Inter font live in static/__shippie/ (NOT bundled — the wasm
 * doesn't bundle cleanly under the SvelteKit Cloudflare adapter) and are
 * fetched at runtime: through the Workers Assets binding in production,
 * through event.fetch in dev.
 */
import type { RequestEvent, RequestHandler } from './$types';
import {
  buildAppCardSvg,
  loadAppShareMeta,
  OG_FONT_FAMILY,
  OG_WIDTH,
} from '$server/og/app-card';
import { rasterizeSvgToPng } from '$server/og/rasterize';
import { toResponseBody } from '$server/wrapper/bytes';

const WASM_PATH = '/__shippie/resvg.wasm';
const FONT_PATH = '/__shippie/og-font.ttf';

// Font bytes are stable for the lifetime of the isolate — fetch once.
let fontCache: Promise<Uint8Array> | null = null;

// Workers forbids compiling wasm from bytes at runtime, so production MUST
// use the statically-imported WebAssembly.Module (bundled by wrangler's
// CompiledWasm rule). The import fails under vite dev / vitest — there the
// fetch-the-bytes path below still works. Cache the probe per isolate.
let wasmModuleCache: Promise<WebAssembly.Module | null> | null = null;

function loadWasmModule(): Promise<WebAssembly.Module | null> {
  if (!wasmModuleCache) {
    wasmModuleCache = import('$server/og/resvg-module')
      .then((mod) => mod.default)
      .catch(() => null);
  }
  return wasmModuleCache;
}

async function fetchStaticAsset(event: RequestEvent, path: string): Promise<Response> {
  // Workers Assets matches by pathname; the host is irrelevant but must be
  // well-formed. Prefer the binding (no subrequest loop back into the
  // Worker), fall back to event.fetch for vite dev / node previews.
  const assets = event.platform?.env?.ASSETS;
  if (assets) {
    try {
      const res = await assets.fetch(new Request(new URL(path, event.url.origin)));
      if (res.ok) return res;
    } catch {
      // Fall through to event.fetch.
    }
  }
  const res = await event.fetch(path);
  if (!res.ok) throw new Error(`og asset unavailable: ${path} (${res.status})`);
  return res;
}

function loadFont(event: RequestEvent): Promise<Uint8Array> {
  if (!fontCache) {
    fontCache = fetchStaticAsset(event, FONT_PATH)
      .then(async (res) => new Uint8Array(await res.arrayBuffer()))
      .catch((error: unknown) => {
        fontCache = null;
        throw error;
      });
  }
  return fontCache;
}

export const GET: RequestHandler = async (event) => {
  const meta = await loadAppShareMeta(event);
  if (!meta) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const svg = buildAppCardSvg(meta, event.url.origin);

  try {
    const font = await loadFont(event);
    const wasmModule = await loadWasmModule();
    const png = await rasterizeSvgToPng(svg, {
      wasm: () => wasmModule ?? fetchStaticAsset(event, WASM_PATH),
      fonts: [font],
      defaultFontFamily: OG_FONT_FAMILY,
      width: OG_WIDTH,
      resolveImage: async (href) => {
        const res = await event.fetch(href);
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      },
    });
    return new Response(toResponseBody(png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    // Rasterization unavailable (e.g. wasm asset missing). Degrade to the
    // SVG card rather than failing the unfurl outright.
    console.error(
      '[og.png] rasterization failed',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
    return new Response(null, {
      status: 302,
      headers: {
        location: `/api/apps/${encodeURIComponent(meta.slug)}/og.svg`,
        'cache-control': 'public, max-age=300',
      },
    });
  }
};
