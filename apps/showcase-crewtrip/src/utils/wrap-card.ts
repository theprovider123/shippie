import type { CrewtripState, CrewAward, Memory } from '../types';
import type { ThemePalette } from '../data/themes';

interface WrapCardOptions {
  state: CrewtripState;
  palette: ThemePalette;
  awards: CrewAward[];
  memories: Memory[];
  coverUrl: string | null;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350; // 4:5, friendly to instagram-style sharing

/**
 * Generate a shareable wrap image as a Blob (PNG). Drawn entirely in
 * canvas — no DOM-to-image dependency. The art direction:
 * - Sun-paper backdrop in the active palette
 * - Hero band at the top: cover photo (if any) with the trip name overlaid
 * - Three top-memory polaroids in a slight cascade
 * - Crew row at the bottom with avatar dots
 * - Footer: shippie.app/run/crewtrip
 */
export async function generateWrapCard(options: WrapCardOptions): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { state, palette } = options;
  const paper = palette.vars['--paper'] ?? '#F8F1E0';
  const paperWarm = palette.vars['--paper-warm'] ?? '#F4E5C9';
  const ink = palette.vars['--ink'] ?? '#2A1F16';
  const inkSoft = palette.vars['--ink-soft'] ?? '#4E3D2C';
  const accent = palette.vars['--accent'] ?? '#C8643A';
  const gold = palette.vars['--gold'] ?? '#D7A55A';

  // Backdrop — warm wash with a sun-halo radial.
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const halo = ctx.createRadialGradient(CARD_WIDTH * 0.18, 80, 40, CARD_WIDTH * 0.5, -120, 1100);
  halo.addColorStop(0, hexToRgba(gold, 0.32));
  halo.addColorStop(1, hexToRgba(gold, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Hero band — 4:3 ratio at the top.
  const heroY = 60;
  const heroH = 540;
  const heroX = 60;
  const heroW = CARD_WIDTH - 120;
  drawRoundedRect(ctx, heroX, heroY, heroW, heroH, 28);
  ctx.fillStyle = paperWarm;
  ctx.fill();

  if (options.coverUrl) {
    try {
      const img = await loadImage(options.coverUrl);
      ctx.save();
      drawRoundedRect(ctx, heroX, heroY, heroW, heroH, 28);
      ctx.clip();
      drawCover(ctx, img, heroX, heroY, heroW, heroH);
      // Bottom shade so the overlaid text reads.
      const shade = ctx.createLinearGradient(0, heroY + heroH * 0.4, 0, heroY + heroH);
      shade.addColorStop(0, 'rgba(20, 12, 6, 0.05)');
      shade.addColorStop(1, 'rgba(20, 12, 6, 0.78)');
      ctx.fillStyle = shade;
      ctx.fillRect(heroX, heroY, heroW, heroH);
      ctx.restore();
    } catch {
      // Fall through to the empty paperWarm hero.
    }
  }

  // "WRAPPED" eyebrow.
  ctx.fillStyle = options.coverUrl ? gold : accent;
  ctx.font = '600 28px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('CREWTRIP · WRAPPED', heroX + 36, heroY + heroH - 130);

  // Trip name — Fraunces in canvas (falls back to Georgia where Fraunces missing).
  const tripName = state.eventName || 'Crewtrip';
  ctx.fillStyle = options.coverUrl ? '#FFFFFF' : ink;
  ctx.font = '600 84px "Fraunces", "Iowan Old Style", Georgia, serif';
  ctx.textAlign = 'left';
  drawWrappedText(ctx, tripName, heroX + 36, heroY + heroH - 60, heroW - 72, 84);

  // Stats strip below the hero.
  const statsY = heroY + heroH + 40;
  const memoryCount = state.memories.length;
  const crewCount = state.players.length;
  const totalScore = state.players.reduce((sum, p) => sum + p.score, 0);
  ctx.font = '600 24px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
  ctx.fillStyle = inkSoft;
  ctx.textAlign = 'left';
  const statsText = `${crewCount} CREW · ${memoryCount} MEMORIES · ${totalScore} POINTS`;
  ctx.fillText(statsText, heroX + 12, statsY);

  // Top award.
  const topAward = options.awards[0];
  if (topAward) {
    const awardY = statsY + 60;
    drawRoundedRect(ctx, heroX, awardY, heroW, 130, 22);
    ctx.fillStyle = hexToRgba(gold, 0.28);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = '600 22px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
    ctx.fillText('TOP CREW', heroX + 28, awardY + 36);

    ctx.fillStyle = ink;
    ctx.font = '600 44px "Fraunces", "Iowan Old Style", Georgia, serif';
    ctx.fillText(topAward.name, heroX + 28, awardY + 78);

    ctx.fillStyle = inkSoft;
    ctx.font = '500 24px "Inter", system-ui, sans-serif';
    ctx.fillText(topAward.title, heroX + 28, awardY + 110);
  }

  // Memories grid — three polaroids in a cascade.
  const memoryY = topAward ? statsY + 230 : statsY + 80;
  const featured = options.memories.slice(0, 3);
  const polaroidW = 280;
  const polaroidH = 340;
  const polaroidGap = 20;
  const totalPolaroidW = polaroidW * 3 + polaroidGap * 2;
  const polaroidStartX = (CARD_WIDTH - totalPolaroidW) / 2;

  for (let i = 0; i < featured.length; i++) {
    const memory = featured[i]!;
    const x = polaroidStartX + i * (polaroidW + polaroidGap);
    const angle = (i - 1) * 0.04; // slight cascade
    ctx.save();
    ctx.translate(x + polaroidW / 2, memoryY + polaroidH / 2);
    ctx.rotate(angle);
    ctx.translate(-polaroidW / 2, -polaroidH / 2);

    // Shadow
    ctx.shadowColor = 'rgba(20, 12, 6, 0.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;

    drawRoundedRect(ctx, 0, 0, polaroidW, polaroidH, 8);
    ctx.fillStyle = '#FFFCF4';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Image area
    drawRoundedRect(ctx, 14, 14, polaroidW - 28, 220, 4);
    ctx.fillStyle = paperWarm;
    ctx.fill();

    if (memory.mediaDataUrl && (memory.kind === 'image')) {
      try {
        const img = await loadImage(memory.mediaDataUrl);
        ctx.save();
        drawRoundedRect(ctx, 14, 14, polaroidW - 28, 220, 4);
        ctx.clip();
        drawCover(ctx, img, 14, 14, polaroidW - 28, 220);
        ctx.restore();
      } catch {
        // ignore
      }
    } else {
      // Text-only memory — show the quote inside the photo area.
      ctx.fillStyle = ink;
      ctx.font = 'italic 500 22px "Fraunces", "Iowan Old Style", Georgia, serif';
      ctx.textAlign = 'center';
      drawWrappedText(ctx, `"${memory.text}"`, polaroidW / 2, 90, polaroidW - 60, 26);
      ctx.textAlign = 'left';
    }

    // Caption (memory.author)
    ctx.fillStyle = inkSoft;
    ctx.font = '500 18px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`— ${memory.author}`, polaroidW / 2, polaroidH - 32);
    ctx.textAlign = 'left';

    ctx.restore();
  }

  // Footer
  ctx.fillStyle = inkSoft;
  ctx.font = '500 20px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`shippie.app/run/crewtrip · ${state.eventCode}`, CARD_WIDTH / 2, CARD_HEIGHT - 50);
  ctx.textAlign = 'left';

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.94);
  });
}

export async function shareWrapCard(blob: Blob, state: CrewtripState): Promise<'shared' | 'downloaded' | 'error'> {
  const fileName = `${(state.eventName || 'crewtrip').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-wrap.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: state.eventName || 'Crewtrip wrapped' });
      return 'shared';
    } catch {
      // Fall through to download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const targetRatio = w / h;
  const sourceRatio = img.naturalWidth / img.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (sourceRatio > targetRatio) {
    sw = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / targetRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = last.length > 1 ? last.slice(0, -1) + '…' : last;
  }
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, x, y + i * lineHeight);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function hexToRgba(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return trimmed;
}
