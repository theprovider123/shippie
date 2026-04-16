/**
 * shippie.files.*
 *
 * BYO backend file storage — delegates to the configured BackendAdapter.
 *
 * Spec v5 §2.
 */
import { getAdapter } from './configure.ts';

export async function upload(
  blob: Blob,
  filename: string,
): Promise<{ key: string; url: string }> {
  return getAdapter().files.upload(blob, filename);
}

export async function getFile(key: string): Promise<string | null> {
  return getAdapter().files.get(key);
}

export async function remove(key: string): Promise<void> {
  return getAdapter().files.delete(key);
}

export { remove as delete };
