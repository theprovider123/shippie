import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';
import { fragmentFitsInQr, type ShareBlob } from '@shippie/share';
import type { JournalEntry } from '../db/schema.ts';
import {
  buildJournalShare,
  type JournalSharePayload,
} from './journal-share.ts';

interface ShareSheetProps {
  entry: JournalEntry;
  onClose: () => void;
}

export function ShareSheet({ entry, onClose }: ShareSheetProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [fits, setFits] = useState(true);
  const [bytes, setBytes] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [blob, setBlob] = useState<ShareBlob<JournalSharePayload> | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinnedUrl, setPinnedUrl] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { blob: signed, url: shareUrl } = await buildJournalShare(entry);
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
        console.warn('[journal-share] sheet build failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

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
          title: entry.title || 'A journal entry',
          text: 'Shared via Shippie · open in Journal to import.',
          url,
        });
        return;
      } catch {
        /* user cancelled */
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

  const previewTitle = entry.title || (entry.body ? entry.body.slice(0, 32) + '…' : 'untitled entry');

  return (
    <div className="share-sheet-overlay" onClick={onClose}>
      <div className="share-sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="share-sheet-header">
          <h2>Share &ldquo;{previewTitle}&rdquo;</h2>
          <button type="button" className="ghost share-sheet-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <p className="share-sheet-blurb">
          Local-first, anonymous. The entry travels in the URL itself —
          no server holds the bytes. The receiver verifies the signature,
          then imports it into their own Journal.
        </p>

        {!url ? (
          <p className="muted small">Building share link…</p>
        ) : (
          <>
            {fits && qrMarkup ? (
              <div className="share-qr">
                <div className="share-qr-frame" dangerouslySetInnerHTML={{ __html: qrMarkup }} />
                <p className="muted small">Scan with another phone's camera.</p>
              </div>
            ) : (
              <div className="share-qr-fallback">
                <p className="muted small">
                  This entry is too long for a single QR code ({bytes} bytes).
                  Use Share or Copy below — those have no size limit.
                </p>
              </div>
            )}

            <div className="share-url-row">
              <code className="share-url" title={url}>
                {url.length > 64 ? url.slice(0, 64) + '…' : url}
              </code>
            </div>

            <div className="share-sheet-actions">
              <button type="button" className="primary" onClick={shareNative}>
                Share via…
              </button>
              <button type="button" onClick={copyLink}>
                {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Could not copy' : 'Copy link'}
              </button>
            </div>

            {blob ? (
              <p className="muted small share-author">
                signed by {blob.author.name ?? 'this device'} · {bytes} bytes
              </p>
            ) : null}

            <div className="share-pin">
              {pinnedUrl ? (
                <>
                  <p className="muted small">
                    Public link · pinned for 90 days · anyone can open it,
                    no Shippie needed
                  </p>
                  <div className="share-url-row">
                    <code className="share-url" title={pinnedUrl}>{pinnedUrl}</code>
                  </div>
                  <button type="button" onClick={copyPinned}>
                    {copyState === 'copied' ? 'Copied!' : 'Copy public link'}
                  </button>
                </>
              ) : (
                <>
                  <p className="muted small">
                    Sending to someone without Shippie? Pin a 90-day public
                    link. The entry goes to Shippie's R2 keyed by hash; the
                    URL renders a read-only preview anyone can open.
                  </p>
                  <button type="button" onClick={pinPublicLink} disabled={pinning}>
                    {pinning ? 'Pinning…' : 'Pin a public link (90 days)'}
                  </button>
                  {pinError ? (
                    <p className="error" style={{ fontSize: 12 }}>{pinError}</p>
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
