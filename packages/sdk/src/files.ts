/**
 * shippie.files.*
 *
 * Upload / fetch / delete user files. Uploads use a presigned R2 URL
 * obtained from /__shippie/files so the browser writes directly to R2
 * without proxying through the worker.
 *
 * Spec v6 §7.1.
 */
import { del, get, post } from './http.ts';
import type { FileUploadResult } from './types.ts';

interface PresignedUpload {
  key: string;
  upload_url: string;
  public_url: string;
}

export async function upload(
  blob: Blob,
  filename: string,
): Promise<FileUploadResult> {
  const presigned = await post<PresignedUpload>(`/files`, {
    filename,
    size_bytes: blob.size,
    mime_type: blob.type || 'application/octet-stream',
  });

  const res = await fetch(presigned.upload_url, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
    },
  });
  if (!res.ok) {
    throw new Error(`shippie: file upload failed with ${res.status}`);
  }

  return { url: presigned.public_url, key: presigned.key };
}

export async function getFile(key: string): Promise<Blob> {
  const res = await fetch(`/__shippie/files/${encodeURIComponent(key)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`shippie: file fetch ${key} → ${res.status}`);
  }
  return res.blob();
}

export async function remove(key: string): Promise<void> {
  await del(`/files/${encodeURIComponent(key)}`);
}

export { getFile as get, remove as delete };
