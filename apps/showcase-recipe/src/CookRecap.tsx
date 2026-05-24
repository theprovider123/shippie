/**
 * Cook-recap keepsake (spec §5.5).
 *
 * Triggered after CookMode completes. Renders a 1080×1350 canvas card
 * with the recipe photo (or a generated cooking-orange tile), the
 * scaled-quantity ingredients the user actually cooked with, the cook
 * duration, and the user's own notes for THIS cook. The kit's
 * KeepsakeRenderer wraps it as a `KeepsakeTemplate` and exports as
 * PNG + PDF.
 *
 * Filename convention (per spec): `palate-{slug}-cook-{YYYYMMDD-HHMMSS}.pdf`
 */
import { useEffect, useMemo, useState } from 'react';
import {
  KeepsakeRenderer,
  type KeepsakeTemplate,
} from '@shippie/showcase-kit-v2';

export interface CookRecapData {
  title: string;
  slug: string;
  cuisine: string;
  servingsCooked: number;
  durationMinutes: number;
  cookCount: number;
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  notes: string;
  photoDataUrl?: string | null;
}

/** Slugify a title for the filename: kebab-case, ascii-only. */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'recipe'
  );
}

export function formatCookTimestamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
}

export function cookRecapFilename(data: CookRecapData, now: Date = new Date()): string {
  return `palate-${slugifyTitle(data.slug || data.title)}-cook-${formatCookTimestamp(now)}.pdf`;
}

/**
 * KeepsakeTemplate — pure canvas drawing, returns void/Promise.
 * Photo loads asynchronously when supplied; the rest of the layout is
 * synchronous so failure to load the photo doesn't block the export.
 */
export const cookRecapTemplate: KeepsakeTemplate<CookRecapData> = async (ctx, data, width, height) => {
  // Background — sage-tile + cream paper, mirroring the app palette.
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#fff9ef');
  bg.addColorStop(0.55, '#f4e4c1');
  bg.addColorStop(1, '#dce8df');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Sage tile grid (subtle, kitchen-tile atmosphere).
  ctx.fillStyle = 'rgba(143, 160, 112, 0.08)';
  for (let x = 0; x < width; x += 88) ctx.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += 88) ctx.fillRect(0, y, width, 1);

  // Hero photo or fallback tile (top third).
  const heroHeight = Math.round(height * 0.42);
  if (data.photoDataUrl) {
    try {
      const img = await loadImage(data.photoDataUrl);
      const ratio = img.width / Math.max(img.height, 1);
      const targetRatio = width / heroHeight;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (ratio > targetRatio) {
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / targetRatio;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, heroHeight);
    } catch {
      drawHeroFallback(ctx, width, heroHeight);
    }
  } else {
    drawHeroFallback(ctx, width, heroHeight);
  }

  // Cuisine badge — programme-style chip top-right of hero.
  ctx.fillStyle = 'rgba(244, 228, 193, 0.95)';
  const badge = data.cuisine.toUpperCase();
  ctx.font = "600 22px 'JetBrains Mono', monospace";
  const badgePadX = 22;
  const badgeMetrics = ctx.measureText(badge);
  const badgeWidth = badgeMetrics.width + badgePadX * 2;
  ctx.fillRect(width - badgeWidth - 40, 40, badgeWidth, 44);
  ctx.fillStyle = '#5d6e48';
  ctx.fillText(badge, width - badgeWidth - 40 + badgePadX, 70);

  // Title block.
  const padX = 64;
  let y = heroHeight + 72;
  ctx.fillStyle = '#6e5e4e';
  ctx.font = "600 22px 'JetBrains Mono', monospace";
  ctx.fillText(`COOK #${data.cookCount}`, padX, y);
  y += 18;

  ctx.fillStyle = '#2c2118';
  ctx.font = "700 64px 'Fraunces', Georgia, serif";
  y += 48;
  wrapText(ctx, data.title, padX, y, width - padX * 2, 60);
  y += titleLineHeight(ctx, data.title, width - padX * 2, 60) + 32;

  // Duration · serves row (mono).
  ctx.fillStyle = '#5d6e48';
  ctx.font = "italic 500 28px 'JetBrains Mono', monospace";
  ctx.fillText(`${data.durationMinutes} min · serves ${data.servingsCooked}`, padX, y);
  y += 56;

  // Ingredients column.
  ctx.fillStyle = '#2c2118';
  ctx.font = "600 24px 'JetBrains Mono', monospace";
  ctx.fillText('INGREDIENTS', padX, y);
  y += 36;
  ctx.font = "500 22px Inter, sans-serif";
  const maxIngredients = 9;
  const visible = data.ingredients.slice(0, maxIngredients);
  for (const ing of visible) {
    ctx.fillStyle = '#a84e0d';
    ctx.font = "700 22px 'JetBrains Mono', monospace";
    const qty = `${formatQuantity(ing.quantity)} ${ing.unit}`;
    ctx.fillText(qty, padX, y);
    ctx.fillStyle = '#2c2118';
    ctx.font = "500 22px Inter, sans-serif";
    ctx.fillText(ing.name, padX + 180, y);
    y += 30;
  }
  if (data.ingredients.length > maxIngredients) {
    ctx.fillStyle = '#6e5e4e';
    ctx.font = "italic 500 18px 'Fraunces', Georgia, serif";
    ctx.fillText(`+${data.ingredients.length - maxIngredients} more`, padX, y);
    y += 24;
  }

  // Notes from this cook.
  if (data.notes.trim()) {
    y += 24;
    ctx.fillStyle = 'rgba(143, 160, 112, 0.18)';
    const notesHeight = 140;
    ctx.fillRect(padX - 16, y - 28, width - (padX - 16) * 2, notesHeight);
    ctx.fillStyle = '#2c2118';
    ctx.font = "italic 500 22px 'Fraunces', Georgia, serif";
    wrapText(ctx, data.notes.trim(), padX, y, width - padX * 2, 28);
    y += notesHeight - 28;
  }

  // Footer: italic-mono code.
  ctx.fillStyle = '#5d6e48';
  ctx.font = "italic 500 18px 'JetBrains Mono', monospace";
  ctx.fillText(`palate/${slugifyTitle(data.slug || data.title)}/v${data.cookCount}`, padX, height - 56);
};

function drawHeroFallback(ctx: CanvasRenderingContext2D, width: number, heroHeight: number) {
  const grad = ctx.createLinearGradient(0, 0, width, heroHeight);
  grad.addColorStop(0, '#d86918');
  grad.addColorStop(1, '#a84e0d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, heroHeight);
  ctx.fillStyle = 'rgba(244, 228, 193, 0.25)';
  for (let r = 80; r < heroHeight; r += 80) {
    ctx.beginPath();
    ctx.arc(width / 2, heroHeight / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === Math.floor(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

function titleLineHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 1;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines += 1;
      line = word;
    } else {
      line = trial;
    }
  }
  return lines * lineHeight;
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

/**
 * Composite component shown at CookMode complete. Prompts the user for
 * notes, then mounts the KeepsakeRenderer with the chosen filename.
 */
export function CookRecapSheet({
  data,
  onClose,
  onCookAgain,
}: {
  data: Omit<CookRecapData, 'notes'>;
  onClose: () => void;
  onCookAgain?: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [sharedAt, setSharedAt] = useState<number | null>(null);
  const filename = useMemo(() => cookRecapFilename({ ...data, notes }), [data, notes]);

  // Auto-close 8s after a successful share.
  useEffect(() => {
    if (sharedAt == null) return;
    const id = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(id);
  }, [sharedAt, onClose]);

  const fullData: CookRecapData = { ...data, notes };
  return (
    <div className="cook-recap-overlay" role="dialog" aria-label="Cook recap">
      <div className="cook-recap-sheet">
        <div className="cook-recap-hero">
          {data.photoDataUrl ? (
            <img src={data.photoDataUrl} alt="" />
          ) : (
            <div className="cook-recap-hero-fallback" aria-hidden>
              {data.title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="cook-recap-cuisine">{data.cuisine.toUpperCase()}</span>
          <span className="cook-recap-cook-count">v{data.cookCount}</span>
        </div>
        <header className="cook-recap-header">
          <p className="eyebrow">Cooked</p>
          <h2 className="cook-recap-title">{data.title}</h2>
          <p className="cook-recap-meta">
            <span className="cook-recap-meta-time">{data.durationMinutes}</span>
            <span className="cook-recap-meta-unit">min</span>
            <span className="cook-recap-meta-sep">·</span>
            <span className="cook-recap-meta-time">{data.servingsCooked}</span>
            <span className="cook-recap-meta-unit">serves</span>
          </p>
        </header>
        <div className="cook-recap-grid">
          <section className="cook-recap-ingredients">
            <p className="eyebrow">Ingredients</p>
            <ul>
              {data.ingredients.slice(0, 8).map((ing, idx) => (
                <li key={`${ing.name}-${idx}`}>
                  <span className="cook-recap-qty">{formatQuantity(ing.quantity)} {ing.unit}</span>
                  <span className="cook-recap-ing-name">{ing.name}</span>
                </li>
              ))}
              {data.ingredients.length > 8 ? (
                <li className="cook-recap-ing-more">+{data.ingredients.length - 8} more</li>
              ) : null}
            </ul>
          </section>
        </div>
        <label className="cook-recap-notes">
          <span>Add your notes to this cook</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What worked, what to change next time…"
            rows={4}
          />
        </label>
        <div className="cook-recap-actions">
          <KeepsakeRenderer
            template={cookRecapTemplate}
            data={fullData}
            filename={filename}
            onShared={(ok) => {
              if (ok) setSharedAt(Date.now());
            }}
            trigger={(open, busy) => (
              <button
                type="button"
                className="primary"
                onClick={open}
                disabled={busy}
              >
                {busy ? 'Saving keepsake…' : 'Save as keepsake'}
              </button>
            )}
          />
          {onCookAgain ? (
            <button type="button" onClick={onCookAgain}>Cook again</button>
          ) : null}
          <button type="button" onClick={onClose}>Skip</button>
        </div>
        {sharedAt ? (
          <p className="cook-recap-saved" role="status">Saved. This sheet will close shortly.</p>
        ) : null}
      </div>
    </div>
  );
}
