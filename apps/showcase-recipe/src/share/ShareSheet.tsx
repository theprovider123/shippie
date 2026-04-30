/**
 * Bottom-sheet share UI for a single recipe. Renders:
 *   - the share URL (truncated, with a Copy button)
 *   - a brand-styled QR via @shippie/qr (single frame)
 *   - "Share via…" (navigator.share when available)
 *   - "Save as image" — render the QR canvas to a PNG download (later)
 *
 * Privacy posture: the blob is encoded into the URL fragment so it
 * never leaves the browser. The recipient opens the URL in their
 * Recipe app (or installs the app), which reads the fragment, verifies
 * the signature, and offers an Import card. No server holds the blob.
 */
import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';
import { fragmentFitsInQr, type ShareBlob } from '@shippie/share';
import type { RecipeWithIngredients } from '../db/schema.ts';
import { buildRecipeShare, type RecipeSharePayload } from './recipe-share.ts';

interface ShareSheetProps {
  recipe: RecipeWithIngredients;
  onClose: () => void;
}

export function ShareSheet({ recipe, onClose }: ShareSheetProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [fits, setFits] = useState<boolean>(true);
  const [bytes, setBytes] = useState<number>(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [blob, setBlob] = useState<ShareBlob<RecipeSharePayload> | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinnedUrl, setPinnedUrl] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { blob: signed, url: shareUrl } = await buildRecipeShare(recipe);
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
        console.warn('[recipe-share] sheet build failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipe]);

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
          title: `${recipe.title} — a recipe from Shippie`,
          text: `${recipe.title}: open in Recipe Saver to import.`,
          url,
        });
        return;
      } catch {
        /* user cancelled — fall through */
      }
    }
    void copyLink();
  }

  // Pin to a 90-day public link via /api/c. Useful when you want to
  // text the recipe to someone who doesn't have Shippie installed —
  // the URL renders a static read-only preview at shippie.app/c/<hash>
  // with an "Open in Recipe Saver" deep-link. The blob still travels
  // signed; the server just stores the bytes by their hash.
  async function pinPublicLink() {
    if (!blob) return;
    setPinning(true);
    setPinError(null);
    try {
      // Hit the platform's API on the canonical host. Recipe runs on
      // recipe.shippie.app or shippie.app/run/recipe/, so we always
      // POST to https://shippie.app to dodge cross-origin issues with
      // the static-bake bridge.
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
    <div className="share-sheet-overlay" onClick={onClose}>
      <div
        className="share-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Share ${recipe.title}`}
      >
        <header className="share-sheet-header">
          <h2>Share &ldquo;{recipe.title}&rdquo;</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="share-sheet-blurb">
          Local-first, anonymous. The recipe travels in the URL itself —
          no server holds the bytes. The receiver verifies the signature,
          then imports it into their own Recipe app.
        </p>

        {!url ? (
          <p className="muted small">Building share link…</p>
        ) : (
          <>
            {fits && qrMarkup ? (
              <div className="share-qr">
                <div className="share-qr-frame" dangerouslySetInnerHTML={{ __html: qrMarkup }} />
                <p className="muted small share-qr-caption">
                  Scan with another phone's camera.
                </p>
              </div>
            ) : (
              <div className="share-qr-fallback">
                <p className="muted small">
                  This recipe is too detailed for a single QR code ({bytes} bytes).
                  Use Share or Copy below — those have no size limit.
                </p>
              </div>
            )}

            <div className="share-url-row">
              <code className="share-url" title={url}>{url.length > 64 ? url.slice(0, 64) + '…' : url}</code>
            </div>

            <div className="share-sheet-actions">
              <button type="button" className="primary" onClick={shareNative}>
                Share via…
              </button>
              <button type="button" className="ghost" onClick={copyLink}>
                {copyState === 'copied'
                  ? 'Copied!'
                  : copyState === 'error'
                    ? 'Could not copy'
                    : 'Copy link'}
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
                    <code className="share-url" title={pinnedUrl}>
                      {pinnedUrl}
                    </code>
                  </div>
                  <button type="button" className="ghost" onClick={copyPinned}>
                    {copyState === 'copied' ? 'Copied!' : 'Copy public link'}
                  </button>
                </>
              ) : (
                <>
                  <p className="muted small">
                    Sending to someone without Shippie? Pin a 90-day public
                    link. The recipe goes to Shippie's R2 keyed by hash; the
                    URL renders a read-only preview anyone can open.
                  </p>
                  <button
                    type="button"
                    className="ghost"
                    onClick={pinPublicLink}
                    disabled={pinning}
                  >
                    {pinning ? 'Pinning…' : 'Pin a public link (90 days)'}
                  </button>
                  {pinError ? (
                    <p className="error" style={{ fontSize: 12 }}>
                      {pinError}
                    </p>
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
