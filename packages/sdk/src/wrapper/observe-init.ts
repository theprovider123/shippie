// packages/sdk/src/wrapper/observe-init.ts
/**
 * Bootstrap that hooks the DOM observer into the wrapper's runtime.
 *
 * The Worker injects `<script src="/__shippie/observe.js" async>` into
 * every Shippie-served page; that bundle calls `bootstrapObserve()` on
 * load. The maker's `shippie.json` (read out of `window.__shippie_meta`
 * which the Worker also injects) carries the `enhance:` config.
 *
 * SSR-safe: no-ops if document/window aren't available.
 */
import { startObserve } from './observe/index.ts';
import { installPatina } from './patina/index.ts';
import type { EnhanceConfig } from './observe/types.ts';

interface ShippieMeta {
  enhance?: EnhanceConfig | false;
}

let started = false;

export function bootstrapObserve(metaOverride?: ShippieMeta): void {
  if (started) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const meta =
    metaOverride ??
    (window as unknown as { __shippie_meta?: ShippieMeta }).__shippie_meta ??
    {};

  // Maker can disable enhancement entirely with `"enhance": false`.
  if (meta.enhance === false) return;

  const config = meta.enhance ?? defaultConfig();
  if (!config || Object.keys(config).length === 0) return;

  const run = () => {
    if (started) return;
    started = true;
    startObserve({ config });
    // Patina is cosmetic + cosmetic-only; failures are swallowed inside
    // installPatina, so fire-and-forget without awaiting.
    void installPatina();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

/**
 * The platform's default enhance config — what every Shippie app gets
 * out of the box without any shippie.json `enhance:` block. Keeps the
 * "automatic" promise alive even for makers who haven't read the docs.
 */
function defaultConfig(): EnhanceConfig {
  return {
    'video[autoplay], canvas[data-shippie-canvas]': ['wakelock'],
    '[data-shippie-share-target]': ['share-target'],
    // The textures rule is page-global — selector doesn't matter, the
    // rule attaches delegated listeners at the document level on first apply.
    body: ['textures'],
  };
}
