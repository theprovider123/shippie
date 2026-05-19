/**
 * Browser image helpers used before OCR and before storing receipt
 * photos locally. We keep enough resolution for small thermal-printer
 * text, but still compress so localStorage does not fill immediately.
 */

export const RECEIPT_MAX_EDGE = 2048;
export const RECEIPT_JPEG_QUALITY = 0.88;

interface DrawableImage {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
}

async function loadDrawable(file: Blob): Promise<DrawableImage> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close?.(),
      };
    } catch {
      // Fall through to <img>. Some mobile browsers are stricter about
      // camera-library blobs, while the image element can still decode them.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        draw: (ctx, width, height) => ctx.drawImage(image, 0, 0, width, height),
        close: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("couldn't read that image"));
    };
    image.src = url;
  });
}

export async function compressReceiptImage(file: Blob): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose a receipt photo or image file.');
  }
  const image = await loadDrawable(file);
  const ratio = Math.min(1, RECEIPT_MAX_EDGE / Math.max(image.width, image.height));
  const w = Math.round(image.width * ratio);
  const h = Math.round(image.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  image.draw(ctx, w, h);
  image.close();
  const dataUrl = canvas.toDataURL('image/jpeg', RECEIPT_JPEG_QUALITY);
  if (!dataUrl || dataUrl === 'data:,') throw new Error("couldn't read that image");
  return dataUrl;
}

export async function rotateImageDataUrl(dataUrl: string, quarterTurns: number): Promise<string> {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return dataUrl;

  const image = await loadDataUrlImage(dataUrl);
  const swap = turns === 1 || turns === 3;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? image.naturalHeight : image.naturalWidth;
  canvas.height = swap ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  if (turns === 1) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (turns === 2) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else if (turns === 3) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }

  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL('image/jpeg', RECEIPT_JPEG_QUALITY);
}

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("couldn't rotate that image"));
    image.src = dataUrl;
  });
}
