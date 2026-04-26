/**
 * Zip extraction with zip-slip protection.
 *
 * Uses `fflate` — pure-JS, Worker-compatible (no node:fs / node:zlib).
 * apps/web's `adm-zip` doesn't deploy to CF (depends on node:zlib via
 * require()) so the SvelteKit Worker port switches to fflate.
 *
 * Sanitization (`sanitizeZipEntryPath` + `posixNormalize`) is ported
 * verbatim from apps/web/lib/deploy/index.ts:
 *   - reject backslashes (Windows separators)
 *   - reject absolute paths
 *   - reject `..` traversal that escapes the bucket-relative root
 *   - normalize `./` and collapse `..` segments
 */
import { unzipSync } from 'fflate';

export interface ExtractedFiles {
  files: Map<string, Uint8Array>;
  totalBytes: number;
}

export interface ExtractError {
  ok: false;
  reason: string;
}

export type ExtractResult = ({ ok: true } & ExtractedFiles) | ExtractError;

export function extractZipSafe(zipBuffer: Uint8Array): ExtractResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBuffer);
  } catch (err) {
    return { ok: false, reason: `zip_parse_failed: ${(err as Error).message}` };
  }

  const entryNames = Object.keys(entries);
  if (entryNames.length === 0) {
    return { ok: false, reason: 'Zip archive contains no files.' };
  }

  const files = new Map<string, Uint8Array>();
  let totalBytes = 0;

  for (const name of entryNames) {
    // fflate emits directory entries as zero-byte names ending in /.
    if (name.endsWith('/') && entries[name]!.byteLength === 0) continue;

    const safe = sanitizeZipEntryPath(name);
    if (!safe.ok) {
      return { ok: false, reason: `Unsafe path in zip: ${name}` };
    }
    const u8 = entries[name]!;
    files.set(safe.path, u8);
    totalBytes += u8.byteLength;
  }

  if (files.size === 0) {
    return { ok: false, reason: 'Zip archive contains no files.' };
  }

  return { ok: true, files, totalBytes };
}

/**
 * Validate a zip entry's path. Returns the normalized safe path, or
 * `{ ok: false }` on traversal/absolute/pathological inputs.
 */
export function sanitizeZipEntryPath(raw: string): { ok: true; path: string } | { ok: false } {
  if (!raw) return { ok: false };
  if (raw.includes('\\')) return { ok: false };
  const stripped = raw.replace(/^\/+/, '');
  if (!stripped) return { ok: false };
  const normalized = posixNormalize(stripped);
  if (!normalized) return { ok: false };
  if (normalized.startsWith('/')) return { ok: false };
  if (normalized === '..' || normalized.startsWith('../')) return { ok: false };
  if (normalized.includes('/../')) return { ok: false };
  return { ok: true, path: normalized };
}

function posixNormalize(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0 || out[out.length - 1] === '..') {
        out.push('..');
      } else {
        out.pop();
      }
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}
