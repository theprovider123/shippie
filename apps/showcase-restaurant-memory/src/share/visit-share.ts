/**
 * Restaurant visit share + import.
 *
 * Privacy considerations:
 *   - Coordinates DROPPED — sharing your latitude is a PII leak even
 *     among friends. The receiver gets the name + notes + photo.
 *   - Photo is fetched from IndexedDB and embedded as a data URL. Big
 *     photos exceed the single-frame QR cap, so the share sheet falls
 *     back to "use Share or Copy" (no size limit on a URL).
 *   - photoLocalId DROPPED — it's a per-device IDB key, meaningless
 *     on the receiving end.
 */
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  verifyBlob,
  type ShareBlob,
  type VerifyResult,
} from '@shippie/share';
import { loadPhoto, savePhoto } from '../photo-store.ts';

export const VISIT_SHARE_TYPE = 'restaurant-visit';

export interface VisitSharePayload {
  name: string;
  notes?: string | null;
  rating?: number | null;
  visitedAt: string;
  photoDataUrl?: string | null;
}

export type VisitImportCheck =
  | {
      ok: true;
      payload: VisitSharePayload;
      verified: true;
      blob: ShareBlob<VisitSharePayload>;
    }
  | {
      ok: true;
      payload: VisitSharePayload;
      verified: false;
      reason: 'tampered' | 'malformed' | 'verifier_unavailable';
      blob: ShareBlob<VisitSharePayload>;
    }
  | { ok: false; reason: 'wrong_type' | 'wrong_version' };

export interface VisitForShare {
  name: string;
  notes?: string;
  rating?: number;
  visitedAt: string;
  photoLocalId?: string;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function buildVisitShare(
  visit: VisitForShare,
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin + '/'
    : '/',
): Promise<{ blob: ShareBlob<VisitSharePayload>; url: string }> {
  let photoDataUrl: string | null = null;
  if (visit.photoLocalId) {
    const photo = await loadPhoto(visit.photoLocalId);
    if (photo) photoDataUrl = await blobToDataUrl(photo);
  }
  const payload: VisitSharePayload = {
    name: visit.name,
    notes: visit.notes ?? null,
    rating: visit.rating ?? null,
    visitedAt: visit.visitedAt,
    photoDataUrl,
  };
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<VisitSharePayload>({
    type: VISIT_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob: blob as ShareBlob<VisitSharePayload>, url };
}

export async function checkVisitImport(blob: ShareBlob): Promise<VisitImportCheck> {
  if (blob.v !== 1) return { ok: false, reason: 'wrong_version' };
  if (blob.type !== VISIT_SHARE_TYPE) return { ok: false, reason: 'wrong_type' };
  const result: VerifyResult = await verifyBlob(blob);
  const typed = blob as ShareBlob<VisitSharePayload>;
  const payload = typed.payload;
  if (result.valid) return { ok: true, payload, verified: true, blob: typed };
  return { ok: true, payload, verified: false, reason: result.reason, blob: typed };
}

/**
 * Import a shared visit. Returns a partial visit suitable for the host
 * App's setState — the App owns the persistence layer (localStorage)
 * and adds id + photoLocalId fields itself.
 */
export async function importVisit(
  blob: ShareBlob<VisitSharePayload>,
): Promise<{
  name: string;
  notes: string;
  rating: number | undefined;
  visitedAt: string;
  photoLocalId: string | undefined;
  provenance: string;
}> {
  const { payload } = blob;
  let photoLocalId: string | undefined;
  if (payload.photoDataUrl) {
    photoLocalId = `imported_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const photoBlob = await dataUrlToBlob(payload.photoDataUrl);
    await savePhoto(photoLocalId, photoBlob);
  }
  const author = blob.author.name ?? 'an unnamed device';
  const fingerprint = blob.author.pubkey.slice(0, 12);
  const when = new Date(blob.created_at).toLocaleDateString();
  const provenance = `\n\n— shared by ${author} (${fingerprint}…) on ${when}`;
  const baseNotes = payload.notes ?? '';
  return {
    name: payload.name,
    notes: baseNotes + provenance,
    rating: payload.rating ?? undefined,
    visitedAt: payload.visitedAt,
    photoLocalId,
    provenance,
  };
}
