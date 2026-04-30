import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';
import { fragmentFitsInQr, type ShareBlob } from '@shippie/share';
import {
  buildMemoryShare,
  type MemorySharePayload,
} from './memory-share.ts';
import type { Memory } from '@/features/memories/memories-state.ts';
import { Button } from '@/components/ui/button.tsx';
import { formatDateShort } from '@/lib/dates.ts';

interface Props {
  memory: Memory;
  onClose: () => void;
}

export function ShareSheet({ memory, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [fits, setFits] = useState(true);
  const [bytes, setBytes] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [blob, setBlob] = useState<ShareBlob<MemorySharePayload> | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinnedUrl, setPinnedUrl] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { blob: signed, url: shareUrl } = await buildMemoryShare(memory);
        if (cancelled) return;
        setBlob(signed);
        setUrl(shareUrl);
        const fit = await fragmentFitsInQr(signed);
        if (cancelled) return;
        setFits(fit.fits);
        setBytes(fit.bytes);
        if (fit.fits) {
          const svg = await qrSvg(shareUrl, { ecc: 'M', size: 240 });
          if (!cancelled) setQrMarkup(svg);
        }
      } catch (err) {
        console.warn('[memory-share] failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memory]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  async function shareNative() {
    if (!url) return;
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: 'A memory',
          text: 'A moment, shared via Shippie. Open in Mevrouw to keep it.',
          url,
        });
        return;
      } catch {
        /* cancelled */
      }
    }
    void copyLink();
  }

  async function pinPublicLink() {
    if (!blob) return;
    setPinning(true);
    setPinError(null);
    try {
      const res = await fetch('https://shippie.app/api/c', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(blob),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`pin failed (${res.status}): ${txt}`);
      }
      const j = (await res.json()) as { url: string };
      setPinnedUrl(j.url);
    } catch (e) {
      setPinError((e as Error).message ?? 'Could not pin link.');
    } finally {
      setPinning(false);
    }
  }

  async function copyPinned() {
    if (!pinnedUrl) return;
    try {
      await navigator.clipboard.writeText(pinnedUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/55 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--card)] text-[var(--foreground)] border-t-2 border-[var(--gold)] p-5 pb-[calc(28px+env(safe-area-inset-bottom,0))] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">
            Share this memory
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 border border-[var(--border)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
          Share one memory with someone outside your couple — anonymous
          and local-first. The memory travels in the URL itself, no
          server holds the bytes. The recipient verifies the signature.
        </p>

        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          {formatDateShort(memory.memory_date)}
        </p>
        {memory.photo_data_url ? (
          <img
            src={memory.photo_data_url}
            alt=""
            className="w-full max-h-40 object-cover border border-[var(--border)]"
          />
        ) : null}
        {memory.content ? (
          <p className="text-sm font-serif italic line-clamp-3 text-[var(--muted-foreground)]">
            {memory.content}
          </p>
        ) : null}

        {!url ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Building share link…
          </p>
        ) : (
          <>
            {fits && qrMarkup ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-60 h-60 bg-[var(--background)] p-2 box-content"
                  dangerouslySetInnerHTML={{ __html: qrMarkup }}
                />
                <p className="text-[11px] text-[var(--muted-foreground)] text-center">
                  Scan with another phone's camera.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--muted-foreground)] border border-dashed border-[var(--border)] p-3 text-center">
                Photo makes this too big for a single QR ({bytes} bytes).
                Use Share or Copy below.
              </p>
            )}

            <div className="flex items-center bg-[var(--gold-wash)] border-l-2 border-[var(--gold)] px-3 py-2">
              <code className="font-mono text-[11px] break-all text-[var(--gold)] flex-1">
                {url.length > 64 ? url.slice(0, 64) + '…' : url}
              </code>
            </div>

            <div className="flex gap-2">
              <Button onClick={shareNative} className="flex-1 h-11">Share via…</Button>
              <Button
                variant="secondary"
                onClick={copyLink}
                className="flex-1 h-11"
              >
                {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Could not copy' : 'Copy link'}
              </Button>
            </div>

            {blob ? (
              <p className="font-mono text-[10px] text-[var(--muted-foreground)] text-center">
                signed by {blob.author.name ?? 'this device'} · {bytes} bytes
              </p>
            ) : null}

            <div className="border-t border-[var(--border)] pt-3 flex flex-col gap-2">
              {pinnedUrl ? (
                <>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    Public link · pinned for 90 days · anyone can open it,
                    no Shippie needed
                  </p>
                  <div className="flex items-center bg-[var(--gold-wash)] border-l-2 border-[var(--gold)] px-3 py-2">
                    <code className="font-mono text-[11px] break-all text-[var(--gold)] flex-1">
                      {pinnedUrl}
                    </code>
                  </div>
                  <Button variant="secondary" onClick={copyPinned} className="h-9 self-start">
                    {copyState === 'copied' ? 'Copied!' : 'Copy public link'}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                    For someone without Mevrouw — pin a 90-day public link.
                    The memory goes to Shippie's R2 keyed by hash; the URL
                    renders a read-only preview.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={pinPublicLink}
                    disabled={pinning}
                    className="h-9 self-start text-[11px] uppercase tracking-wider"
                  >
                    {pinning ? 'Pinning…' : 'Pin a public link (90 days)'}
                  </Button>
                  {pinError ? (
                    <p className="text-xs text-[var(--destructive)]">{pinError}</p>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
