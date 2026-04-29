/**
 * Pulls human-readable text from a deployed app's PWA manifest, if present.
 *
 * SPA dist HTML often has an empty body (`<div id="root"></div>`), so the
 * `<title>` is the only text-bearing tag the html-scanner can collect. The
 * manifest's `name`/`short_name`/`description` carry stronger category
 * signal — feeding them into visibleText keeps zero-config classification
 * useful for SPAs.
 */

const decoder = new TextDecoder();

const CANDIDATE_PATHS = [
  'manifest.webmanifest',
  'manifest.json',
  'site.webmanifest',
];

export function scanManifest(files: ReadonlyMap<string, Uint8Array>): {
  text: string;
} {
  const parts: string[] = [];
  for (const candidate of CANDIDATE_PATHS) {
    const bytes = files.get(candidate);
    if (!bytes) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(bytes));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const m = parsed as Record<string, unknown>;
    for (const key of ['name', 'short_name', 'description'] as const) {
      const v = m[key];
      if (typeof v === 'string' && v.trim().length > 1) parts.push(v.trim());
    }
  }
  return { text: parts.join(' ') };
}
