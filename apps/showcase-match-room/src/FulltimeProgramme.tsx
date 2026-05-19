import type { KeepsakeTemplate } from '@shippie/showcase-kit-v2';

export interface PredictionStanding {
  peerInitials: string;
  accuracy: number; // 0..1
  totalVotes: number;
}

export interface FulltimeKeepsakeData {
  /** e.g. "match-001". Becomes part of the filename + the printed code. */
  fixtureCode: string;
  /** Fraunces title — "Mexico v South Africa" etc. */
  fixtureTitle: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  /** Top-5 predictions leaderboard. */
  leaderboard: ReadonlyArray<PredictionStanding>;
  /** Player-of-the-match winner; null if no MVP vote happened. */
  mvpName: string | null;
  /** Pinned + top-cheered shoutouts (max 3). */
  shoutouts: ReadonlyArray<string>;
  /** Peer signatures (initials). */
  signatures: ReadonlyArray<{ initials: string; color: string }>;
  /** Optional photos. If present and >= 2 a 3x2 mosaic is drawn; otherwise pitch-grid texture. */
  photos?: ReadonlyArray<string>;
}

/**
 * FulltimeProgramme — the full-time programme keepsake template.
 *
 * Pure canvas drawing. The KeepsakeRenderer hands us a 1080x1350 ctx;
 * we paint the fixture title (Fraunces 96px), final score in big mono
 * numerals, predictions leaderboard (top 5), MVP, three shoutouts, a
 * photo mosaic (only if guests added photos) or pitch-grid texture, the
 * italic-mono `match-room/<fixture-code>` footer, and peer signatures.
 *
 * No JSX — runs in any worker that has 2D canvas access. We render fonts
 * via `ctx.font` strings; the actual face is resolved by the browser at
 * draw time (Fraunces is already loaded via styles.css).
 */
export const FulltimeProgramme: KeepsakeTemplate<FulltimeKeepsakeData> = async (
  ctx,
  data,
  width,
  height,
) => {
  // Paper background with gold-leaf accent edge.
  ctx.fillStyle = '#FAF7EF';
  ctx.fillRect(0, 0, width, height);

  // Top pitch-green band.
  ctx.fillStyle = '#0E5C3A';
  ctx.fillRect(0, 0, width, 28);
  ctx.fillStyle = '#C9A24B';
  ctx.fillRect(0, 28, width, 4);

  // Eyebrow.
  ctx.fillStyle = '#5E584F';
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText('FULL-TIME PROGRAMME', 64, 96);

  // Fixture title — Fraunces 96px.
  ctx.fillStyle = '#171513';
  ctx.font = '700 96px Fraunces, Georgia, serif';
  wrapText(ctx, data.fixtureTitle, 64, 196, width - 128, 92);

  // Score — big mono.
  ctx.fillStyle = '#0E5C3A';
  ctx.font = '600 144px "JetBrains Mono", monospace';
  const scoreText = `${data.homeScore}  ·  ${data.awayScore}`;
  ctx.fillText(scoreText, 64, 460);

  // Photo mosaic or pitch-grid texture.
  const mosaicTop = 510;
  const mosaicHeight = 280;
  if (data.photos && data.photos.length >= 2) {
    await drawPhotoMosaic(ctx, data.photos, 64, mosaicTop, width - 128, mosaicHeight);
  } else {
    drawPitchGrid(ctx, 64, mosaicTop, width - 128, mosaicHeight);
  }

  // Predictions leaderboard.
  ctx.fillStyle = '#5E584F';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText('PREDICTIONS · TOP 5', 64, mosaicTop + mosaicHeight + 56);

  ctx.fillStyle = '#171513';
  ctx.font = '500 28px Fraunces, Georgia, serif';
  const leadStart = mosaicTop + mosaicHeight + 96;
  const slice = data.leaderboard.slice(0, 5);
  for (let i = 0; i < slice.length; i += 1) {
    const row = slice[i]!;
    const y = leadStart + i * 36;
    ctx.fillStyle = '#171513';
    ctx.font = '600 28px Fraunces, Georgia, serif';
    ctx.fillText(`${i + 1}. ${row.peerInitials}`, 64, y);
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#5E584F';
    ctx.fillText(
      `${Math.round(row.accuracy * 100)}% · ${row.totalVotes} votes`,
      280,
      y,
    );
  }

  // MVP winner.
  const mvpY = leadStart + slice.length * 36 + 56;
  if (data.mvpName) {
    ctx.fillStyle = '#5E584F';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText('PLAYER OF THE MATCH', 64, mvpY);
    ctx.fillStyle = '#0E5C3A';
    ctx.font = '700 44px Fraunces, Georgia, serif';
    ctx.fillText(data.mvpName, 64, mvpY + 56);
  }

  // Shoutouts — italic, top 3.
  const shoutY = mvpY + (data.mvpName ? 110 : 30);
  if (data.shoutouts.length > 0) {
    ctx.fillStyle = '#5E584F';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText('ROOM SHOUTS', 64, shoutY);
    ctx.fillStyle = '#171513';
    ctx.font = 'italic 500 24px Fraunces, Georgia, serif';
    let y = shoutY + 36;
    for (const shout of data.shoutouts.slice(0, 3)) {
      y = wrapText(ctx, `"${shout}"`, 64, y, width - 128, 30) + 12;
    }
  }

  // Peer signature dots row — bottom 96px.
  const sigY = height - 90;
  let sigX = 64;
  for (const sig of data.signatures.slice(0, 12)) {
    ctx.fillStyle = sig.color;
    ctx.beginPath();
    ctx.arc(sigX + 12, sigY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FAF7EF';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    const w = ctx.measureText(sig.initials).width;
    ctx.fillText(sig.initials, sigX + 12 - w / 2, sigY + 4);
    sigX += 36;
  }

  // Italic-mono footer code.
  ctx.fillStyle = '#99762A';
  ctx.font = 'italic 500 22px "JetBrains Mono", monospace';
  ctx.fillText(`match-room/${data.fixtureCode}`, 64, height - 32);
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let drawY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, drawY);
      line = word;
      drawY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, drawY);
  }
  return drawY;
}

function drawPitchGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.fillStyle = '#0E5C3A';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  const cols = 10;
  const step = w / cols;
  for (let i = 1; i < cols; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + i * step, y);
    ctx.lineTo(x + i * step, y + h);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

async function drawPhotoMosaic(
  ctx: CanvasRenderingContext2D,
  photos: ReadonlyArray<string>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const rows = 2;
  const cols = 3;
  const cellW = w / cols;
  const cellH = h / rows;
  const slots: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      slots.push({ x: x + c * cellW, y: y + r * cellH });
    }
  }
  await Promise.all(
    slots.map(async (slot, idx) => {
      const src = photos[idx % photos.length];
      if (!src) return;
      const img = await loadImage(src).catch(() => null);
      if (!img) {
        ctx.fillStyle = '#E3EFE8';
        ctx.fillRect(slot.x + 4, slot.y + 4, cellW - 8, cellH - 8);
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(slot.x + 4, slot.y + 4, cellW - 8, cellH - 8);
      ctx.clip();
      ctx.drawImage(img, slot.x + 4, slot.y + 4, cellW - 8, cellH - 8);
      ctx.restore();
    }),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e instanceof Error ? e : new Error('image load failed'));
    img.src = src;
  });
}
