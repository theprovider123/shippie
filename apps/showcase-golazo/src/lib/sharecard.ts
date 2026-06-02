// The viral artifact: a gorgeous, screenshot-worthy card of your World Cup call.
// Pure Canvas2D so it works offline and needs no fonts beyond the system stack.

import { maybeTeam, team } from "../data/teams";
import { championOf } from "./bracket";
import type { Prediction, Profile } from "./types";

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

  if (isStory) {
    // — Champion hero (story only has the room) —
    const cy = 560;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText("I'M CALLING THE CHAMPION", W / 2, 360);

    // flag
    ctx.font = `300px ${FONT}`;
    ctx.fillText(champ ? champ.flag : "🏆", W / 2, cy);

    // name plate
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${champ && champ.name.length > 11 ? 92 : 120}px ${FONT}`;
    ctx.fillText((champ ? champ.name : "TBD").toUpperCase(), W / 2, cy + 200);

    // accent underline
    ctx.fillStyle = accent2;
    const uw = 220;
    roundRect(ctx, W / 2 - uw / 2, cy + 235, uw, 10, 5);
    ctx.fill();

    // — Finalists row —
    const fa = maybeTeam(prediction.knockout["SF-0"]);
    const fb = maybeTeam(prediction.knockout["SF-1"]);
    const fy = 1080;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText("MY FINAL", W / 2, fy - 70);
    drawMatchup(ctx, W / 2, fy, fa, fb);

    // — Owner + CTA card —
    const cardY = 1480;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, pad, cardY, W - pad * 2, 280, 36);
    ctx.fill();
    ctx.strokeStyle = hexA(accent2, 0.5);
    ctx.lineWidth = 3;
    roundRect(ctx, pad, cardY, W - pad * 2, 280, 36);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(profile.name || "My", W / 2, cardY + 100);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText("Think you can beat my bracket?", W / 2, cardY + 160);
    ctx.fillStyle = accent2;
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText("shippie.app/run/golazo", W / 2, cardY + 230);
  } else {
    // — OG layout: champion on the right, copy on the left —
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText("MY CHAMPION", pad, 200);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText((champ ? champ.name : "TBD").toUpperCase(), pad, 290);
    ctx.fillStyle = accent2;
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText("Beat my bracket → shippie.app/run/golazo", pad, 380);
    ctx.font = `200px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(champ ? champ.flag : "🏆", W - pad, 360);
  }
}

function drawMatchup(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  a: ReturnType<typeof maybeTeam>,
  b: ReturnType<typeof maybeTeam>,
) {
  ctx.textAlign = "center";
  ctx.font = `120px ${FONT}`;
  ctx.fillText(a ? a.flag : "—", cx - 240, y);
  ctx.fillText(b ? b.flag : "—", cx + 240, y);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(a ? a.short : "TBD", cx - 240, y + 80);
  ctx.fillText(b ? b.short : "TBD", cx + 240, y + 80);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `900 56px ${FONT}`;
  ctx.fillText("v", cx, y - 10);
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

/** Champion-aware accent so the rest of the UI can theme to your pick. */
export function accentFor(prediction: Prediction): [string, string] {
  const champId = championOf(prediction);
  if (!champId) return ["#10b981", "#34d399"];
  const t = team(champId);
  return t.colors;
}
