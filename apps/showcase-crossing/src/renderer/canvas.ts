// apps/showcase-crossing/src/renderer/canvas.ts

import { PAL } from './palette.ts';
import {
  COLS, ROWS, HOME_SLOTS, obstaclesForLane, turtleGroupsForLane,
} from '../game/lanes.ts';
import type { FroggerState } from '../game/state.ts';
import { HOP_DURATION_MS } from '../game/physics.ts';
import { timerFraction, TIMER_TOTAL_MS } from '../game/timer.ts';

const HUD_ROWS = 2;   // rows at top reserved for HUD (score, lives, level)
const TIMER_ROWS = 1; // rows at bottom for timer bar

/** Compute the canvas CSS size (square) and cell size. */
export function computeLayout(containerW: number, containerH: number): {
  cssW: number;
  cssH: number;
  cellPx: number;
  topBandH: number;
  bottomBandH: number;
} {
  const boardRows = ROWS + HUD_ROWS + TIMER_ROWS;
  const portrait = containerH > containerW;

  if (portrait) {
    // On tall phones: width-constrained — fill the entire container height with
    // themed bands above and below the playfield instead of dead black bars.
    const cellPx = Math.floor(containerW / COLS);
    const boardH = cellPx * boardRows;
    const extraH = Math.max(0, containerH - boardH);
    // Split extra space: slightly more on top (sky band) than bottom (grass band)
    const topBandH = Math.floor(extraH * 0.55);
    const bottomBandH = extraH - topBandH;
    return { cssW: containerW, cssH: containerH, cellPx, topBandH, bottomBandH };
  }

  // Landscape / desktop: original behaviour — largest square that fits
  const cellFromW = containerW / COLS;
  const cellFromH = containerH / boardRows;
  const cellPx = Math.floor(Math.min(cellFromW, cellFromH));
  const cssW = cellPx * COLS;
  const cssH = cellPx * boardRows;
  return { cssW, cssH, cellPx, topBandH: 0, bottomBandH: 0 };
}

/** Resize canvas for devicePixelRatio. Returns cellPx. */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  containerW: number,
  containerH: number,
): number {
  const dpr = window.devicePixelRatio || 1;
  const { cssW, cssH, cellPx } = computeLayout(containerW, containerH);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  return cellPx;
}

function laneY(row: number, cellPx: number, topBandH: number): number {
  // Row 0 is the bottom (start verge), row ROWS-1 is home.
  // On canvas, y increases downward. HUD sits just below topBandH.
  return topBandH + (HUD_ROWS + (ROWS - 1 - row)) * cellPx;
}

export function drawFrame(
  canvas: HTMLCanvasElement,
  state: FroggerState,
  nowMs: number,
  fontLoaded: boolean,
): void {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { cellPx, topBandH, bottomBandH } = computeLayout(
    canvas.width / dpr,
    canvas.height / dpr,
  );

  ctx.save();
  ctx.scale(dpr, dpr);

  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  // ── Screen shake ─────────────────────────────────────────────────
  if (state.shakeMag > 0) {
    const sx = (Math.random() - 0.5) * state.shakeMag;
    const sy = (Math.random() - 0.5) * state.shakeMag;
    ctx.translate(sx, sy);
  }

  // ── Background ───────────────────────────────────────────────────
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Top band (themed skyline/tree-line above HUD) ─────────────────
  if (topBandH > 0) {
    drawTopBand(ctx, topBandH, W, cellPx);
  }

  // ── Board rows ───────────────────────────────────────────────────
  for (let row = 0; row < ROWS; row++) {
    const lane = state.level.lanes[row]!;
    const y = laneY(row, cellPx, topBandH);

    if (lane.kind === 'home') {
      drawHomeRow(ctx, state, y, cellPx, W);
    } else if (lane.kind === 'safe') {
      drawSafeRow(ctx, row, y, cellPx, W);
    } else if (lane.kind === 'road') {
      drawRoadRow(ctx, state, row, y, cellPx, W);
    } else if (lane.kind === 'river') {
      drawRiverRow(ctx, state, row, y, cellPx, W);
    }
  }

  // ── Bottom band (grass verge continuation below start row) ────────
  if (bottomBandH > 0) {
    drawBottomBand(ctx, topBandH, cellPx, bottomBandH, W);
  }

  // ── Frog ─────────────────────────────────────────────────────────
  if (state.phase !== 'game-over' && state.phase !== 'attract') {
    const tween = state.hopTween;
    let drawCol: number;
    let drawRow: number;
    let scaleY = 1;
    let scaleX = 1;

    if (tween) {
      const elapsed = nowMs - tween.startMs;
      const t = Math.min(1, elapsed / tween.durationMs);
      drawCol = tween.fromCol + (tween.toCol - tween.fromCol) * t;
      drawRow = tween.fromRow + (tween.toRow - tween.fromRow) * t;
      // squash at midpoint
      const squash = Math.sin(t * Math.PI);
      scaleY = 1 - squash * 0.25;
      scaleX = 1 + squash * 0.15;
    } else {
      drawCol = state.frog.col + state.frog.drift;
      drawRow = state.frog.row;
    }

    if (state.phase !== 'dead-flash' || Math.floor(nowMs / 80) % 2 === 0) {
      drawFrog(ctx, drawCol, drawRow, cellPx, scaleX, scaleY, topBandH);
    } else {
      drawDeathSkull(ctx, drawCol, drawRow, cellPx, topBandH);
    }
  }

  // ── HUD ──────────────────────────────────────────────────────────
  drawHUD(ctx, state, W, cellPx, fontLoaded, topBandH);

  // ── Timer bar ────────────────────────────────────────────────────
  const boardBottomY = topBandH + (HUD_ROWS + ROWS) * cellPx;
  drawTimerBar(ctx, state, W, boardBottomY, cellPx);

  // ── Overlay screens ──────────────────────────────────────────────
  if (state.phase === 'attract') {
    drawAttractScreen(ctx, state, W, H, fontLoaded);
  } else if (state.phase === 'game-over') {
    drawGameOverScreen(ctx, state, W, H, fontLoaded);
  } else if (state.phase === 'level-clear') {
    drawLevelClearScreen(ctx, state, W, H, fontLoaded);
  }

  ctx.restore();
}

// ── Lane drawing ─────────────────────────────────────────────────────

function drawSafeRow(ctx: CanvasRenderingContext2D, row: number, y: number, cellPx: number, W: number): void {
  ctx.fillStyle = PAL.grass;
  ctx.fillRect(0, y, W, cellPx);
  // Stripe
  ctx.fillStyle = PAL.grassStripe;
  for (let x = 0; x < W; x += 16) {
    ctx.fillRect(x, y + cellPx * 0.3, 8, cellPx * 0.2);
  }
  // Start label
  if (row === 0) {
    ctx.fillStyle = PAL.grassLight;
    ctx.fillRect(0, y, W, cellPx);
  }
}

function drawHomeRow(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  y: number,
  cellPx: number,
  W: number,
): void {
  // Bank background
  ctx.fillStyle = PAL.homeBank;
  ctx.fillRect(0, y, W, cellPx);

  // Slots
  for (let si = 0; si < HOME_SLOTS.length; si++) {
    const slotCol = HOME_SLOTS[si]!;
    const sx = slotCol * cellPx;
    const slot = state.homeSlots[si]!;
    ctx.fillStyle = slot.occupied ? PAL.homeFill : PAL.homeSlot;
    ctx.fillRect(sx + 2, y + 2, cellPx - 4, cellPx - 4);
    // Fly
    if (state.flySlotIndex === si && !slot.occupied) {
      drawFly(ctx, slotCol + 0.5, cellPx, y);
    }
    // Locked frog silhouette if occupied
    if (slot.occupied) {
      ctx.fillStyle = PAL.frogDark;
      ctx.beginPath();
      ctx.arc(sx + cellPx / 2, y + cellPx / 2, cellPx * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRoadRow(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  row: number,
  y: number,
  cellPx: number,
  W: number,
): void {
  ctx.fillStyle = PAL.road;
  ctx.fillRect(0, y, W, cellPx);
  // Centre stripe
  ctx.fillStyle = PAL.roadStripe;
  const stripeH = 3;
  for (let x = 0; x < W; x += 24) {
    ctx.fillRect(x, y + cellPx / 2 - stripeH / 2, 16, stripeH);
  }

  const lane = state.level.lanes[row]!;
  for (const obs of obstaclesForLane(lane, state.simTimeSec)) {
    const cx = obs.x * cellPx;
    const cw = obs.width * cellPx;
    drawVehicle(ctx, cx, y, cw, cellPx, obs.kind, lane.speed > 0, obs.colorIdx);
  }
}

function drawRiverRow(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  row: number,
  y: number,
  cellPx: number,
  W: number,
): void {
  // River background
  ctx.fillStyle = PAL.riverDeep;
  ctx.fillRect(0, y, W, cellPx);
  // Water shimmer strips
  ctx.fillStyle = PAL.riverMid;
  ctx.fillRect(0, y + cellPx * 0.2, W, cellPx * 0.12);
  ctx.fillStyle = PAL.waterRipple;
  ctx.fillRect(0, y + cellPx * 0.6, W, cellPx * 0.1);

  const lane = state.level.lanes[row]!;

  if (lane.diveFraction > 0) {
    // Turtle row
    for (const grp of turtleGroupsForLane(lane, state.simTimeSec)) {
      drawTurtleGroup(ctx, grp.x * cellPx, y, grp.count, cellPx, grp.diveProgress);
    }
  } else {
    // Log row
    for (const obs of obstaclesForLane(lane, state.simTimeSec)) {
      drawLog(ctx, obs.x * cellPx, y, obs.width * cellPx, cellPx);
    }
  }
}

// ── Object drawing ───────────────────────────────────────────────────

const CAR_COLOURS = [PAL.carRed, PAL.carAmber, PAL.carCream];

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  kind: string,
  facingRight: boolean,
  colorIdx: number,
): void {
  const pad = h * 0.08;
  const bodyY = y + pad;
  const bodyH = h - pad * 2;
  const bodyColor = kind === 'lorry' ? PAL.lorryBlue : (CAR_COLOURS[colorIdx % 3] ?? PAL.carRed);

  // Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(x + pad, bodyY, w - pad * 2, bodyH, 4);
  ctx.fill();

  // Cab/roof
  const roofW = kind === 'lorry' ? w * 0.3 : w * 0.45;
  const roofX = facingRight ? x + pad + (w - pad * 2) - roofW - pad : x + pad * 2;
  ctx.fillStyle = PAL.carRoof;
  ctx.beginPath();
  ctx.roundRect(roofX, bodyY + bodyH * 0.1, roofW, bodyH * 0.55, 3);
  ctx.fill();

  // Windscreen (glass)
  ctx.fillStyle = PAL.carWindow;
  ctx.fillRect(roofX + 3, bodyY + bodyH * 0.15, roofW - 6, bodyH * 0.35);

  // Headlights
  const lightX = facingRight ? x + w - pad * 2 - 5 : x + pad + 2;
  ctx.fillStyle = '#F4E240';
  ctx.fillRect(lightX, bodyY + bodyH * 0.65, 5, bodyH * 0.2);

  // Wheels
  ctx.fillStyle = '#111';
  const wheelR = Math.max(3, h * 0.12);
  const wheelY = y + h - wheelR - 1;
  ctx.beginPath();
  ctx.arc(x + w * 0.22, wheelY, wheelR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.78, wheelY, wheelR, 0, Math.PI * 2);
  ctx.fill();
}

function drawLog(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
): void {
  const pad = h * 0.1;
  // Main log body
  ctx.fillStyle = PAL.logBrown;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + pad, w - 2, h - pad * 2, 5);
  ctx.fill();
  // Dark grain lines
  ctx.fillStyle = PAL.logDark;
  for (let i = 0.2; i < 0.9; i += 0.25) {
    ctx.fillRect(x + 2, y + pad + (h - pad * 2) * i, w - 4, 1);
  }
  // End caps
  ctx.fillStyle = PAL.logRing;
  ctx.beginPath();
  ctx.ellipse(x + 5, y + h / 2, 4, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w - 5, y + h / 2, 4, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 4, y + pad + 1, w - 8, (h - pad * 2) * 0.2);
}

function drawTurtleGroup(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  count: number,
  cellPx: number,
  diveProgress: number,
): void {
  // Each turtle occupies 1 cell
  for (let i = 0; i < count; i++) {
    const tx = x + i * cellPx;
    drawTurtle(ctx, tx, y, cellPx, diveProgress);
  }
}

function drawTurtle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  cellPx: number,
  diveProgress: number,
): void {
  const alpha = 1 - diveProgress * 0.9;
  ctx.globalAlpha = alpha;
  const cx = x + cellPx / 2;
  const cy = y + cellPx / 2;
  const r = cellPx * 0.32;
  // Shell
  ctx.fillStyle = PAL.turtleShell;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shell pattern
  ctx.fillStyle = PAL.turtleDark;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = PAL.turtleGreen;
  ctx.beginPath();
  ctx.arc(cx + r * 0.6, cy - r * 0.1, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawFrog(
  ctx: CanvasRenderingContext2D,
  col: number, row: number,
  cellPx: number,
  scaleX: number,
  scaleY: number,
  topBandH: number = 0,
): void {
  const laneTopY = topBandH + (HUD_ROWS + (ROWS - 1 - row)) * cellPx;
  const fcx = (col + 0.5) * cellPx;
  const fcy = laneTopY + cellPx / 2;

  ctx.save();
  ctx.translate(fcx, fcy);
  ctx.scale(scaleX, scaleY);

  const r = cellPx * 0.32;

  // Body
  ctx.fillStyle = PAL.frog;
  ctx.beginPath();
  ctx.ellipse(0, 2, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = PAL.frogDark;
  ctx.beginPath();
  ctx.ellipse(0, 4, r * 0.65, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeR = r * 0.28;
  const eyeOff = r * 0.5;
  const eyeY = -r * 0.2;
  [[-eyeOff, eyeY], [eyeOff, eyeY]].forEach(([ex, ey]) => {
    ctx.fillStyle = PAL.frogEye;
    ctx.beginPath();
    ctx.arc(ex!, ey!, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.frogPupil;
    ctx.beginPath();
    ctx.arc(ex! + eyeR * 0.2, ey! + eyeR * 0.1, eyeR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Front feet (little bumps at top)
  ctx.fillStyle = PAL.frog;
  ctx.beginPath();
  ctx.ellipse(-eyeOff * 0.9, -r * 0.5, r * 0.18, r * 0.12, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeOff * 0.9, -r * 0.5, r * 0.18, r * 0.12, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawDeathSkull(
  ctx: CanvasRenderingContext2D,
  col: number, row: number,
  cellPx: number,
  topBandH: number = 0,
): void {
  const laneTopY = topBandH + (HUD_ROWS + (ROWS - 1 - row)) * cellPx;
  const fcx = (col + 0.5) * cellPx;
  const fcy = laneTopY + cellPx / 2;
  ctx.font = `${Math.round(cellPx * 0.7)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAL.skullFg;
  ctx.fillText('✕', fcx, fcy);
}

function drawFly(
  ctx: CanvasRenderingContext2D,
  slotCenterX: number,
  cellPx: number,
  homeRowY: number,
): void {
  const fcx = slotCenterX * cellPx;
  const fcy = homeRowY + cellPx / 2;
  ctx.fillStyle = PAL.flyYellow;
  ctx.beginPath();
  ctx.arc(fcx, fcy, cellPx * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1715';
  ctx.beginPath();
  ctx.arc(fcx, fcy, cellPx * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

// ── Themed fill bands (portrait phone only) ───────────────────────────

/**
 * Top band: dark home-bank continuation with a simple tree-line silhouette.
 * Sits above the HUD strip on tall phones.
 */
function drawTopBand(
  ctx: CanvasRenderingContext2D,
  bandH: number,
  W: number,
  cellPx: number,
): void {
  if (bandH <= 0) return;

  // Sky gradient — deep night fading to slightly lighter horizon
  const grad = ctx.createLinearGradient(0, 0, 0, bandH);
  grad.addColorStop(0, '#060a0f');
  grad.addColorStop(1, '#0d1a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, bandH);

  // Tree-line silhouette along the bottom of the band
  // Uses same homeBank + homeSlot palette tones so it blends into the home row
  const treeBaseY = bandH;
  const treeH = Math.min(bandH, cellPx * 1.4);
  const treeW = Math.max(6, cellPx * 0.8);
  const treeSpacing = treeW * 1.6;

  ctx.fillStyle = '#1a2e1e'; // dark evergreen silhouette
  // Draw a row of triangular/rounded tree shapes
  for (let x = -treeW * 0.5; x < W + treeW; x += treeSpacing) {
    // Vary height slightly per tree using a cheap hash
    const hVar = 0.7 + 0.3 * (((x * 7 + 13) % 17) / 17);
    const h = treeH * hVar;
    const cx = x + treeW * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - treeW * 0.5, treeBaseY);
    ctx.lineTo(cx, treeBaseY - h);
    ctx.lineTo(cx + treeW * 0.5, treeBaseY);
    ctx.closePath();
    ctx.fill();
    // Second smaller triangle layered on top for depth
    ctx.fillStyle = '#142413';
    ctx.beginPath();
    ctx.moveTo(cx - treeW * 0.35, treeBaseY - h * 0.4);
    ctx.lineTo(cx, treeBaseY - h * 1.0);
    ctx.lineTo(cx + treeW * 0.35, treeBaseY - h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a2e1e';
  }

  // Thin accent line at bottom edge where band meets HUD
  ctx.fillStyle = 'rgba(89,217,142,0.08)';
  ctx.fillRect(0, bandH - 1, W, 1);
}

/**
 * Bottom band: grass verge continuation below the start row.
 * The hint text is drawn into this band by a CSS overlay; we just paint the ground.
 */
function drawBottomBand(
  ctx: CanvasRenderingContext2D,
  topBandH: number,
  cellPx: number,
  bandH: number,
  W: number,
): void {
  if (bandH <= 0) return;

  // The start verge (row 0) ends at: topBandH + (HUD_ROWS + ROWS) * cellPx
  const bandY = topBandH + (HUD_ROWS + ROWS) * cellPx;

  // Grass fill — same grassLight as start verge row 0
  ctx.fillStyle = PAL.grassLight;
  ctx.fillRect(0, bandY, W, bandH);

  // Repeating grass stripe pattern matching drawSafeRow
  ctx.fillStyle = PAL.grassStripe;
  for (let x = 0; x < W; x += 16) {
    ctx.fillRect(x, bandY + bandH * 0.25, 8, bandH * 0.18);
    ctx.fillRect(x + 4, bandY + bandH * 0.55, 8, bandH * 0.18);
  }

  // Thin top edge line to visually separate from timer bar
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, bandY, W, 2);
}

// ── HUD ──────────────────────────────────────────────────────────────

function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  W: number,
  cellPx: number,
  fontLoaded: boolean,
  topBandH: number = 0,
): void {
  const hudY = topBandH;
  const hudH = HUD_ROWS * cellPx;
  ctx.fillStyle = PAL.hudBg;
  ctx.fillRect(0, hudY, W, hudH);

  const pxFont = fontLoaded ? 'Press Start 2P' : 'monospace';
  const fontSize = Math.max(8, Math.floor(cellPx * 0.42));
  const smallFontSize = Math.max(6, Math.floor(cellPx * 0.3));
  ctx.font = `${fontSize}px "${pxFont}"`;
  ctx.textBaseline = 'middle';

  const row1Y = hudY + cellPx * 0.5;
  const row2Y = hudY + cellPx * 1.5;

  // SCORE
  ctx.fillStyle = PAL.hudMuted;
  ctx.font = `${smallFontSize}px "${pxFont}"`;
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 8, row1Y - fontSize * 0.4);
  ctx.fillStyle = PAL.hudFg;
  ctx.font = `${fontSize}px "${pxFont}"`;
  ctx.fillText(String(state.score), 8, row2Y);

  // HI
  const hiX = W * 0.38;
  ctx.fillStyle = PAL.hudMuted;
  ctx.font = `${smallFontSize}px "${pxFont}"`;
  ctx.textAlign = 'center';
  ctx.fillText('HI', hiX, row1Y - fontSize * 0.4);
  ctx.fillStyle = PAL.hudAccent;
  ctx.font = `${fontSize}px "${pxFont}"`;
  ctx.fillText(String(Math.max(state.score, state.bestScore)), hiX, row2Y);

  // LEVEL
  const lvlX = W * 0.65;
  ctx.fillStyle = PAL.hudMuted;
  ctx.font = `${smallFontSize}px "${pxFont}"`;
  ctx.textAlign = 'center';
  ctx.fillText('LVL', lvlX, row1Y - fontSize * 0.4);
  ctx.fillStyle = PAL.hudFg;
  ctx.font = `${fontSize}px "${pxFont}"`;
  ctx.fillText(String(state.levelNumber), lvlX, row2Y);

  // Lives (frog icons)
  const livesX = W - 8;
  const lifeR = Math.max(4, cellPx * 0.18);
  ctx.fillStyle = PAL.hudMuted;
  ctx.font = `${smallFontSize}px "${pxFont}"`;
  ctx.textAlign = 'right';
  ctx.fillText('LIVES', livesX, row1Y - fontSize * 0.4);
  for (let i = 0; i < Math.min(5, state.lives); i++) {
    const lx = livesX - i * (lifeR * 2.5 + 2);
    ctx.fillStyle = i < state.lives ? PAL.hudLife : PAL.hudMuted;
    ctx.beginPath();
    ctx.arc(lx, row2Y, lifeR, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Timer bar ────────────────────────────────────────────────────────

function drawTimerBar(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  W: number,
  boardBottomY: number,
  _cellPx: number,
): void {
  const barH = 4;
  const barY = boardBottomY - barH;
  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, barY, W, barH);
  // Fill
  const frac = timerFraction(state);
  const fillW = Math.max(0, W * frac);
  const col = frac > 0.4 ? PAL.timerFull : frac > 0.15 ? PAL.timerMid : PAL.timerLow;
  ctx.fillStyle = col;
  ctx.fillRect(0, barY, fillW, barH);
}

// ── Overlay screens ──────────────────────────────────────────────────

function overlayBox(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  label: string,
  sub: string,
  prompt: string,
  fontLoaded: boolean,
  accentColor: string = PAL.hudAccent,
): void {
  // Dim
  ctx.fillStyle = 'rgba(6,10,15,0.78)';
  ctx.fillRect(0, 0, W, H);

  const pxFont = fontLoaded ? 'Press Start 2P' : 'monospace';
  const titleSize = Math.max(10, Math.floor(Math.min(W, H) * 0.065));
  const subSize = Math.max(7, Math.floor(titleSize * 0.55));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const midY = H * 0.45;

  ctx.fillStyle = accentColor;
  ctx.font = `${titleSize}px "${pxFont}"`;
  ctx.fillText(label, W / 2, midY - titleSize * 1.2);

  ctx.fillStyle = PAL.hudFg;
  ctx.font = `${subSize}px "${pxFont}"`;
  ctx.fillText(sub, W / 2, midY);

  ctx.fillStyle = PAL.hudMuted;
  ctx.font = `${subSize}px "${pxFont}"`;
  ctx.fillText(prompt, W / 2, midY + subSize * 3);
}

function drawAttractScreen(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  W: number, H: number,
  fontLoaded: boolean,
): void {
  overlayBox(ctx, W, H,
    'CROSSING',
    state.bestScore > 0 ? `HI ${state.bestScore}` : 'GET HOME SAFE',
    '— TAP OR PRESS START —',
    fontLoaded,
    PAL.hudAccent,
  );
}

function drawGameOverScreen(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  W: number, H: number,
  fontLoaded: boolean,
): void {
  overlayBox(ctx, W, H,
    'GAME OVER',
    `SCORE  ${state.score}    HI  ${Math.max(state.score, state.bestScore)}`,
    '— TAP TO PLAY AGAIN —',
    fontLoaded,
    PAL.carRed,
  );
}

function drawLevelClearScreen(
  ctx: CanvasRenderingContext2D,
  state: FroggerState,
  W: number, H: number,
  fontLoaded: boolean,
): void {
  overlayBox(ctx, W, H,
    'LEVEL CLEAR',
    `SCORE  ${state.score}`,
    '',
    fontLoaded,
    PAL.homeFill,
  );
}

// Suppress unused import warnings
export { HOP_DURATION_MS as _hopDurationMs, TIMER_TOTAL_MS as _timerTotalMs };
