/**
 * Chiwit weekly-shape keepsake — 1080×1350 canvas template.
 *
 * Layout (§4.5):
 *   - mono eyebrow              "WEEK OF MAY 11 — MAY 17"
 *   - pulse-numeric hero        "68"
 *   - italic Fraunces line      "23 signals · 6 days · steady rhythm"
 *   - 5 factor bars             Foundations / Recovery / Movement / Mind / Body
 *   - 7-day pulse ribbon        height-mapped bars
 *   - italic-mono footer        `chiwit/wk-2026-20`
 *
 * The drawing is pure 2D canvas — no DOM, so the template runs in
 * jsdom/happy-dom for tests as long as a 2D context is available.
 *
 * Palette mirrors `styles.css` so the printed keepsake matches the
 * in-app surface.
 */
import type { KeepsakeTemplate } from '@shippie/showcase-kit-v2';

const PALETTE = {
  paper:    '#fbf6e8',
  bg:       '#f6f1e3',
  ink:      '#1f2a24',
  inkSoft:  '#3f4a44',
  muted:    '#6b7670',
  sage:     '#4a7a5e',
  sageDeep: '#2f5640',
  sageSoft: '#d6e3d8',
  coral:    '#d96a3c',
  line:     'rgba(31, 42, 36, 0.18)',
};

const FONT_DISPLAY = 'Fraunces, "Iowan Old Style", Georgia, serif';
const FONT_MONO    = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

export interface WeekShapeData {
  /** ISO date of the Sunday → Saturday week, used to seed the code line. */
  weekStartISO: string;        // e.g. "2026-05-11"
  weekLabel: string;           // e.g. "WEEK OF MAY 11 — MAY 17"
  pulseNumeric: number;        // 0-100, hero number
  italicSummary: string;       // e.g. "23 signals · 6 days · steady rhythm"
  factors: Array<{ label: string; value: number }>;  // expect 5 entries
  ribbon: Array<{ date: string; value: number }>;    // expect 7 entries
  footerCode: string;          // e.g. "chiwit/wk-2026-20"
}

const W = 1080;
const H = 1350;

/**
 * Paint the keepsake. The function is `void`-returning (no async work)
 * so the test can call it synchronously without a microtask cycle.
 */
export const WeeklyShape: KeepsakeTemplate<WeekShapeData> = (ctx, data, width, height) => {
  const w = width  ?? W;
  const h = height ?? H;

  // Background — paper warm cream with the field-notes horizontal rule.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0,    PALETTE.paper);
  grad.addColorStop(0.6,  PALETTE.bg);
  grad.addColorStop(1,    '#ede5cf');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Horizontal hairlines every 64px for the journal feel.
  ctx.strokeStyle = 'rgba(31, 42, 36, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 64; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const padding = 88;
  let cursorY = padding + 24;

  // 1. Mono eyebrow — WEEK OF MAY 11 — MAY 17
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 22px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const eyebrowText = data.weekLabel.toUpperCase();
  // Letter-space the eyebrow by hand for the mono-caps look.
  drawTrackedText(ctx, eyebrowText, padding, cursorY, 0.16);
  cursorY += 56;

  // 2. Hero pulse number — pulse-numeric.size-hero, sage-deep.
  ctx.fillStyle = PALETTE.sageDeep;
  ctx.font = `700 240px ${FONT_MONO}`;
  ctx.textBaseline = 'top';
  const pulseText = String(Math.max(0, Math.min(100, Math.round(data.pulseNumeric))));
  ctx.fillText(pulseText, padding, cursorY);
  // tiny "Daily Pulse" tag to the right of the number
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 20px ${FONT_MONO}`;
  drawTrackedText(ctx, 'DAILY PULSE', padding + pulseHeroWidth(ctx, pulseText) + 28, cursorY + 30, 0.18);
  cursorY += 250;

  // 3. Italic Fraunces line — pull-quote with sage left-rule.
  ctx.fillStyle = PALETTE.sage;
  ctx.fillRect(padding, cursorY + 6, 4, 48);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `italic 500 38px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'top';
  ctx.fillText(data.italicSummary, padding + 20, cursorY + 4);
  cursorY += 96;

  // 4. Five factor bars (Foundations / Recovery / Movement / Mind / Body)
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 18px ${FONT_MONO}`;
  drawTrackedText(ctx, 'FACTORS', padding, cursorY, 0.18);
  cursorY += 36;

  const factorsToDraw = data.factors.slice(0, 5);
  const barRowHeight = 56;
  const labelColumn = 240;
  const trackStartX = padding + labelColumn;
  const trackWidth  = w - padding - trackStartX;

  for (const factor of factorsToDraw) {
    // Label (Fraunces)
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `600 24px ${FONT_DISPLAY}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(factor.label, padding, cursorY + barRowHeight / 2);

    // Track background
    const trackY = cursorY + barRowHeight / 2 - 8;
    ctx.fillStyle = PALETTE.sageSoft;
    roundRect(ctx, trackStartX, trackY, trackWidth, 16, 8);
    ctx.fill();

    // Sage fill — proportional to value (0-100)
    const v = Math.max(0, Math.min(100, factor.value));
    const fillWidth = Math.max(16, (trackWidth * v) / 100);
    ctx.fillStyle = PALETTE.sage;
    roundRect(ctx, trackStartX, trackY, fillWidth, 16, 8);
    ctx.fill();

    // Numeric value at right
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 18px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(v)), w - padding, cursorY + barRowHeight / 2);
    ctx.textAlign = 'left';

    cursorY += barRowHeight;
  }
  cursorY += 32;

  // 5. 7-day pulse ribbon — height-mapped bars
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `600 18px ${FONT_MONO}`;
  drawTrackedText(ctx, '7-DAY SHAPE', padding, cursorY, 0.18);
  cursorY += 32;

  const ribbon = data.ribbon.slice(0, 7);
  const ribbonHeight = 200;
  const ribbonWidth  = w - padding * 2;
  const gap          = 14;
  const barWidth     = (ribbonWidth - gap * (Math.max(1, ribbon.length) - 1)) / Math.max(1, ribbon.length);
  const ribbonBaseY  = cursorY + ribbonHeight;

  for (let i = 0; i < ribbon.length; i++) {
    const bar = ribbon[i]!;
    const v = Math.max(0, Math.min(100, bar.value));
    const barH = Math.max(18, (ribbonHeight * v) / 100);
    const x = padding + i * (barWidth + gap);
    const y = ribbonBaseY - barH;

    // sage-soft cap, sage body, coral top-cap on the highest bar
    ctx.fillStyle = PALETTE.sage;
    roundRect(ctx, x, y, barWidth, barH, 6);
    ctx.fill();

    // day initial under the bar
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 14px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const dayInit = dayInitialFromISO(bar.date);
    ctx.fillText(dayInit, x + barWidth / 2, ribbonBaseY + 10);
  }
  cursorY = ribbonBaseY + 50;

  // 6. Footer — italic-mono code, bottom-left.
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `italic 600 22px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(data.footerCode, padding, h - padding + 40);

  // Brand mark at right — small, calm.
  ctx.fillStyle = PALETTE.sage;
  ctx.font = `italic 600 22px ${FONT_DISPLAY}`;
  ctx.textAlign = 'right';
  ctx.fillText('Chiwit · Daily Pulse', w - padding, h - padding + 40);
};

/**
 * Pixel-tracked text — canvas has no native letter-spacing API so we
 * walk the string and offset per character. `track` is letter-spacing
 * in em (e.g. 0.16 ≈ Tailwind tracking-widest).
 */
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  track: number,
): void {
  // Best-effort font-size parse; falls back to 16 if the regex doesn't
  // catch a numeric component (e.g. shorthand "small").
  const sizeMatch = /([0-9.]+)px/.exec(ctx.font);
  const size = sizeMatch ? Number(sizeMatch[1]) : 16;
  const extra = size * track;
  let cursorX = x;
  for (const ch of text) {
    ctx.fillText(ch, cursorX, y);
    cursorX += ctx.measureText(ch).width + extra;
  }
}

function pulseHeroWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const prev = ctx.font;
  ctx.font = `700 240px ${FONT_MONO}`;
  const m = ctx.measureText(text);
  ctx.font = prev;
  return m.width;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function dayInitialFromISO(iso: string): string {
  // ISO date `YYYY-MM-DD` → weekday initial.
  // Build a noon-local Date so timezone math doesn't drift the weekday.
  try {
    const d = new Date(`${iso}T12:00:00`);
    const initial = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()] ?? '·';
    return initial;
  } catch {
    return '·';
  }
}

/* ------------------------------------------------------------------ *
 *  Data adapter — derives a `WeekShapeData` from Chiwit state.       *
 *  Kept here so App.tsx stays focused on UI flow.                    *
 * ------------------------------------------------------------------ */

export interface WeekDay {
  date: string;
  pulse: number;
  signalCount: number;
}

export function buildWeekShape(input: {
  days: WeekDay[];             // 7 entries, oldest → newest
  factors: Array<{ label: string; value: number }>;
  signalCount: number;
  weekStartISO: string;
  weekEndISO: string;
  pulseAverage: number;
}): WeekShapeData {
  const dayCount = input.days.filter((d) => d.signalCount > 0).length;
  const tone =
    input.pulseAverage >= 75 ? 'open' :
    input.pulseAverage >= 60 ? 'steady' :
    input.pulseAverage >= 45 ? 'gentle' :
    'quiet';
  const summary = `${input.signalCount} signals · ${dayCount} days · ${tone} rhythm`;

  return {
    weekStartISO: input.weekStartISO,
    weekLabel: formatWeekLabel(input.weekStartISO, input.weekEndISO),
    pulseNumeric: Math.round(input.pulseAverage),
    italicSummary: summary,
    factors: input.factors,
    ribbon: input.days.map((d) => ({ date: d.date, value: d.pulse })),
    footerCode: `chiwit/wk-${isoWeekCode(input.weekStartISO)}`,
  };
}

function formatWeekLabel(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T12:00:00`);
  const end   = new Date(`${endISO}T12:00:00`);
  const month = (d: Date) => d.toLocaleString(undefined, { month: 'short' }).toUpperCase();
  if (start.getMonth() === end.getMonth()) {
    return `WEEK OF ${month(start)} ${start.getDate()} — ${end.getDate()}`;
  }
  return `WEEK OF ${month(start)} ${start.getDate()} — ${month(end)} ${end.getDate()}`;
}

/** ISO 8601 week code → "YYYY-WW" (used in the keepsake footer + filename). */
export function isoWeekCode(startISO: string): string {
  const d = new Date(`${startISO}T12:00:00`);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return `${target.getFullYear()}-${String(week).padStart(2, '0')}`;
}
