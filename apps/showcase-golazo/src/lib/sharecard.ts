// The viral artifact: a gorgeous, screenshot-worthy card of your World Cup call.
// Pure Canvas2D so it works offline and needs no fonts beyond the system stack.

import { maybeTeam, team, type Team } from "../data/teams";
import { championOf } from "./bracket";
import type { Prediction, Profile } from "./types";

// ── Golazo brand accents (the share-card identity stays Golazo green) ──────────
const G1 = "#16f08b"; // brand green
const G2 = "#58f0a8"; // light green
const GOLD = "#ffd34d";

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
  // Semifinalists = the four quarter-final winners; the weakest-seeded is a real bolter.
  const semis = ["QF-0", "QF-1", "QF-2", "QF-3"]
    .map((s) => maybeTeam(pred.knockout[s]))
    .filter((t): t is Team => Boolean(t));
  const bolter = semis.slice().sort((a, b) => b.seed - a.seed)[0] ?? null;
  const outsideBet = maybeTeam(pred.outsideBet) ?? bolter;
  const goldenBoot = maybeTeam(pred.topScorer);

  return { champ, runnerUp, outsideBet, goldenBoot, spicy: spicyTake(pred, champ) };
}

/** A dry one-liner that fits the call. Specific where it can be, stock otherwise. */
function spicyTake(pred: Prediction, champ: Team | null): string {
  const picked = new Set(Object.values(pred.knockout));
  const engOut = !picked.has("ENG") && hasTeam(pred, "ENG");
  if (champ?.id === "ENG") return "England to actually win it. Brave. Wrong, probably.";
  if (engOut) return "England to bottle it before the final. Again. Sorry not sorry.";
  if (champ && champ.seed > 8) return `${champ.name} lifting it. Bold. I'll take the glory.`;
  if (champ) return `${champ.name} all day. Screenshot this.`;
  return "Locked it in. No takebacks. Prove me wrong.";
}

function hasTeam(pred: Prediction, id: string): boolean {
  return (
    Object.values(pred.groups).some((g) => g?.includes(id)) ||
    Object.values(pred.knockout).includes(id)
  );
}

export type CardFormat = "story" | "og";

const SIZES: Record<CardFormat, [number, number]> = {
  story: [1080, 1920], // Instagram / WhatsApp status
  og: [1200, 630], // link unfurls
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const FONT = `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

export function drawCard(
  canvas: HTMLCanvasElement,
  prediction: Prediction,
  profile: Profile,
  format: CardFormat = "story",
): void {
  const [W, H] = SIZES[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const champId = championOf(prediction);
  const champ = maybeTeam(champId);
  const accent = champ ? champ.colors[0] : "#10b981";
  const accent2 = champ ? champ.colors[1] : "#34d399";

  // — Background: deep stadium night with a champion-tinted glow —
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#070b16");
  bg.addColorStop(1, "#0d1426");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(
    W / 2,
    H * 0.42,
    0,
    W / 2,
    H * 0.42,
    W * 0.85,
  );
  glow.addColorStop(0, hexA(accent, format === "og" ? 0.28 : 0.34));
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // subtle pitch lines
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const y = (H / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const isStory = format === "story";
  const pad = isStory ? 90 : 56;

  // — Wordmark —
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${isStory ? 60 : 40}px ${FONT}`;
  ctx.fillText("GOLAZO", pad, isStory ? 150 : 84);
  ctx.fillStyle = accent2;
  ctx.font = `700 ${isStory ? 28 : 20}px ${FONT}`;
  ctx.fillText("· 2026 WORLD CUP CALL", pad + (isStory ? 245 : 165), isStory ? 150 : 84);

  const h = callHighlights(prediction);

  if (isStory) {
    // — "MY WINNER IS" + champion hero (left flag, big name, trophy) —
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText("MY WINNER IS", pad, 300);

    ctx.font = `130px ${FONT}`;
    ctx.fillText(champ ? champ.flag : "🏆", pad, 460);
    const nm = (champ ? champ.name : "TBD").toUpperCase();
    const nameSize = nm.length > 9 ? 78 : 100;
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${nameSize}px ${FONT}`;
    ctx.fillText(nm, pad + 170, 440);
    ctx.textAlign = "right";
    ctx.font = `90px ${FONT}`;
    ctx.fillText("🏆", W - pad, 450);

    // accent underline under the name
    ctx.fillStyle = G1;
    roundRect(ctx, pad + 170, 480, 200, 10, 5);
    ctx.fill();

    // — 2×2 picks grid —
    const gap = 26;
    const cellW = (W - pad * 2 - gap) / 2;
    const cellH = 210;
    const gx2 = pad + cellW + gap;
    const gy = 600;
    const gy2 = gy + cellH + gap;
    drawPickCell(ctx, pad, gy, cellW, cellH, "Outside Bet", {
      flag: h.outsideBet?.flag,
      value: h.outsideBet?.short ?? "—",
      hot: true,
    });
    drawPickCell(ctx, gx2, gy, cellW, cellH, "Golden Boot", {
      flag: h.goldenBoot?.flag,
      value: h.goldenBoot?.short ?? "—",
    });
    drawPickCell(ctx, pad, gy2, cellW, cellH, "Runner-up", {
      flag: h.runnerUp?.flag,
      value: h.runnerUp?.short ?? "—",
    });
    drawPickCell(ctx, gx2, gy2, cellW, cellH, "My Final", {
      value: `${champ?.short ?? "TBD"} v ${h.runnerUp?.short ?? "TBD"}`,
    });

    // — Spicy take band —
    const sy = gy2 + cellH + 50;
    const sh = 210;
    ctx.fillStyle = hexA(GOLD, 0.07);
    roundRect(ctx, pad, sy, W - pad * 2, sh, 28);
    ctx.fill();
    ctx.strokeStyle = hexA(GOLD, 0.25);
    ctx.lineWidth = 2;
    roundRect(ctx, pad, sy, W - pad * 2, sh, 28);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.font = `60px ${FONT}`;
    ctx.fillText("🔥", pad + 36, sy + 88);
    ctx.fillStyle = GOLD;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText("SPICY TAKE", pad + 120, sy + 60);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `600 38px ${FONT}`;
    wrapText(ctx, h.spicy, pad + 120, sy + 110, W - pad * 2 - 150, 48, 2);

    // — Footer: locked by + url —
    const fy = H - 200;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, fy);
    ctx.lineTo(W - pad, fy);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 38px ${FONT}`;
    ctx.fillText("Locked by ", pad, fy + 70);
    const lw = ctx.measureText("Locked by ").width;
    ctx.fillStyle = "#fff";
    ctx.font = `800 38px ${FONT}`;
    ctx.fillText(profile.name || "Me", pad + lw, fy + 70);
    ctx.textAlign = "right";
    ctx.fillStyle = G1;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText("shippie.app/run/golazo", W - pad, fy + 70);
  } else {
    // — OG layout: champion on the right, copy on the left —
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText("MY WINNER", pad, 200);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText((champ ? champ.name : "TBD").toUpperCase(), pad, 290);
    ctx.fillStyle = accent2;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText("Prove me wrong → shippie.app/run/golazo", pad, 380);
    ctx.font = `200px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(champ ? champ.flag : "🏆", W - pad, 360);
  }
}

/** A pick cell for the My Call grid: label + (optional flag) + value, rounded box. */
function drawPickCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  hgt: number,
  label: string,
  opts: { flag?: string; value: string; hot?: boolean },
): void {
  ctx.fillStyle = opts.hot ? hexA(G1, 0.07) : "rgba(255,255,255,0.05)";
  roundRect(ctx, x, y, w, hgt, 24);
  ctx.fill();
  ctx.strokeStyle = opts.hot ? hexA(G1, 0.35) : "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, hgt, 24);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = opts.hot ? G2 : "rgba(255,255,255,0.5)";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(label.toUpperCase(), x + 30, y + 60);

  let vx = x + 30;
  if (opts.flag) {
    ctx.font = `56px ${FONT}`;
    ctx.fillText(opts.flag, x + 30, y + 145);
    vx = x + 110;
  }
  ctx.fillStyle = "#ffffff";
  const big = opts.value.length > 10 ? 40 : 50;
  ctx.font = `800 ${big}px ${FONT}`;
  ctx.fillText(opts.value, vx, y + 138);

  if (opts.hot) {
    ctx.textAlign = "right";
    ctx.font = `40px ${FONT}`;
    ctx.fillText("🌶️", x + w - 26, y + 58);
    ctx.textAlign = "left";
  }
}

/** Word-wrap helper for canvas text: draws up to `maxLines`, ellipsising overflow. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number,
): void {
  const words = text.split(" ");
  let line = "";
  let ly = y;
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines++;
      if (lines === maxLines) {
        ctx.fillText(`${line}…`, x, ly);
        return;
      }
      ctx.fillText(line, x, ly);
      ly += lineH;
      line = words[i];
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, ly);
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export interface SweepCard {
  playerName: string;
  teamId: string;
  sweepName: string;
  pot?: number;
  currency?: string;
}

/** The viral artifact for a sweepstake draw: "I drew Brazil". Story format. */
export function drawSweepCard(canvas: HTMLCanvasElement, c: SweepCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const t = maybeTeam(c.teamId);
  const accent = t ? t.colors[0] : "#10b981";
  const accent2 = t ? t.colors[1] : "#34d399";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#070b16"); bg.addColorStop(1, "#0d1426");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.85);
  glow.addColorStop(0, hexA(accent, 0.36)); glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.045)"; ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) { const y = (H / 6) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const pad = 90;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff"; ctx.font = `800 60px ${FONT}`;
  ctx.fillText("GOLAZO", pad, 150);
  ctx.fillStyle = accent2; ctx.font = `700 26px ${FONT}`;
  ctx.fillText("· SWEEPSTAKE", pad + 245, 150);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = `700 38px ${FONT}`;
  ctx.fillText("I DREW", W / 2, 420);
  ctx.font = `320px ${FONT}`;
  ctx.fillText(t ? t.flag : "🎲", W / 2, 760);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${t && t.name.length > 11 ? 96 : 124}px ${FONT}`;
  ctx.fillText((t ? t.name : "—").toUpperCase(), W / 2, 980);
  ctx.fillStyle = accent2;
  roundRect(ctx, W / 2 - 110, 1015, 220, 10, 5); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `700 40px ${FONT}`;
  ctx.fillText(c.sweepName.toUpperCase(), W / 2, 1200);
  if (c.pot) {
    ctx.fillStyle = "#ffd34d"; ctx.font = `900 64px ${FONT}`;
    ctx.fillText(`${c.currency ?? "£"}${c.pot} POT · WINNER TAKES ALL`, W / 2, 1300);
  }

  const cardY = 1480;
  ctx.fillStyle = "rgba(255,255,255,0.05)"; roundRect(ctx, pad, cardY, W - pad * 2, 280, 36); ctx.fill();
  ctx.strokeStyle = hexA(accent2, 0.5); ctx.lineWidth = 3; roundRect(ctx, pad, cardY, W - pad * 2, 280, 36); ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = `800 52px ${FONT}`;
  ctx.fillText(c.playerName || "Me", W / 2, cardY + 100);
  ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.font = `600 36px ${FONT}`;
  ctx.fillText("Come on you " + (t ? t.short : "lot") + "!", W / 2, cardY + 160);
  ctx.fillStyle = accent2; ctx.font = `800 40px ${FONT}`;
  ctx.fillText("shippie.app/run/golazo", W / 2, cardY + 230);
}

export async function sweepCardBlob(c: SweepCard): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawSweepCard(canvas, c);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
}

export interface GameCard {
  emoji: string;
  game: string;
  score: number;
  unit: string;
  playerName: string;
  /** Optional subtitle, e.g. a duel result "beat Mo 4–3". */
  sub?: string;
}

/** Viral artifact for a game result: "47 KICK-UPS — beat me". Story format. */
export function drawGameCard(canvas: HTMLCanvasElement, c: GameCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const accent = "#16f08b", accent2 = "#58f0a8";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#06121f"); bg.addColorStop(1, "#0a1c14");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.85);
  glow.addColorStop(0, hexA(accent, 0.32)); glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.045)"; ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) { const y = (H / 6) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const pad = 90;
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff"; ctx.font = `800 60px ${FONT}`;
  ctx.fillText("GOLAZO", pad, 150);
  ctx.fillStyle = accent2; ctx.font = `700 26px ${FONT}`;
  ctx.fillText("· ARCADE", pad + 245, 150);

  ctx.textAlign = "center";
  ctx.font = `300px ${FONT}`;
  ctx.fillText(c.emoji, W / 2, 560);
  ctx.fillStyle = "#fff"; ctx.font = `900 200px ${FONT}`;
  ctx.fillText(String(c.score), W / 2, 850);
  ctx.fillStyle = accent2; ctx.font = `800 56px ${FONT}`;
  ctx.fillText(c.unit.toUpperCase(), W / 2, 930);
  ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `700 44px ${FONT}`;
  ctx.fillText(c.game + (c.sub ? ` · ${c.sub}` : ""), W / 2, 1080);

  const cardY = 1480;
  ctx.fillStyle = "rgba(255,255,255,0.05)"; roundRect(ctx, pad, cardY, W - pad * 2, 280, 36); ctx.fill();
  ctx.strokeStyle = hexA(accent2, 0.5); ctx.lineWidth = 3; roundRect(ctx, pad, cardY, W - pad * 2, 280, 36); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `800 52px ${FONT}`;
  ctx.fillText(c.playerName || "Me", W / 2, cardY + 100);
  ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.font = `600 36px ${FONT}`;
  ctx.fillText("Think you can beat that?", W / 2, cardY + 160);
  ctx.fillStyle = accent2; ctx.font = `800 40px ${FONT}`;
  ctx.fillText("shippie.app/run/golazo", W / 2, cardY + 230);
}

export async function gameCardBlob(c: GameCard): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawGameCard(canvas, c);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
}

export async function cardBlob(
  prediction: Prediction,
  profile: Profile,
  format: CardFormat = "story",
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawCard(canvas, prediction, profile, format);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 0.95);
  });
}

// ── Card 2: The Receipts (result + pool table + most-wrong callout) ───────────

export interface ReceiptsSide {
  short: string;
  flag: string;
  score: number;
}
export interface ReceiptsRow {
  pos: number;
  initial: string;
  name: string;
  pts: number;
  /** Short tag shown on the row, e.g. "YOU", "Called it", "Bottled It 💀". */
  tag?: string;
  you?: boolean;
  /** Tag colour intent. */
  tone?: "you" | "good" | "bad";
}
export interface ReceiptsCard {
  matchLabel: string; // "GROUP G · MATCH WEEK 1"
  /** A concrete result, when there is one. Omit for a standings-only headline. */
  home?: ReceiptsSide;
  away?: ReceiptsSide;
  /** Headline shown when there's no single match (pool-level receipts). */
  headline?: string;
  rows: ReceiptsRow[];
  callout: string; // the receipts banner line
  groupName: string; // "The Lads"
  players: number;
}

function cardBackdrop(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  glowA: string,
  glowB?: string,
): void {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#06121f");
  bg.addColorStop(1, "#0a1c14");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, W * 0.7);
  g1.addColorStop(0, glowA);
  g1.addColorStop(1, "transparent");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  if (glowB) {
    const g2 = ctx.createRadialGradient(W * 0.1, H * 0.9, 0, W * 0.1, H * 0.9, W * 0.6);
    g2.addColorStop(0, glowB);
    g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const y = (H / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function cardEyebrow(ctx: CanvasRenderingContext2D, pad: number, meta: string): void {
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 60px ${FONT}`;
  ctx.fillText("GOLAZO", pad, 150);
  ctx.fillStyle = G2;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(`· ${meta}`, pad + 245, 150);
}

/** The Receipts: a result + your lot's table + a named callout of the most-wrong. */
export function drawReceiptsCard(canvas: HTMLCanvasElement, c: ReceiptsCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pad = 90;

  cardBackdrop(ctx, W, H, hexA("#ff3b30", 0.1), hexA(G1, 0.07));
  cardEyebrow(ctx, pad, c.matchLabel.toUpperCase());

  // — Match score box (or a standings headline when there's no single match) —
  const mY = 220;
  const mH = 280;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, pad, mY, W - pad * 2, mH, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, pad, mY, W - pad * 2, mH, 28);
  ctx.stroke();
  ctx.textAlign = "center";
  const cyMid = mY + 130;
  if (c.home && c.away) {
    // home
    ctx.font = `110px ${FONT}`;
    ctx.fillText(c.home.flag, W * 0.27, cyMid);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(c.home.short.toUpperCase(), W * 0.27, cyMid + 90);
    // away
    ctx.font = `110px ${FONT}`;
    ctx.fillText(c.away.flag, W * 0.73, cyMid);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(c.away.short.toUpperCase(), W * 0.73, cyMid + 90);
    // score
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 96px ${FONT}`;
    ctx.fillText(`${c.home.score}–${c.away.score}`, W / 2, cyMid + 10);
    ctx.fillStyle = G1;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText("FULL TIME", W / 2, cyMid + 80);
  } else {
    ctx.font = `90px ${FONT}`;
    ctx.fillText("🧾", W / 2, cyMid - 10);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText("THE RECEIPTS", W / 2, cyMid + 80);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(c.headline ?? "The table doesn't lie.", W / 2, cyMid + 140);
  }

  // — Pool table —
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(`${c.groupName.toUpperCase()} · YOUR LOT`, pad, mY + mH + 80);

  const tableY = mY + mH + 110;
  const rowH = 108;
  const rows = c.rows.slice(0, 5);
  const medals = ["#ffd700", "#c0c0c0", "#cd7f32"];
  rows.forEach((r, i) => {
    const ry = tableY + i * rowH;
    if (r.you) {
      ctx.fillStyle = hexA(G1, 0.08);
      roundRect(ctx, pad, ry, W - pad * 2, rowH - 12, 18);
      ctx.fill();
    }
    // position
    ctx.textAlign = "center";
    ctx.fillStyle = i < 3 ? medals[i] : "rgba(255,255,255,0.4)";
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText(String(r.pos), pad + 40, ry + 62);
    // avatar
    ctx.fillStyle = r.you ? hexA(G1, 0.18) : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(pad + 130, ry + 46, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = r.you ? G1 : "rgba(255,255,255,0.8)";
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(r.initial.toUpperCase(), pad + 130, ry + 58);
    // name
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${r.you ? 800 : 600} 40px ${FONT}`;
    ctx.fillText(r.name, pad + 190, ry + 58);
    // tag
    if (r.tag) {
      const tone =
        r.tone === "bad" ? "#ff3b30" : r.tone === "good" ? G1 : G2;
      ctx.font = `700 24px ${FONT}`;
      const tw = ctx.measureText(r.tag.toUpperCase()).width + 36;
      ctx.fillStyle = hexA(tone, 0.14);
      roundRect(ctx, pad + 190 + ctx.measureText(r.name).width + 24, ry + 24, tw, 44, 10);
      ctx.fill();
      ctx.fillStyle = tone;
      ctx.fillText(
        r.tag.toUpperCase(),
        pad + 190 + ctx.measureText(r.name).width + 42,
        ry + 54,
      );
    }
    // points
    ctx.textAlign = "right";
    ctx.fillStyle = r.tone === "bad" ? "#ff3b30" : "#ffffff";
    ctx.font = `900 48px ${FONT}`;
    ctx.fillText(String(r.pts), W - pad - 70, ry + 58);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText("pts", W - pad - 20, ry + 56);
  });

  // — Receipts banner —
  const bY = tableY + rows.length * rowH + 30;
  const bH = 200;
  ctx.fillStyle = hexA("#ff3b30", 0.1);
  roundRect(ctx, pad, bY, W - pad * 2, bH, 28);
  ctx.fill();
  ctx.strokeStyle = hexA("#ff3b30", 0.22);
  ctx.lineWidth = 2;
  roundRect(ctx, pad, bY, W - pad * 2, bH, 28);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = `60px ${FONT}`;
  ctx.fillText("📞", pad + 36, bY + 92);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 40px ${FONT}`;
  wrapText(ctx, c.callout, pad + 120, bY + 70, W - pad * 2 - 150, 52, 3);

  // — Footer —
  const fY = H - 150;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, fY);
  ctx.lineTo(W - pad, fY);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(`${c.groupName} · ${c.players} players`, pad, fY + 64);
  ctx.textAlign = "right";
  ctx.fillStyle = G1;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText("shippie.app/run/golazo", W - pad, fY + 64);
}

export async function receiptsCardBlob(c: ReceiptsCard): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawReceiptsCard(canvas, c);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
}

// ── Card 3: Outside Bet badge (rewards contrarianism, FOMO stats) ─────────────

export interface OutsideBetCard {
  teamId: string;
  qualifier: string; // "Qualified from Group C · 2nd"
  pctCalled: number; // 8
  oneIn: number; // 12
  bonus: number; // 40
  playerName: string;
}

/** The Outside Bet badge: your contrarian nation came good. Gold glow + FOMO stats. */
export function drawOutsideBetCard(canvas: HTMLCanvasElement, c: OutsideBetCard): void {
  const [W, H] = SIZES.story;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pad = 90;
  const t = maybeTeam(c.teamId);

  // gold-centred backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0806");
  bg.addColorStop(1, "#120d06");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.9);
  glow.addColorStop(0, hexA("#ffd700", 0.16));
  glow.addColorStop(0.45, hexA("#ff8c00", 0.07));
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  cardEyebrow(ctx, pad, "OUTSIDE BET 🐴");

  ctx.textAlign = "center";
  ctx.font = `300px ${FONT}`;
  ctx.fillText(t ? t.flag : "🐴", W / 2, 620);

  const nm = (t ? t.name : "—").toUpperCase();
  ctx.fillStyle = GOLD;
  ctx.font = `900 ${nm.length > 11 ? 100 : 130}px ${FONT}`;
  ctx.fillText(nm, W / 2, 800);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(c.qualifier, W / 2, 880);

  // — 3-stat row —
  const sY = 1000;
  const sH = 240;
  const gap = 24;
  const sw = (W - pad * 2 - gap * 2) / 3;
  const stats: [string, string][] = [
    [`${c.pctCalled}%`, "OF PLAYERS\nCALLED THIS"],
    [`1/${c.oneIn}`, "BELIEVERS\nIN THE GROUP"],
    [`+${c.bonus}`, "BONUS\nPOINTS"],
  ];
  stats.forEach(([num, desc], i) => {
    const sx = pad + i * (sw + gap);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, sx, sY, sw, sH, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    roundRect(ctx, sx, sY, sw, sH, 22);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.font = `900 76px ${FONT}`;
    ctx.fillText(num, sx + sw / 2, sY + 110);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `600 26px ${FONT}`;
    desc.split("\n").forEach((line, li) => {
      ctx.fillText(line, sx + sw / 2, sY + 160 + li * 36);
    });
  });

  // — CTA —
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(`${c.playerName || "I"} saw it coming.`, W / 2, sY + sH + 110);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText("Make your call at shippie.app/run/golazo", W / 2, sY + sH + 170);

  // — Footer —
  const fY = H - 150;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, fY);
  ctx.lineTo(W - pad, fY);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText("Picked by ", pad, fY + 64);
  const lw = ctx.measureText("Picked by ").width;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(c.playerName || "Me", pad + lw, fY + 64);
  ctx.textAlign = "right";
  ctx.fillStyle = GOLD;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText("shippie.app/run/golazo", W - pad, fY + 64);
}

export async function outsideBetCardBlob(c: OutsideBetCard): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawOutsideBetCard(canvas, c);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
}

/** Champion-aware accent so the rest of the UI can theme to your pick. */
export function accentFor(prediction: Prediction): [string, string] {
  const champId = championOf(prediction);
  if (!champId) return ["#10b981", "#34d399"];
  const t = team(champId);
  return t.colors;
}
