/**
 * Memory share for Mevrouw — outbound + inbound.
 *
 * Mevrouw's memory timeline already syncs between paired phones via
 * Yjs. This adds a one-shot "share to anyone" surface: pack a single
 * memory as a signed blob, encode in a URL fragment, deliver via QR
 * or AirDrop. Useful for sending an anniversary photo to grandma
 * without joining her into the couple-doc.
 *
 * Inbound: when a non-paired Mevrouw user opens such a URL, the import
 * card lets them save the memory into their own couple-doc as a new
 * row authored by their own device. The original author identity is
 * preserved in the provenance footer (content) so the receiver knows
 * who shared.
 */
import * as Y from 'yjs';
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  verifyBlob,
  type ShareBlob,
  type VerifyResult,
} from '@shippie/share';
import {
  addMemory,
  type Memory,
} from '@/features/memories/memories-state.ts';

export const MEMORY_SHARE_TYPE = 'mevrouw-memory';

export interface MemorySharePayload {
  content: string | null;
  photo_data_url: string | null;
  memory_date: string;
  source_created_at?: string | null;
}

export type MemoryImportCheck =
  | {
      ok: true;
      payload: MemorySharePayload;
      verified: true;
      blob: ShareBlob<MemorySharePayload>;
    }
  | {
      ok: true;
      payload: MemorySharePayload;
      verified: false;
      reason: 'tampered' | 'malformed' | 'verifier_unavailable';
      blob: ShareBlob<MemorySharePayload>;
    }
  | { ok: false; reason: 'wrong_type' | 'wrong_version' };

export function memoryToPayload(m: Memory): MemorySharePayload {
  return {
    content: m.content,
    photo_data_url: m.photo_data_url,
    memory_date: m.memory_date,
    source_created_at: m.created_at,
  };
}

export async function buildMemoryShare(
  memory: Memory,
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin + '/'
    : '/',
): Promise<{ blob: ShareBlob<MemorySharePayload>; url: string }> {
  const payload = memoryToPayload(memory);
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<MemorySharePayload>({
    type: MEMORY_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob: blob as ShareBlob<MemorySharePayload>, url };
}

export async function checkMemoryImport(blob: ShareBlob): Promise<MemoryImportCheck> {
  if (blob.v !== 1) return { ok: false, reason: 'wrong_version' };
  if (blob.type !== MEMORY_SHARE_TYPE) return { ok: false, reason: 'wrong_type' };
  const result: VerifyResult = await verifyBlob(blob);
  const typed = blob as ShareBlob<MemorySharePayload>;
  const payload = typed.payload;
  if (result.valid) return { ok: true, payload, verified: true, blob: typed };
  return { ok: true, payload, verified: false, reason: result.reason, blob: typed };
}

function provenanceFooter(blob: ShareBlob<MemorySharePayload>): string {
  const author = blob.author.name ?? 'someone';
  const fingerprint = blob.author.pubkey.slice(0, 12);
  const when = new Date(blob.created_at).toLocaleDateString();
  return `\n\n— shared by ${author} (${fingerprint}…) on ${when}`;
}

/**
 * Import a memory into the receiver's own couple-doc. The author_device
 * field is set to the receiver's local device id (per Mevrouw's
 * convention), and the original sender's identity is preserved in the
 * content body via the provenance footer.
 */
export function importMemory(
  doc: Y.Doc,
  myDeviceId: string,
  blob: ShareBlob<MemorySharePayload>,
): Memory {
  const baseContent = blob.payload.content ?? '';
  const content = (baseContent + provenanceFooter(blob)).trim() || null;
  return addMemory(doc, myDeviceId, {
    content,
    photo_data_url: blob.payload.photo_data_url,
    memory_date: blob.payload.memory_date,
    is_favourite: false,
  });
}
