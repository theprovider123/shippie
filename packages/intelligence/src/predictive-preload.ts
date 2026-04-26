/**
 * Predictive preload — looks at the user's frequent navigation sequences and,
 * when the current path is likely to lead somewhere with high confidence,
 * prepends a `<link rel="prefetch">` to the document head so the next page is
 * already in the browser cache by the time the user clicks.
 *
 * `predictNextPage` is a pure-ish lookup over the `frequentPaths` slice of a
 * `PatternsRollup`: it tallies, across every frequent sequence containing
 * `currentPath` (where `currentPath` is not the last entry), how often each
 * candidate "next" path follows it. Confidence is the candidate's share of all
 * candidate occurrences; ties resolve to the first encountered.
 *
 * `enablePredictivePreload` runs the prediction once on attach and again on
 * every `shippie:pageview` event the wrapper dispatches.
 */
import { patterns as defaultPatterns } from './pattern-tracker.ts';
import type { PatternsRollup } from './types.ts';

export interface NextPagePrediction {
  url: string;
  confidence: number;
}

interface PredictNextPageOptions {
  patternsFn?: () => Promise<PatternsRollup>;
}

interface EnablePredictivePreloadOptions {
  confidenceThreshold?: number;
  window?: Window;
  document?: Document;
  patternsFn?: () => Promise<PatternsRollup>;
}

const DEFAULT_THRESHOLD = 0.7;

export async function predictNextPage(
  currentPath: string,
  opts?: PredictNextPageOptions,
): Promise<NextPagePrediction | null> {
  const patternsFn = opts?.patternsFn ?? defaultPatterns;
  const rollup = await patternsFn();
  // Map preserves insertion order, so ties resolve to the first encountered
  // candidate — a stable, intuitive tiebreak.
  const candidates = new Map<string, number>();
  for (const seq of rollup.frequentPaths) {
    const idx = seq.indexOf(currentPath);
    if (idx === -1 || idx === seq.length - 1) continue;
    const next = seq[idx + 1];
    if (next === undefined) continue;
    candidates.set(next, (candidates.get(next) ?? 0) + 1);
  }
  if (candidates.size === 0) return null;
  let bestUrl: string | null = null;
  let bestCount = -Infinity;
  let total = 0;
  for (const [url, count] of candidates) {
    total += count;
    if (count > bestCount) {
      bestCount = count;
      bestUrl = url;
    }
  }
  if (bestUrl === null || total === 0) return null;
  return { url: bestUrl, confidence: bestCount / total };
}

/**
 * Insert `<link rel="prefetch" href="...">` at the top of `document.head` for
 * the supplied URL. Skips if a prefetch link for that URL already exists.
 *
 * Exported as a test seam so callers can verify the DOM mutation without
 * spinning up a full `enablePredictivePreload` lifecycle.
 */
export function _preloadUrlForTest(url: string, doc: Document): void {
  preloadUrl(url, doc);
}

function preloadUrl(url: string, doc: Document): void {
  const existing = doc.head.querySelector(
    `link[rel="prefetch"][href="${cssEscape(url)}"]`,
  );
  if (existing) return;
  const link = doc.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  doc.head.insertBefore(link, doc.head.firstChild);
}

function cssEscape(value: string): string {
  // Minimal escape for selectors — sufficient for app paths/URLs used here.
  return value.replace(/(["\\])/g, '\\$1');
}

export function enablePredictivePreload(
  opts?: EnablePredictivePreloadOptions,
): () => void {
  const win = opts?.window ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = opts?.document
    ?? (typeof document !== 'undefined' ? document : undefined);
  if (!win || !doc) {
    // SSR / non-browser: no-op stop.
    return () => {};
  }
  const threshold = opts?.confidenceThreshold ?? DEFAULT_THRESHOLD;
  const patternsFn = opts?.patternsFn;

  const run = (): void => {
    void (async () => {
      try {
        const next = await predictNextPage(
          win.location.pathname,
          patternsFn ? { patternsFn } : undefined,
        );
        if (!next || next.confidence < threshold) return;
        preloadUrl(next.url, doc);
      } catch {
        // Best-effort: a prediction failure shouldn't escape into the host app.
      }
    })();
  };

  const handler = (): void => run();

  // Run on attach so the very first page benefits when a confident prediction
  // already exists from prior sessions.
  run();
  win.addEventListener('shippie:pageview', handler);

  return function stop(): void {
    win.removeEventListener('shippie:pageview', handler);
  };
}
