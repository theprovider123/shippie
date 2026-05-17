import { createLocalFiles } from '@shippie/local-files';

export const AVATAR_IMAGE_MAX = 512;
export const SHARED_IMAGE_MAX = 1600;
export const SHARED_IMAGE_QUALITY = 0.82;
export const VIDEO_HARD_LIMIT_BYTES = 10 * 1024 * 1024;
export const VIDEO_SYNC_LIMIT_BYTES = 2 * 1024 * 1024;

export class VideoTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`Video exceeds limit (${bytes} bytes)`);
    this.name = 'VideoTooLargeError';
  }
}

export async function writeOpfsFile(path: string, file: File): Promise<void> {
  const files = await createLocalFiles();
  await files.write(path, file);
}

export async function readOpfsFileUrl(path: string): Promise<string> {
  const files = await createLocalFiles();
  const blob = await files.read(path);
  return URL.createObjectURL(blob);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read file')));
    reader.readAsDataURL(file);
  });
}

/**
 * Returns a data URL safe to embed in synced state.
 * Images: downscaled to SHARED_IMAGE_MAX. Videos: only inlined under VIDEO_SYNC_LIMIT_BYTES;
 * larger videos return null (callers must fall back to OPFS-only). Throws VideoTooLargeError
 * for videos above the hard upload limit.
 */
export async function readSyncMediaDataUrl(file: File): Promise<string | null> {
  if (file.type.startsWith('image/')) {
    return readImageFileAsDataUrl(file, SHARED_IMAGE_MAX);
  }
  if (file.type.startsWith('video/')) {
    if (file.size > VIDEO_HARD_LIMIT_BYTES) {
      throw new VideoTooLargeError(file.size);
    }
    if (file.size > VIDEO_SYNC_LIMIT_BYTES) {
      return null;
    }
    return readFileAsDataUrl(file);
  }
  return readFileAsDataUrl(file);
}

export async function readImageFileAsDataUrl(file: File, maxDimension: number): Promise<string> {
  if (!file.type.startsWith('image/') || typeof document === 'undefined') {
    return readFileAsDataUrl(file);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!largestSide) return readFileAsDataUrl(file);
    const scale = Math.min(1, maxDimension / largestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return readFileAsDataUrl(file);
    context.drawImage(image, 0, 0, width, height);
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outputType, outputType === 'image/jpeg' ? SHARED_IMAGE_QUALITY : undefined);
  } catch {
    return readFileAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Could not load image')));
    image.src = src;
  });
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
