/**
 * Deploy output normalization — Phase 2 Deploy Truth.
 *
 * AI-built apps often upload the whole project or a framework export folder
 * (`dist`, `build`, `out`, `.output/public`) instead of the static files at
 * bucket root. The runtime serves `/` from `index.html` at the deploy root,
 * so a nested `dist/index.html` can pass loose preflight and still fail live.
 *
 * This pure helper selects the best static output root and returns files
 * relative to that root. Source files outside the selected output directory
 * are intentionally dropped from the published bundle.
 */

export interface OutputNormalizationResult {
  files: Map<string, Uint8Array>;
  totalBytes: number;
  changed: boolean;
  root: string;
  indexPath: string | null;
  framework: string;
  notes: string[];
}

const OUTPUT_ROOTS = [
  { root: '', framework: 'static-root' },
  { root: 'dist', framework: 'vite-static' },
  { root: 'build', framework: 'static-build' },
  { root: 'out', framework: 'next-static' },
  { root: '.output/public', framework: 'nitro-static' },
  { root: '_site', framework: 'static-site' },
  { root: 'public', framework: 'static-public' },
] as const;

export function normalizeDeployOutput(
  input: ReadonlyMap<string, Uint8Array>,
): OutputNormalizationResult {
  const selected = selectOutputRoot(input);
  if (!selected) {
    return {
      files: new Map(input),
      totalBytes: sumBytes(input),
      changed: false,
      root: '',
      indexPath: null,
      framework: 'unknown',
      notes: ['No index.html found in a known output root.'],
    };
  }

  const framework = refineFramework(input, selected.root, selected.framework);

  if (selected.root === '') {
    return {
      files: new Map(input),
      totalBytes: sumBytes(input),
      changed: false,
      root: '',
      indexPath: 'index.html',
      framework,
      notes: [],
    };
  }

  const prefix = selected.root + '/';
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of input) {
    if (!path.startsWith(prefix)) continue;
    const next = path.slice(prefix.length);
    if (!next) continue;
    files.set(next, bytes);
  }

  return {
    files,
    totalBytes: sumBytes(files),
    changed: true,
    root: selected.root,
    indexPath: `${selected.root}/index.html`,
    framework,
    notes: [`Published ${selected.root}/ as the app root.`],
  };
}

function selectOutputRoot(files: ReadonlyMap<string, Uint8Array>) {
  for (const candidate of OUTPUT_ROOTS) {
    const indexPath = candidate.root ? `${candidate.root}/index.html` : 'index.html';
    if (files.has(indexPath)) return candidate;
  }
  return null;
}

function refineFramework(
  files: ReadonlyMap<string, Uint8Array>,
  root: string,
  fallback: string,
): string {
  const prefix = root ? root + '/' : '';
  const has = (path: string) => files.has(prefix + path);
  const hasPrefix = (pathPrefix: string) =>
    [...files.keys()].some((path) => path.startsWith(prefix + pathPrefix));

  if (hasPrefix('_next/')) return 'next-static';
  if (hasPrefix('_app/')) return 'sveltekit-static';
  if (has('manifest.webmanifest') || has('manifest.json')) return fallback;
  if (hasPrefix('assets/')) return fallback === 'static-build' ? 'vite-static' : fallback;
  return fallback;
}

function sumBytes(files: ReadonlyMap<string, Uint8Array>): number {
  let total = 0;
  for (const bytes of files.values()) total += bytes.byteLength;
  return total;
}
