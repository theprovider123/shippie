// The viral artifact: a screenshot-worthy share card of your World Cup call.
// Pure Canvas2D, offline. Styled like the back page of a sports paper — pitch
// green, chalk type, Barlow Condensed for the shout, Source Code Pro for the
// data, ruled lines not boxes. No glows. (Your Call design system.)

import qrcode from "qrcode-generator";
import { maybeTeam, type Team } from "../data/teams";
import { championOf } from "./bracket";
import type { Prediction, Profile } from "./types";

/** Where every share card points — scan to play. */
const APP_URL = "https://shippie.app/run/golazo";

// ── Palette ──────────────────────────────────────────────────────────────────
const PITCH = "#0d1f0f";
const MUD = "#2a1f12";
const CHALK = "#f5f0e8";
const LIME = "#b8ff4e";
const AMBER = "#f5a623";
const RED = "#e8272a";
const GOLD = "#f0c040";
const MUTED = "rgba(245,240,232,0.45)";
const BORDER = "rgba(245,240,232,0.16)";

const DISP = `900 1px "Barlow Condensed", "Arial Narrow", sans-serif`; // weight/size overwritten per call
const SERIF = `italic 400 1px "Libre Baskerville", Georgia, serif`;
const MONO = `700 1px "Source Code Pro", ui-monospace, monospace`;
const disp = (w: number, s: number) => `${w} ${s}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const serif = (s: number) => `italic 400 ${s}px "Libre Baskerville", Georgia, serif`;
const mono = (s: number, w = 700) => `${w} ${s}px "Source Code Pro", ui-monospace, monospace`;
void DISP; void SERIF; void MONO;

/** The headline picks pulled out of a full call, for the My Call card. */
export interface CallHighlights {
  champ: Team | null;
  runnerUp: Team | null;
  outsideBet: Team | null;
  goldenBoot: Team | null;
  spicy: string;
}

/** Derive the screenshot-worthy highlights from a prediction. Pure + offline. */
export function callHighlights(pred: Prediction): CallHighlights {
  const champ = maybeTeam(championOf(pred));
  const f = [pred.knockout["SF-0"], pred.knockout["SF-1"]];
  const runnerUpId = f.find((id) => id && id !== champ?.id) ?? null;
  const runnerUp = maybeTeam(runnerUpId);
  const semis = ["QF-0", "QF-1", "QF-2", "QF-3"]
    .map((s) => maybeTeam(pred.knockout[s]))
    .filter((t): t is Team => Boolean(t));
  const bolter = semis.slice().sort((a, b) => b.seed - a.seed)[0] ?? null;
  const outsideBet = maybeTeam(pred.outsideBet) ?? bolter;
  const goldenBoot = maybeTeam(pred.topScorer);
  return { champ, runnerUp, outsideBet, goldenBoot, spicy: spicyTake(pred, champ) };
}

function spicyTake(pred: Prediction, champ: Team | null): string {
  const picked = new Set(Object.values(pred.knockout));
  const engOut = !picked.has("ENG") && hasTeam(pred, "ENG");
  if (champ?.id === "ENG") return "England to actually win it. Brave. Wrong, probably.";
  if (engOut) return "England will bottle it in the quarters. They always do.";
  if (champ && champ.seed > 8) return `${champ.name} lifting it. Bold. I'll take the glory.`;
  if (champ) return `${champ.name} all day. Screenshot this.`;
  return "Tips in. No going back now.";
}

function hasTeam(pred: Prediction, id: string): boolean {
  return (
    Object.values(pred.groups).some((g) => g?.includes(id)) ||
    Object.values(pred.knockout).includes(id)
  );
}

export type CardFormat = "story" | "og";
const SIZES: Record<CardFormat, [number, number]> = {
  story: [1080, 1920],
  og: [1200, 630],
};

// ── Canvas helpers ─────────────────────────────────────────────────────────
function rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, thick = 2, color = BORDER) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thick);
}
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, base: number, weight = 900): number {
  let size = base;
  ctx.font = disp(weight, size);
  while (ctx.measureText(text).width > max && size > 24) {
    size -= 4;
    ctx.font = disp(weight, size);
  }
  return size;
}
function paper(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = PITCH;
  ctx.fillRect(0, 0, W, H);
  // faint grain so the green reads like fabric, not flat hex
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = i % 2 ? CHALK : "#000";
    ctx.fillRect(Math.floor((i * 9301 + 49297) % W), Math.floor((i * 233280) % H), 1, 1);
  }
  ctx.globalAlpha = 1;
}
/** Draw a crisp QR (pitch modules on a chalk chip) at x,y of the given size. */
function drawQR(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = Math.round(size * 0.08);
  const inner = size - quiet * 2;
  const cell = inner / n;
  // chalk chip background (the "sticker")
  ctx.fillStyle = CHALK;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = PITCH;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(x + quiet + Math.floor(c * cell), y + quiet + Math.floor(r * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}

const FOOTER_H = 150; // bottom band reserved for the footer + QR

function footerStrip(ctx: CanvasRenderingContext2D, W: number, H: number, pad: number, accent: string) {
  const y = H - FOOTER_H;
  rule(ctx, pad, y, W - pad * 2, 2, BORDER);
  const qrSize = 104;
  drawQR(ctx, APP_URL, W - pad - qrSize, y + 24, qrSize);
  // left block — wordmark + scan prompt
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = disp(800, 30);
  ctx.fillText("YOUR CALL", pad, y + 56);
  ctx.fillStyle = MUTED;
  ctx.font = disp(600, 24);
  tracked(ctx, "WORLD CUP 2026", pad, y + 92, 2);
  // scan prompt next to the QR
  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = disp(700, 22);
  tracked2(ctx, "SCAN TO PLAY", W - pad - qrSize - 16, y + 70, 2);
}

// right-aligned tracked text
function tracked2(ctx: CanvasRenderingContext2D, text: string, rightX: number, y: number, ls: number) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + ls;
  let cx = rightX - w;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; }
}

// Spread tracking for that newspaper-headline feel (Canvas has no letter-spacing).
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ls: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
  return cx - ls;
}

// ── Card 1: MY CALL — newspaper back page ────────────────────────────────────
export function drawCard(canvas: HTMLCanvasElement, prediction: Prediction, profile: Profile, format: CardFormat = "story"): void {
  const [W, H] = SIZES[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const h = callHighlights(prediction);
  const champ = h.champ;
  paper(ctx, W, H);

  if (format === "og") {
    const pad = 64;
    ctx.textAlign = "left";
    ctx.fillStyle = LIME;
    ctx.font = disp(700, 26);
    tracked(ctx, "YOUR CALL · WORLD CUP 2026", pad, 96, 3);
    ctx.fillStyle = CHALK;
    ctx.font = disp(900, 150);
    ctx.fillText("MY CALL", pad, 250);
    ctx.font = disp(700, 30);
    ctx.fillStyle = MUTED;
    ctx.fillText("MY WINNER", pad, 330);
    const sz = fitText(ctx, (champ ? champ.name : "TBD").toUpperCase(), W - pad * 2 - 220, 130);
    ctx.fillStyle = CHALK;
    ctx.font = disp(900, sz);
    ctx.fillText((champ ? champ.name : "TBD").toUpperCase(), pad, 470);
    ctx.textAlign = "right";
    ctx.font = `200px "Barlow Condensed", sans-serif`;
    ctx.fillText(champ ? champ.flag : "🏆", W - pad, 440);
    footerStrip(ctx, W, H, pad, LIME);
    return;
  }

  const pad = 72;
  // Masthead
  rule(ctx, pad, 88, W - pad * 2, 4, CHALK);
  ctx.textAlign = "left";
  ctx.fillStyle = LIME;
  ctx.font = disp(700, 30);
  tracked(ctx, "YOUR CALL · WORLD CUP 2026", pad, 150, 4);

  // MY CALL headline
  ctx.fillStyle = CHALK;
  ctx.font = disp(900, 200);
  ctx.fillText("MY CALL", pad - 4, 340);
  rule(ctx, pad, 380, W - pad * 2, 2, BORDER);

  // Winner hero
  ctx.fillStyle = MUTED;
  ctx.font = disp(700, 30);
  tracked(ctx, "MY WINNER", pad, 460, 4);
  ctx.font = `150px "Barlow Condensed", sans-serif`;
  ctx.fillText(champ ? champ.flag : "🏆", pad, 640);
  const wname = (champ ? champ.name : "TBD").toUpperCase();
  const wsz = fitText(ctx, wname, W - pad * 2 - 200, 150);
  ctx.fillStyle = CHALK;
  ctx.font = disp(900, wsz);
  ctx.fillText(wname, pad + 180, 615);
  ctx.fillStyle = LIME;
  ctx.fillRect(pad + 180, 650, 220, 8);

  // 2×2 ruled grid of secondary picks
  const gx = pad, gy = 740, gw = W - pad * 2, gh = 300;
  const midX = gx + gw / 2, midY = gy + gh / 2;
  rule(ctx, gx, gy, gw, 2, BORDER);
  rule(ctx, gx, gy + gh, gw, 2, BORDER);
  ctx.fillStyle = BORDER;
  ctx.fillRect(midX, gy, 2, gh);
  ctx.fillRect(gx, midY, gw, 2);
  const cells: [string, Team | null, string][] = [
    ["OUTSIDE BET", h.outsideBet, LIME],
    ["GOLDEN BOOT", h.goldenBoot, CHALK],
    ["RUNNERS-UP", h.runnerUp, CHALK],
    ["MY FINAL", champ, CHALK],
  ];
  cells.forEach(([label, t, accent], i) => {
    const cx = gx + (i % 2) * (gw / 2) + 28;
    const cy = gy + Math.floor(i / 2) * (gh / 2);
    ctx.textAlign = "left";
    ctx.fillStyle = i === 0 ? LIME : MUTED;
    ctx.font = disp(600, 24);
    tracked(ctx, label, cx, cy + 52, 3);
    ctx.fillStyle = CHALK;
    ctx.font = disp(800, 56);
    if (i === 3) {
      const fin = `${champ?.short ?? "TBD"} v ${h.runnerUp?.short ?? "TBD"}`;
      ctx.fillText(fin, cx, cy + 120);
    } else {
      ctx.font = `48px "Barlow Condensed", sans-serif`;
      ctx.fillText(t?.flag ?? "—", cx, cy + 120);
      ctx.fillStyle = accent;
      ctx.font = disp(800, 56);
      ctx.fillText(t?.short ?? "—", cx + 78, cy + 118);
    }
  });

  // HOT TAKE — double-ruled sidebar, Baskerville italic
  const sx = pad, sy = 1130, sw = W - pad * 2;
  rule(ctx, sx, sy, sw, 2, AMBER);
  rule(ctx, sx, sy + 8, sw, 2, "rgba(245,166,35,0.45)");
  ctx.fillStyle = AMBER;
  ctx.font = disp(800, 24);
  tracked(ctx, "HOT TAKE", sx + 4, sy + 60, 3);
  ctx.fillStyle = CHALK;
  ctx.font = serif(40);
  wrapText(ctx, `"${h.spicy}"`, sx + 4, sy + 130, sw - 8, 56, 3);

  // Locked-by + footer
  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = disp(700, 28);
  tracked(ctx, `LOCKED BY ${(profile.name || "ME").toUpperCase()}`, pad, H - FOOTER_H - 28, 3);
  footerStrip(ctx, W, H, pad, LIME);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(" ");
  let line = "", ly = y, lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines++;
      if (lines === maxLines) { ctx.fillText(`${line}…`, x, ly); return; }
      ctx.fillText(line, x, ly); ly += lineH; line = words[i];
    } else line = test;
  }
  ctx.fillText(line, x, ly);
}

// ── Card 2: THE RECEIPTS — tabloid splash ────────────────────────────────────
export interface ReceiptsSide { short: string; flag: string; score: number; }
export interface ReceiptsRow { pos: number; initial: string; name: string; pts: number; tag?: string; you?: boolean; tone?: "you" | "good" | "bad"; }
export interface ReceiptsCard {
  matchLabel: string;
  home?: ReceiptsSide;
  away?: ReceiptsSide;
  headline?: string;
  rows: ReceiptsRow[];
  callout: string;
  groupName: string;
  players: number;
}

export function drawReceiptsCard(canvas: HTMLCanvasElement, c: ReceiptsCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pad = 72;
  paper(ctx, W, H);

  rule(ctx, pad, 88, W - pad * 2, 4, CHALK);
  ctx.textAlign = "left";
  ctx.fillStyle = RED;
  ctx.font = disp(700, 28);
  tracked(ctx, c.matchLabel.toUpperCase(), pad, 146, 3);

  // Score line, huge, Source Code Pro
  if (c.home && c.away) {
    ctx.textAlign = "center";
    ctx.font = `120px "Barlow Condensed", sans-serif`;
    ctx.fillText(c.home.flag, W * 0.24, 300);
    ctx.fillText(c.away.flag, W * 0.76, 300);
    ctx.fillStyle = CHALK;
    ctx.font = mono(150);
    ctx.fillText(`${c.home.score}–${c.away.score}`, W / 2, 300);
    ctx.fillStyle = MUTED;
    ctx.font = disp(700, 28);
    ctx.fillText(c.home.short.toUpperCase(), W * 0.24, 360);
    ctx.fillText(c.away.short.toUpperCase(), W * 0.76, 360);
    ctx.fillStyle = LIME;
    ctx.font = disp(700, 24);
    ctx.fillText("FULL TIME", W / 2, 360);
  } else {
    ctx.fillStyle = CHALK;
    ctx.font = disp(900, 110);
    ctx.fillText("THE RECEIPTS", pad, 290);
  }
  ctx.textAlign = "left";
  rule(ctx, pad, 400, W - pad * 2, 2, BORDER);

  // Pool table (top 5)
  const rows = c.rows.slice(0, 5);
  const ty = 430, rh = 96;
  const medals = [GOLD, "#c0c0c0", "#cd7f32"];
  rows.forEach((r, i) => {
    const ry = ty + i * rh;
    if (r.you) { ctx.fillStyle = "rgba(184,255,78,0.06)"; ctx.fillRect(pad, ry, W - pad * 2, rh); }
    ctx.textAlign = "left";
    ctx.fillStyle = i < 3 ? medals[i] : MUTED;
    ctx.font = disp(900, 52);
    ctx.fillText(String(r.pos).padStart(2, "0"), pad, ry + 64);
    ctx.fillStyle = CHALK;
    ctx.font = disp(800, 46);
    const nameUp = r.name.toUpperCase();
    ctx.fillText(nameUp, pad + 110, ry + 62);
    if (r.tag) {
      const col = r.tone === "bad" ? RED : r.tone === "good" ? LIME : MUTED;
      const nameW = ctx.measureText(nameUp).width;
      ctx.font = disp(800, 22);
      const tw = ctx.measureText(r.tag.toUpperCase()).width;
      const tx = pad + 110 + nameW + 28;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.strokeRect(tx, ry + 28, tw + 22, 40);
      ctx.fillStyle = col;
      ctx.fillText(r.tag.toUpperCase(), tx + 11, ry + 56);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = r.tone === "bad" ? RED : CHALK;
    ctx.font = mono(44);
    ctx.fillText(String(r.pts), W - pad, ry + 60);
    ctx.textAlign = "left";
    rule(ctx, pad, ry + rh, W - pad * 2, 1, BORDER);
  });

  // The callout — back-page headline, stacked, filling the bottom third
  const cy = Math.max(ty + rows.length * rh + 110, 1180);
  ctx.fillStyle = CHALK;
  const words = c.callout.toUpperCase().replace(/[""]/g, "").split(" ");
  // greedy-wrap into big lines
  let line = "", ly = cy;
  const maxW = W - pad * 2;
  ctx.font = disp(900, 96);
  const lh = 98;
  for (let i = 0; i < words.length && ly < H - FOOTER_H - 40; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, pad, ly); ly += lh; line = words[i]; }
    else line = test;
  }
  if (line && ly < H - FOOTER_H - 10) ctx.fillText(line, pad, ly);

  footerStrip(ctx, W, H, pad, RED);
}
export async function receiptsCardBlob(c: ReceiptsCard): Promise<Blob | null> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  drawReceiptsCard(canvas, c);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

// ── Card 3: OUTSIDE BET — match-programme cover ──────────────────────────────
export interface OutsideBetCard { teamId: string; qualifier: string; pctCalled: number; oneIn: number; bonus: number; playerName: string; }

export function drawOutsideBetCard(canvas: HTMLCanvasElement, c: OutsideBetCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const t = maybeTeam(c.teamId);
  paper(ctx, W, H);

  // Flag fills the top two-thirds on a mud field
  const flagH = Math.round(H * 0.56);
  ctx.fillStyle = MUD;
  ctx.fillRect(0, 0, W, flagH);
  ctx.textAlign = "center";
  ctx.font = `${Math.round(flagH * 0.62)}px "Barlow Condensed", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(t ? t.flag : "🐴", W / 2, flagH / 2);
  ctx.textBaseline = "alphabetic";

  // Eyebrow + believer sticker
  ctx.textAlign = "left";
  ctx.fillStyle = AMBER;
  ctx.font = disp(800, 30);
  tracked(ctx, "OUTSIDE BET", 72, 120, 4);
  // sticker, rotated
  ctx.save();
  ctx.translate(W - 250, 150);
  ctx.rotate(0.05);
  ctx.fillStyle = AMBER;
  ctx.fillRect(0, 0, 200, 56);
  ctx.fillStyle = PITCH;
  ctx.font = disp(800, 26);
  ctx.fillText(`1 IN ${c.oneIn} BELIEVE`, 14, 38);
  ctx.restore();

  // Name bar — bleeds across the middle, chalk rules top & bottom
  const nbY = flagH;
  rule(ctx, 0, nbY, W, 4, CHALK);
  const name = (t ? t.name : "—").toUpperCase();
  ctx.fillStyle = CHALK;
  const nsz = fitText(ctx, name, W - 144, 130);
  ctx.font = disp(900, nsz);
  ctx.textAlign = "center";
  ctx.fillText(name, W / 2, nbY + 130);
  rule(ctx, 0, nbY + 170, W, 4, CHALK);

  // Qualifier
  ctx.fillStyle = MUTED;
  ctx.font = disp(600, 30);
  ctx.fillText(c.qualifier.toUpperCase(), W / 2, nbY + 230);

  // Stat bar — dark, Source Code Pro (sits just under the qualifier)
  const sbY = nbY + 300;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, sbY, W, 150);
  const stats: [string, string, string][] = [
    ["CALLED IT", `${c.pctCalled}%`, AMBER],
    ["BONUS", `+${c.bonus}`, LIME],
    ["BRAVE?", "VERY", CHALK],
  ];
  stats.forEach(([l, v, col], i) => {
    const x = W * (0.2 + i * 0.3);
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.font = disp(600, 24);
    ctx.fillText(l, x, sbY + 56);
    ctx.fillStyle = col;
    ctx.font = mono(44);
    ctx.fillText(v, x, sbY + 110);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = CHALK;
  ctx.font = serif(38);
  ctx.fillText(`"${c.playerName || "I"} saw it coming."`, 72, sbY + 230);
  footerStrip(ctx, W, H, 72, AMBER);
}
export async function outsideBetCardBlob(c: OutsideBetCard): Promise<Blob | null> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  drawOutsideBetCard(canvas, c);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

// ── Sweepstake draw card ─────────────────────────────────────────────────────
export interface SweepCard { playerName: string; teamId: string; sweepName: string; pot?: number; currency?: string; }
export function drawSweepCard(canvas: HTMLCanvasElement, c: SweepCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const t = maybeTeam(c.teamId);
  paper(ctx, W, H);
  const pad = 72;
  rule(ctx, pad, 88, W - pad * 2, 4, CHALK);
  ctx.textAlign = "left"; ctx.fillStyle = LIME; ctx.font = disp(700, 30);
  tracked(ctx, `${c.sweepName.toUpperCase()} · YOUR CALL`, pad, 150, 3);

  ctx.textAlign = "center";
  ctx.fillStyle = MUTED; ctx.font = disp(800, 40);
  ctx.fillText("I GOT", W / 2, 460);
  ctx.font = `300px "Barlow Condensed", sans-serif`;
  ctx.fillStyle = CHALK;
  ctx.fillText(t ? t.flag : "🎲", W / 2, 820);
  const nm = (t ? t.name : "—").toUpperCase();
  const nsz = fitText(ctx, nm, W - pad * 2, 150);
  ctx.font = disp(900, nsz);
  ctx.fillText(nm, W / 2, 980);
  ctx.fillStyle = LIME; ctx.fillRect(W / 2 - 110, 1015, 220, 8);

  if (c.pot) {
    ctx.fillStyle = GOLD; ctx.font = disp(900, 60);
    ctx.fillText(`${c.currency ?? "£"}${c.pot} · WINNER TAKES ALL`, W / 2, 1180);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = CHALK; ctx.font = serif(40);
  wrapText(ctx, `"Come on you ${t ? t.short : "lot"}. Don't let me down."`, pad, 1360, W - pad * 2, 54, 2);
  footerStrip(ctx, W, H, pad, LIME);
}
export async function sweepCardBlob(c: SweepCard): Promise<Blob | null> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  drawSweepCard(canvas, c);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

// ── Arcade game result card ──────────────────────────────────────────────────
export interface GameCard { emoji: string; game: string; score: number; unit: string; playerName: string; sub?: string; }
export function drawGameCard(canvas: HTMLCanvasElement, c: GameCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paper(ctx, W, H);
  const pad = 72;
  rule(ctx, pad, 88, W - pad * 2, 4, CHALK);
  ctx.textAlign = "left"; ctx.fillStyle = LIME; ctx.font = disp(700, 30);
  tracked(ctx, `${c.game.toUpperCase()} · YOUR CALL`, pad, 150, 3);

  ctx.textAlign = "center";
  ctx.font = `260px "Barlow Condensed", sans-serif`;
  ctx.fillStyle = CHALK;
  ctx.fillText(c.emoji, W / 2, 560);
  ctx.fillStyle = LIME; ctx.font = mono(280);
  ctx.fillText(String(c.score), W / 2, 920);
  ctx.fillStyle = CHALK; ctx.font = disp(800, 64);
  ctx.fillText(c.unit.toUpperCase(), W / 2, 1010);
  if (c.sub) {
    ctx.fillStyle = MUTED; ctx.font = disp(600, 40);
    ctx.fillText(c.sub.toUpperCase(), W / 2, 1090);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = CHALK; ctx.font = serif(40);
  wrapText(ctx, `"${c.playerName || "I"} reckons that's beatable. Prove it."`, pad, 1320, W - pad * 2, 54, 2);
  footerStrip(ctx, W, H, pad, LIME);
}
export async function gameCardBlob(c: GameCard): Promise<Blob | null> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  drawGameCard(canvas, c);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

// ── Group of Death results card ──────────────────────────────────────────────
export interface GodCard { playerName: string; score: number; moments: { q: string; a: string }[]; }

export function drawGodCard(canvas: HTMLCanvasElement, c: GodCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pad = 72;
  paper(ctx, W, H);
  rule(ctx, pad, 88, W - pad * 2, 4, "#e8272a");
  ctx.textAlign = "left"; ctx.fillStyle = "#e8272a"; ctx.font = disp(700, 30);
  tracked(ctx, "GROUP OF DEATH", pad, 150, 4);

  // big score
  ctx.fillStyle = LIME; ctx.font = mono(180);
  ctx.fillText(String(c.score), pad, 320);
  ctx.fillStyle = CHALK; ctx.font = disp(800, 56);
  ctx.fillText("CAPS", pad + 6, 380);
  rule(ctx, pad, 412, W - pad * 2, 2, BORDER);

  // moments nailed
  ctx.fillStyle = MUTED; ctx.font = disp(700, 26);
  tracked(ctx, c.moments.length ? "MOMENTS YOU NAILED" : "NO MOMENTS THIS RUN — GO AGAIN", pad, 470, 3);
  const rows = c.moments.slice(0, 9);
  let ry = 510;
  for (const m of rows) {
    if (ry > H - FOOTER_H - 70) break;
    ctx.fillStyle = LIME; ctx.font = disp(800, 30);
    ctx.fillText("✓", pad, ry + 34);
    ctx.fillStyle = CHALK; ctx.font = disp(700, 34);
    const a = m.a.toUpperCase();
    ctx.fillText(a, pad + 44, ry + 34);
    ctx.fillStyle = MUTED; ctx.font = serif(22);
    const q = m.q.length > 40 ? m.q.slice(0, 39) + "…" : m.q;
    ctx.fillText(q, pad + 44, ry + 64);
    rule(ctx, pad, ry + 86, W - pad * 2, 1, BORDER);
    ry += 104;
  }

  ctx.textAlign = "left"; ctx.fillStyle = MUTED; ctx.font = disp(700, 26);
  tracked(ctx, `${(c.playerName || "ME").toUpperCase()} · BEAT THIS`, pad, H - FOOTER_H - 24, 3);
  footerStrip(ctx, W, H, pad, "#e8272a");
}

export async function godCardBlob(c: GodCard): Promise<Blob | null> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  drawGodCard(canvas, c);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

export async function cardBlob(prediction: Prediction, profile: Profile, format: CardFormat = "story"): Promise<Blob | null> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  drawCard(canvas, prediction, profile, format);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.95));
}

/** Pitch-green accent so the rest of the UI can theme to your pick. */
export function accentFor(_prediction: Prediction): [string, string] {
  return [LIME, GOLD];
}

/** Make sure the self-hosted fonts are ready before painting to canvas. */
async function ensureFonts(): Promise<void> {
  try {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!f) return;
    await Promise.all([
      f.load(`900 100px "Barlow Condensed"`),
      f.load(`700 100px "Barlow Condensed"`),
      f.load(`600 40px "Barlow Condensed"`),
      f.load(`italic 400 40px "Libre Baskerville"`),
      f.load(`700 60px "Source Code Pro"`),
    ]);
    await f.ready;
  } catch {
    /* fonts will fall back to the stack */
  }
}
