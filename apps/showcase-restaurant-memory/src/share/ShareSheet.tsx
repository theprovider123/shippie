import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';
import { fragmentFitsInQr, type ShareBlob } from '@shippie/share';
import {
  buildVisitShare,
  type VisitForShare,
  type VisitSharePayload,
} from './visit-share.ts';

interface ShareSheetProps {
  visit: VisitForShare;
  onClose: () => void;
}

export function ShareSheet({ visit, onClose }: ShareSheetProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [fits, setFits] = useState(true);
  const [bytes, setBytes] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [blob, setBlob] = useState<ShareBlob<VisitSharePayload> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { blob: signed, url: shareUrl } = await buildVisitShare(visit);
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
        console.warn('[restaurant-share] sheet build failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visit]);

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
          title: visit.name,
          text: 'A restaurant memory · open in Shippie to import.',
          url,
        });
        return;
      } catch {
        /* cancelled */
      }
    }
    void copyLink();
  }

  return (
    <div className="share-sheet-overlay" onClick={onClose}>
      <div className="share-sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="share-sheet-header">
          <h2>Share &ldquo;{visit.name}&rdquo;</h2>
          <button type="button" className="share-sheet-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <p className="share-sheet-blurb">
          Anonymous & local-first. Coordinates are stripped before sending —
          only the place, your notes, and the photo travel. The receiver
          verifies the signature, then imports.
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
                  This memory's photo makes the payload too big for a single
                  QR ({bytes} bytes). Use Share or Copy below — no size limit.
                </p>
              </div>
            )}

            <div className="share-url-row">
              <code className="share-url" title={url}>
                {url.length > 64 ? url.slice(0, 64) + '…' : url}
              </code>
            </div>

            <div className="share-sheet-actions">
              <button type="button" className="primary" onClick={shareNative}>Share via…</button>
              <button type="button" onClick={copyLink}>
                {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Could not copy' : 'Copy link'}
              </button>
            </div>

            {blob ? (
              <p className="muted small share-author">
                signed by {blob.author.name ?? 'this device'} · {bytes} bytes
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
