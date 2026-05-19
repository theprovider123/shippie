import { useEffect, useState } from 'react';
import { qrSvg } from '@shippie/qr';

export type QrShareSheetProps = {
  open: boolean;
  url: string;
  title: string;
  body?: string;
  onClose: () => void;
  size?: number;
};

export function QrShareSheet({ open, url, title, body, onClose, size = 320 }: QrShareSheetProps) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    qrSvg(url, { size, ecc: 'M' })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, size]);

  if (!open) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // best-effort
    }
  };

  const onShare = async () => {
    if ('share' in navigator) {
      try {
        await navigator.share({ title, text: body, url });
        return;
      } catch {
        // user cancelled or unsupported — fall through
      }
    }
    await onCopy();
  };

  return (
    <div role="dialog" aria-modal="true" className="shippie-qr-sheet" onClick={onClose}>
      <div className="shippie-qr-sheet__surface" onClick={(e) => e.stopPropagation()}>
        <h2 className="shippie-qr-sheet__title">{title}</h2>
        {body ? <p className="shippie-qr-sheet__body">{body}</p> : null}
        <div className="shippie-qr-sheet__qr" dangerouslySetInnerHTML={{ __html: svg }} aria-hidden />
        <code className="shippie-qr-sheet__url">{url}</code>
        <div className="shippie-qr-sheet__actions">
          <button type="button" onClick={onCopy}>
            Copy link
          </button>
          <button type="button" onClick={onShare} className="primary">
            Share
          </button>
        </div>
        <button
          type="button"
          className="shippie-qr-sheet__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}
