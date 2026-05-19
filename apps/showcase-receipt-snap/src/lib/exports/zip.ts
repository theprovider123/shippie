/**
 * ZIP export — bundles one or more of the export presets together with
 * the matching receipt images. The user (or their accountant) gets a
 * single downloadable file containing everything they need to import
 * the receipts elsewhere.
 *
 * Uses fflate's `zipSync` for browser-native synchronous zipping. fflate
 * is ~30 KB minified, no native deps. The image data URLs we already
 * store are base64; we decode them back to bytes for the zip rather than
 * round-tripping through fetch().
 */
import { strToU8, zipSync } from 'fflate';
import type { Receipt } from '../store.ts';
import { attachmentFilename, sortNewestFirst } from './shared.ts';

import { receiptsToCsv as receiptsToSimpleCsv } from '../csv.ts';
import { receiptsToAccountantCsv } from './csv-accountant.ts';
import { receiptsToFreeAgentJson } from './freeagent-expenses-api.ts';
import { receiptsToBankCsv } from './freeagent-bank.ts';

export interface ZipExportOptions {
  /** Which preset CSVs / JSON to include in the bundle. Each defaults
   *  to true so a "ZIP everything" call works without ceremony. */
  includeSimpleCsv?: boolean;
  includeAccountantCsv?: boolean;
  includeFreeAgentExpenses?: boolean;
  includeFreeAgentBank?: boolean;
  /** Include receipt images bundled alongside the CSV/JSON. Defaults
   *  to true. Receipts with `image_data_url: null` (photo discarded)
   *  are noted in `manifest.json` rather than skipped silently. */
  includeImages?: boolean;
  /** Override the generated timestamp (defaults to now ISO). Mostly for
   *  tests so the manifest is deterministic. */
  generatedAt?: string;
}

interface ZipManifest {
  $shape: 'shippie/receipt-snap/zip-export-v1';
  generated_at: string;
  generated_by: string;
  count: number;
  /** Receipts whose photo was discarded before export. The accountant
   *  can see the entry exists without a matching image. */
  discarded_photo_count: number;
  /** Currency mix — useful when exporting multi-currency stores. */
  currencies: string[];
  /** Earliest + latest dates covered (YYYY-MM-DD, may be `null` if the
   *  receipts have no occurred_on values). */
  date_range: { from: string | null; to: string | null };
  /** Which preset files are included. */
  files: string[];
}

/** Decode a data URL like "data:image/jpeg;base64,…" into raw bytes.
 *  Returns null for unrecognised inputs (e.g. an SVG data URL or a
 *  malformed string) — callers should fall back gracefully. */
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; ext: string } | null {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/i);
  if (!match) return null;
  const ext = (match[1] ?? 'jpg').toLowerCase() === 'jpeg' ? 'jpg' : (match[1] ?? 'jpg').toLowerCase();
  const b64 = match[2] ?? '';
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext };
  } catch {
    return null;
  }
}

function summariseCurrencies(receipts: ReadonlyArray<Receipt>): string[] {
  const set = new Set<string>();
  for (const r of receipts) {
    if (r.currency) set.add(r.currency);
  }
  return [...set].sort();
}

function summariseDateRange(receipts: ReadonlyArray<Receipt>): {
  from: string | null;
  to: string | null;
} {
  let from: string | null = null;
  let to: string | null = null;
  for (const r of receipts) {
    const d = r.occurred_on ?? r.captured_at.slice(0, 10);
    if (!d) continue;
    if (from == null || d < from) from = d;
    if (to == null || d > to) to = d;
  }
  return { from, to };
}

const README = `# Receipt Snap export

This ZIP was produced by Shippie's Receipt Snap. Everything inside is
local data from your phone. None of it was sent to a Shippie server.

Contents (presence depends on the export options chosen):

  simple.csv               — minimal CSV: date,vendor,total,currency,category,note
  accountant.csv           — wide CSV with net/tax/payment/project/client/etc.
  freeagent-expenses.json  — FreeAgent Expenses API JSON shape. NOT a CSV;
                             FreeAgent's expense import is API-only.
                             You (or a small script) supply the FreeAgent
                             \`user\` and \`category\` URIs at import time.
  freeagent-bank.csv       — Bank-import CSV (FreeAgent + generic OFX-style).
                             Use FreeAgent's bank import UI; pick the CSV
                             format option matching your account.
  receipts/                — JPEG/PNG image attachments, named
                             <date>_<supplier>_<total>.<ext>. The
                             accountant.csv and freeagent-expenses.json
                             entries reference these filenames.
  manifest.json            — machine-readable summary (count, date range,
                             currency mix, files included).

These exports are FreeAgent-shaped, not FreeAgent-imported. You'll
still need either FreeAgent's UI or a small upload script to bring the
data in. Direct OAuth integration is a planned future enhancement.
`;

export function buildExportZip(
  receipts: ReadonlyArray<Receipt>,
  options: ZipExportOptions = {},
): Uint8Array {
  const {
    includeSimpleCsv = true,
    includeAccountantCsv = true,
    includeFreeAgentExpenses = true,
    includeFreeAgentBank = true,
    includeImages = true,
    generatedAt,
  } = options;

  const sorted = sortNewestFirst(receipts);
  const generated_at = generatedAt ?? new Date().toISOString();

  const filesIncluded: string[] = ['README.md', 'manifest.json'];
  const archive: Record<string, Uint8Array> = {
    'README.md': strToU8(README),
  };

  if (includeSimpleCsv) {
    archive['simple.csv'] = strToU8(receiptsToSimpleCsv(sorted));
    filesIncluded.push('simple.csv');
  }
  if (includeAccountantCsv) {
    archive['accountant.csv'] = strToU8(receiptsToAccountantCsv(sorted));
    filesIncluded.push('accountant.csv');
  }
  if (includeFreeAgentExpenses) {
    archive['freeagent-expenses.json'] = strToU8(receiptsToFreeAgentJson(sorted));
    filesIncluded.push('freeagent-expenses.json');
  }
  if (includeFreeAgentBank) {
    archive['freeagent-bank.csv'] = strToU8(receiptsToBankCsv(sorted));
    filesIncluded.push('freeagent-bank.csv');
  }

  let discardedPhotoCount = 0;
  if (includeImages) {
    const used = new Set<string>();
    for (const r of sorted) {
      if (r.image_data_url == null) {
        discardedPhotoCount++;
        continue;
      }
      const decoded = dataUrlToBytes(r.image_data_url);
      if (!decoded) continue;
      let filename = attachmentFilename(r, decoded.ext);
      // Collision suffix when two receipts derive the same filename.
      if (used.has(filename)) {
        const dot = filename.lastIndexOf('.');
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        const ext = dot > 0 ? filename.slice(dot) : '';
        let i = 2;
        while (used.has(`${stem}_${i}${ext}`)) i++;
        filename = `${stem}_${i}${ext}`;
      }
      used.add(filename);
      archive[`receipts/${filename}`] = decoded.bytes;
    }
  } else {
    discardedPhotoCount = sorted.filter((r) => r.image_data_url == null).length;
  }

  const manifest: ZipManifest = {
    $shape: 'shippie/receipt-snap/zip-export-v1',
    generated_at,
    generated_by: 'shippie/receipt-snap',
    count: sorted.length,
    discarded_photo_count: discardedPhotoCount,
    currencies: summariseCurrencies(sorted),
    date_range: summariseDateRange(sorted),
    files: filesIncluded,
  };
  archive['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);

  return zipSync(archive);
}
