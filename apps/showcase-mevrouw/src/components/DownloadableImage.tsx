/**
 * DownloadableImage — <img> wrapper with a "Save" button that downloads
 * the image to the device's Files app / Photos / Downloads folder.
 *
 * Drop-in replacement anywhere user-uploaded photos render — trips,
 * memories, glimpses, surprises. Always visible on tap; styled small
 * so it doesn't dominate the image.
 *
 * Implementation: works with both data: URLs (most of mevrouw — photos
 * are stored as base64 in the Y.Doc) and http(s) URLs. For data URLs
 * it converts to a Blob first because some browsers strip the
 * `download` attribute on huge data: hrefs.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn.ts';

interface Props {
  src: string;
  alt?: string;
  className?: string;
  /** Filename suggestion for the download. Should not include the extension. */
  baseName?: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  // data:[<mime>][;base64],<data>
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!m) throw new Error('Not a data: URL');
  const mime = m[1] ?? 'application/octet-stream';
  const isBase64 = !!m[2];
  const data = m[3] ?? '';
  let bytes: Uint8Array;
  if (isBase64) {
    const bin = atob(data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return new Blob([bytes as BlobPart], { type: mime });
}

function extensionFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  return 'bin';
}

export function DownloadableImage({
  src,
  alt = '',
  className,
  baseName = 'mevrouw',
}: Props) {
  const [busy, setBusy] = useState(false);

  async function download(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      let blob: Blob;
      let ext = 'jpg';
      if (src.startsWith('data:')) {
        blob = dataUrlToBlob(src);
        ext = extensionFromMime(blob.type);
      } else {
        // Remote URL — fetch + blob it. Same-origin or CORS-allowed
        // sources only; otherwise the fetch fails and we fall back to
        // opening the URL in a new tab.
        try {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          blob = await res.blob();
          ext = extensionFromMime(blob.type);
        } catch {
          window.open(src, '_blank', 'noopener');
          return;
        }
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `${baseName}-${stamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free the object URL once the browser has had a chance to start the download.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.warn('[mevrouw:download]', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <img src={src} alt={alt} className={className} />
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-label="Save photo to device"
        className={cn(
          'absolute bottom-1 right-1 px-2 py-1 rounded-md',
          'bg-[var(--background)]/80 backdrop-blur-sm',
          'border border-[var(--border)]',
          'text-[10px] font-mono uppercase tracking-wider',
          'text-[var(--foreground)] hover:text-[var(--gold)]',
          'transition-colors active:scale-95',
        )}
      >
        {busy ? '…' : '↓ Save'}
      </button>
    </div>
  );
}
