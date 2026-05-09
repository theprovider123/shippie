/**
 * Bottom-sheet share UI for a single blend. Renders the share URL with
 * a Copy button, a brand-styled QR (when the blob fits in a QR), and
 * "Share via…" via the Web Share API when available.
 *
 * Privacy posture: the blob is encoded into the URL fragment so it
 * never leaves the browser. The recipient's app reads the fragment,
 * verifies the signature, and offers an Import card.
 */
import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';
import { fragmentFitsInQr, type ShareBlob } from '@shippie/share';
import type { BlendWithIngredients } from '../db/schema.ts';
import { buildBlendShare, type BlendSharePayload } from './blend-share.ts';

interface ShareSheetProps {
  blend: BlendWithIngredients;
  onClose: () => void;
}

export function ShareSheet({ blend, onClose }: ShareSheetProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [fits, setFits] = useState(true);
  const [bytes, setBytes] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [blob, setBlob] = useState<ShareBlob<BlendSharePayload> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { blob: signed, url: shareUrl } = await buildBlendShare(blend);
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
        console.warn('[steep-share] sheet build failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blend]);

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
          title: `${blend.name} — a tea blend from Steep`,
          text: `${blend.name}: open in Steep to brew or import.`,
          url,
        });
        return;
      } catch {
        /* user cancelled */
      }
    }
    void copyLink();
  }

  return (
    <div className="data-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="data-panel share-sheet"
        role="dialog"
        aria-labelledby="share-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="data-panel-header">
          <div>
            <h2 id="share-sheet-title">Share blend</h2>
            <p className="muted">{blend.name}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close share sheet">
            ×
          </button>
        </header>

        {fits && qrMarkup ? (
          <div
            className="share-qr"
            // The QR is a static SVG produced server-side equivalent —
            // no scripts, no listeners. Direct innerHTML is safe here.
            dangerouslySetInnerHTML={{ __html: qrMarkup }}
            aria-label="QR code containing the share link"
          />
        ) : null}

        {!fits ? (
          <p className="muted">
            This blend is too large to fit in a QR code ({bytes} bytes). Use the link or share button below.
          </p>
        ) : null}

        {url ? (
          <div className="share-link-row">
            <code className="share-link" title={url}>
              {url.length > 80 ? `${url.slice(0, 60)}…${url.slice(-12)}` : url}
            </code>
            <button type="button" onClick={copyLink}>
              {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Try again' : 'Copy'}
            </button>
          </div>
        ) : null}

        <div className="data-panel-actions">
          <button type="button" className="primary" onClick={shareNative} disabled={!url}>
            Share via…
          </button>
        </div>

        {blob ? (
          <p className="muted share-attribution">
            Signed by {blob.author?.name ?? 'this device'}. Recipients can verify the signature before importing.
          </p>
        ) : null}
      </section>
    </div>
  );
}
