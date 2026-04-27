import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { classifyKind, localize, type LocalizeTransform } from '@shippie/analyse';

/**
 * Read a directory into the (path → bytes) map @shippie/analyse expects.
 * Same scanning rules the MCP used inline before — extracted into core
 * so the CLI consumes the same bounds.
 *
 * Caps + skip-dirs prevent the walker from chewing through node_modules
 * or huge build artifacts.
 */
const SCANNED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.svelte', '.html', '.css', '.vue',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.svelte-kit', '.turbo', 'build', '.git']);
const MAX_FILES = 500;
const MAX_BYTES_PER_FILE = 1_000_000;

export function loadAppFiles(directory: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  if (!existsSync(directory)) return files;

  const walk = (dir: string): void => {
    if (files.size >= MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        const dot = entry.lastIndexOf('.');
        const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : '';
        if (!SCANNED_EXTENSIONS.has(ext)) continue;
        if (st.size > MAX_BYTES_PER_FILE) continue;
        try {
          const data = readFileSync(full);
          files.set(relative(directory, full), new Uint8Array(data));
        } catch {
          // unreadable — skip
        }
      }
      if (files.size >= MAX_FILES) return;
    }
  };
  walk(directory);
  return files;
}

export type ClassifyResult = ReturnType<typeof classifyKind>;

/**
 * Classify a directory into local | connected | cloud. Pure file-system
 * read — no platform API call, runs offline.
 */
export function classifyDirectory(directory: string): ClassifyResult | { error: string } {
  if (!existsSync(directory)) {
    return { error: `directory not found: ${directory}` };
  }
  const files = loadAppFiles(directory);
  if (files.size === 0) {
    return { error: 'no scannable files in directory' };
  }
  return classifyKind(files);
}

export interface LocalizePlanInput {
  directory: string;
  /** Filter the transforms to apply. Empty = all available. */
  transforms?: LocalizeTransform[];
}

export type LocalizePlanResult = ReturnType<typeof localize>;

const ALL_TRANSFORMS: LocalizeTransform[] = [
  'supabase-basic-queries',
  'supabase-storage-to-local-files',
  'authjs-to-local-identity',
];

/**
 * Compute the localize patch for a directory. Pure read — does not
 * write anything to disk. Caller decides whether to apply.
 */
export function localizePlanForDirectory(
  input: LocalizePlanInput,
): LocalizePlanResult | { error: string } {
  if (!existsSync(input.directory)) {
    return { error: `directory not found: ${input.directory}` };
  }
  const files = loadAppFiles(input.directory);
  if (files.size === 0) {
    return { error: 'no scannable files in directory' };
  }
  return localize({
    files,
    transforms: input.transforms ?? ALL_TRANSFORMS,
  });
}
