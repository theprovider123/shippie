/**
 * Conservative asset reference recovery.
 *
 * AI-built apps often have one or two moved assets after a framework export:
 * `<img src="/images/hero.png">` while the file actually shipped at
 * `assets/images/hero.png`. This helper fixes only unambiguous basename
 * matches in HTML/CSS references. It never guesses when multiple candidates
 * share the same filename.
 */

export interface AssetFix {
  file: string;
  before: string;
  after: string;
  kind: 'broken_path';
}

export interface AssetRecoveryResult {
  files: Map<string, Uint8Array>;
  fixes: AssetFix[];
  totalBytes: number;
}

const decoder = new TextDecoder('utf-8', { fatal: false });
const encoder = new TextEncoder();

const HTML_REF_RE = /\b(src|href)\s*=\s*(["'])([^"']+)\2/gi;
const CSS_URL_RE = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
const TEXT_FILE_RE = /\.(?:html|css)$/i;
const ASSET_EXT_RE =
  /\.(?:avif|bmp|css|gif|ico|jpeg|jpg|js|mjs|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff|woff2)$/i;

export function recoverAssetReferences(input: ReadonlyMap<string, Uint8Array>): AssetRecoveryResult {
  const files = new Map(input);
  const index = buildBasenameIndex(files);
  const fixes: AssetFix[] = [];

  for (const [filePath, bytes] of input) {
    if (!TEXT_FILE_RE.test(filePath)) continue;
    const original = decoder.decode(bytes);
    const baseDir = directoryOf(filePath);

    let updated = original.replace(HTML_REF_RE, (match, attr: string, quote: string, ref: string) => {
      const fixed = fixRef(ref, baseDir, files, index);
      if (!fixed) return match;
      fixes.push({ file: filePath, before: ref, after: fixed, kind: 'broken_path' });
      return `${attr}=${quote}${fixed}${quote}`;
    });

    updated = updated.replace(CSS_URL_RE, (match, quote: string, ref: string) => {
      const fixed = fixRef(ref, baseDir, files, index);
      if (!fixed) return match;
      fixes.push({ file: filePath, before: ref, after: fixed, kind: 'broken_path' });
      return `url(${quote}${fixed}${quote})`;
    });

    if (updated !== original) files.set(filePath, encoder.encode(updated));
  }

  return { files, fixes, totalBytes: sumBytes(files) };
}

function fixRef(
  ref: string,
  baseDir: string,
  files: ReadonlyMap<string, Uint8Array>,
  index: Map<string, string | null>,
): string | null {
  if (!isFixableAssetRef(ref)) return null;

  const normalized = normalizeRef(ref, baseDir);
  if (!normalized || files.has(normalized)) return null;

  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const candidate = index.get(basename);
  if (!candidate) return null;

  return '/' + candidate;
}

function isFixableAssetRef(ref: string): boolean {
  if (!ref || ref.startsWith('#')) return false;
  if (/^(?:https?:)?\/\//i.test(ref)) return false;
  if (/^(?:data|blob|mailto|tel):/i.test(ref)) return false;
  if (ref.startsWith('/__shippie/')) return false;
  return ASSET_EXT_RE.test(ref.split('?')[0]?.split('#')[0] ?? '');
}

function normalizeRef(ref: string, baseDir: string): string | null {
  const clean = ref.split('?')[0]?.split('#')[0];
  if (!clean) return null;
  const raw = clean.startsWith('/') ? clean.slice(1) : baseDir + clean;
  const parts: string[] = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function directoryOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx + 1);
}

function buildBasenameIndex(files: ReadonlyMap<string, Uint8Array>): Map<string, string | null> {
  const index = new Map<string, string | null>();
  for (const path of files.keys()) {
    if (!ASSET_EXT_RE.test(path)) continue;
    const basename = path.slice(path.lastIndexOf('/') + 1);
    if (!basename) continue;
    index.set(basename, index.has(basename) ? null : path);
  }
  return index;
}

function sumBytes(files: ReadonlyMap<string, Uint8Array>): number {
  let total = 0;
  for (const bytes of files.values()) total += bytes.byteLength;
  return total;
}
