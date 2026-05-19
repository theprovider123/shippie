/**
 * shippie.files.*
 *
 * Legacy BYO backend file storage — delegates to the configured BackendAdapter.
 * Public Shippie marketplace tools should use `shippie.local.files` instead.
 *
 * Kept for older embedded apps and migration helpers.
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
