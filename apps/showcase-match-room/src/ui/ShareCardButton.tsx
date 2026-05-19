import { useEffect, useMemo, useState } from 'react';
import { teamByCode } from '../data/tournament.ts';
import { createOpeningShareCardSvg, shareCardDataUrl } from '../lib/share-card.ts';
import type { UserProfile } from '../shared/local-store.ts';

export function ShareCardButton(props: { provenance: string; profile?: UserProfile; roomName?: string; prediction?: string; moment?: string }) {
  const [ready, setReady] = useState(false);
  const [shared, setShared] = useState(false);
  const [pngUrl, setPngUrl] = useState('');
  const shareTitle = 'Shippie Match Room';
  const shareText = props.prediction ?? `${props.profile?.displayName || 'I'} am in for Mexico v South Africa`;
  const receiptKind = shareReceiptKind(props.moment);
  const svg = useMemo(() => {
    const team = props.profile ? teamByCode(props.profile.primaryTeam) : null;
    return createOpeningShareCardSvg({
      roomName: props.roomName ?? 'Opening match room',
      prediction: props.prediction ?? `${props.profile?.displayName || 'I'} am in for Mexico v South Africa`,
      provenance: props.provenance,
      moment: props.moment,
      supporterName: props.profile?.displayName,
      teamCode: team?.code,
      teamName: team?.name,
      primaryColor: team?.swatch[0],
      secondaryColor: team?.swatch[1],
    });
  }, [props.moment, props.prediction, props.profile, props.provenance, props.roomName]);
  const href = useMemo(() => ready ? shareCardDataUrl(svg) : '', [ready, svg]);

  useEffect(() => {
    if (!ready) {
      setPngUrl('');
      return undefined;
    }
    let cancelled = false;
    let objectUrl = '';
    void svgToPngBlob(svg).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPngUrl(objectUrl);
    }).catch(() => setPngUrl(''));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ready, svg]);

  const share = async () => {
    try {
      const pngBlob = await svgToPngBlob(svg);
      const file = new File([pngBlob], 'shippie-match-room-card.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share) {
        const shareData: ShareData = {
          title: shareTitle,
          text: `${shareText} · no ads, no account.`,
          url: window.location.href,
        };
        if (nav.canShare?.({ files: [file] })) shareData.files = [file];
        await navigator.share(shareData);
      } else {
        await navigator.clipboard?.writeText(window.location.href);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // Share sheets can be cancelled; keep the generated card visible.
    }
  };

  if (ready) {
    return (
      <section className="share-card-studio" aria-label="Share card preview">
        <div className="share-card-copy">
          <span>{receiptKind.label}</span>
          <strong>Ready to send</strong>
          <p>{receiptKind.description}</p>
        </div>
        <div className="share-card-actions">
          <button className="primary-action" onClick={() => void share()}>{shared ? 'Shared' : 'Share room'}</button>
          <a className="share-card-link" href={pngUrl || href} download="shippie-match-room-card.png">
            Save image
          </a>
          <button onClick={() => setReady(false)}>Remake</button>
        </div>
        <div className="share-card-preview-frame">
          <img src={href} alt="Shippie Match Room share card preview" />
        </div>
      </section>
    );
  }

  return <button className="share-card-trigger" onClick={() => setReady(true)}>Make share card</button>;
}

function shareReceiptKind(moment?: string): { label: string; description: string } {
  const lower = (moment ?? '').toLowerCase();
  if (lower.includes('var')) {
    return { label: 'VAR call', description: 'Share the room decision with team colours and host-city paper.' };
  }
  if (lower.includes('trivia') || lower.includes('daily')) {
    return { label: 'Trivia card', description: 'Turn the daily quiz into a clean card for the chat.' };
  }
  if (lower.includes('score') || lower.includes('prediction')) {
    return { label: 'Prediction card', description: 'A match-ticket style card for picks and bragging rights.' };
  }
  return { label: 'Match card', description: 'Poster-style card with team colours, host-city paper, and the room link.' };
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const image = new Image();
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Share card image failed to load'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Share card canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => next ? resolve(next) : reject(new Error('Share card PNG failed')), 'image/png', 0.94);
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
