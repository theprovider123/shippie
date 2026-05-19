import type { KeepsakePayload } from './types';

export async function shareKeepsake(
  payload: KeepsakePayload,
  onSuccess?: () => void,
): Promise<void> {
  const { pngBlob, pdfBlob, filename } = payload;
  const pngName = filename.replace(/\.pdf$/, '.png');
  const files = [
    new File([pngBlob], pngName, { type: 'image/png' }),
    new File([pdfBlob], filename, { type: 'application/pdf' }),
  ];

  type ShareCapable = Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  const nav = navigator as ShareCapable;
  if (typeof nav.share === 'function' && (nav.canShare?.({ files }) ?? false)) {
    try {
      await nav.share({ files });
      onSuccess?.();
      return;
    } catch {
      // fall through to anchor download
    }
  }

  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }
  onSuccess?.();
}
