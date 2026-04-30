/**
 * Journal entry share + import.
 *
 * Subset of JournalEntry that travels — the embedding (Float32Array)
 * is dropped (it's a derived artifact; the recipient's local AI
 * recomputes it on import). Sentiment label + topic come along so
 * the receiver's chart shows the same colour without re-analysis.
 */
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  verifyBlob,
  type ShareBlob,
  type VerifyResult,
} from '@shippie/share';
import { createEntry } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type {
  JournalEntry,
  SentimentLabel,
  Topic,
} from '../db/schema.ts';

export const JOURNAL_SHARE_TYPE = 'journal-entry';

export interface JournalSharePayload {
  title?: string | null;
  body: string;
  sentiment?: number | null;
  sentiment_label?: SentimentLabel | null;
  topic?: Topic | null;
  source_created_at?: string | null;
}

export type JournalImportCheck =
  | {
      ok: true;
      payload: JournalSharePayload;
      verified: true;
      blob: ShareBlob<JournalSharePayload>;
    }
  | {
      ok: true;
      payload: JournalSharePayload;
      verified: false;
      reason: 'tampered' | 'malformed' | 'verifier_unavailable';
      blob: ShareBlob<JournalSharePayload>;
    }
  | { ok: false; reason: 'wrong_type' | 'wrong_version' };

export function entryToPayload(entry: JournalEntry): JournalSharePayload {
  return {
    title: entry.title ?? null,
    body: entry.body,
    sentiment: entry.sentiment ?? null,
    sentiment_label: entry.sentiment_label ?? null,
    topic: entry.topic ?? null,
    source_created_at: entry.created_at ?? null,
  };
}

export async function buildJournalShare(
  entry: JournalEntry,
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin + '/'
    : '/',
): Promise<{ blob: ShareBlob<JournalSharePayload>; url: string }> {
  const payload = entryToPayload(entry);
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<JournalSharePayload>({
    type: JOURNAL_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob: blob as ShareBlob<JournalSharePayload>, url };
}

export async function checkJournalImport(blob: ShareBlob): Promise<JournalImportCheck> {
  if (blob.v !== 1) return { ok: false, reason: 'wrong_version' };
  if (blob.type !== JOURNAL_SHARE_TYPE) return { ok: false, reason: 'wrong_type' };
  const result: VerifyResult = await verifyBlob(blob);
  const typed = blob as ShareBlob<JournalSharePayload>;
  const payload = typed.payload;
  if (result.valid) return { ok: true, payload, verified: true, blob: typed };
  return { ok: true, payload, verified: false, reason: result.reason, blob: typed };
}

function provenanceFooter(blob: ShareBlob<JournalSharePayload>): string {
  const author = blob.author.name ?? 'an unnamed device';
  const when = new Date(blob.created_at).toLocaleDateString();
  const fingerprint = blob.author.pubkey.slice(0, 12);
  return `\n\n— shared by ${author} (${fingerprint}…) on ${when}`;
}

/**
 * Write the imported entry. The recipient's local AI will re-classify
 * sentiment + topic on its own pass, but we seed the values from the
 * sender so the entry shows the right colour immediately.
 */
export async function importJournalEntry(
  blob: ShareBlob<JournalSharePayload>,
): Promise<string> {
  const db = resolveLocalDb();
  const { payload } = blob;
  const body = payload.body + provenanceFooter(blob);
  const entry = await createEntry(db, {
    title: payload.title ?? null,
    body,
    sentiment: payload.sentiment ?? null,
    sentiment_label: payload.sentiment_label ?? null,
    topic: payload.topic ?? null,
  });
  return entry.id;
}
