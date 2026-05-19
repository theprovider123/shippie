/**
 * Tournament programme keepsake — 1080×1350 canvas per spec §7.5.
 *
 * Layout:
 *   - Fraunces title "{Tournament name} 2026" + gold-leaf accent
 *   - Final squad with captain crown
 *   - Captain log per match (table of fixture + captain + score)
 *   - League finish (your position + 1st place + delta)
 *   - Snapshot deltas (your point trajectory across snapshots)
 *   - Italic-mono footer `wcfantasy/{league-id}/final`
 *   - Peer signature row (all managers' initials)
 *
 * Filename: `wcfantasy-{league-id}-final.pdf`.
 */
import type { KeepsakeTemplate } from '@shippie/showcase-kit-v2';

const PALETTE = {
  cream: '#fffdf7',
  paper: '#faf7ef',
  paperDeep: '#efe4cf',
  ink: '#171513',
  inkSoft: '#3a352f',
  muted: '#635c52',
  pitch: '#0e5c3a',
  pitchDeep: '#0a3928',
  pitchInk: '#08271d',
  gold: '#c9a24b',
  goldDeep: '#99762a',
  goldFaint: '#f4e9c9',
  line: 'rgba(23, 21, 19, 0.18)',
  warn: '#a33b30',
};

const FONT_DISPLAY = 'Fraunces, "Iowan Old Style", Georgia, serif';
const FONT_MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

export interface ProgrammeSquadPlayer {
  name: string;
  team: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  isCaptain: boolean;
}

export interface ProgrammeCaptainLogRow {
  fixture: string;
  captain: string;
  points: number;
}

export interface ProgrammeStandingRow {
  managerName: string;
  total: number;
  isYou: boolean;
}

export interface ProgrammeSnapshotDelta {
  label: string;
  total: number;
}

export interface ProgrammePeerSignature {
  initials: string;
  teamColor?: string;
}

export interface TournamentProgrammeData {
  tournamentName: string;
  leagueName: string;
  leagueId: string;
  managerName: string;
  finalScore: number;
  squad: ProgrammeSquadPlayer[];
  captainLog: ProgrammeCaptainLogRow[];
  standings: ProgrammeStandingRow[];
  snapshots: ProgrammeSnapshotDelta[];
  peerSignatures: ProgrammePeerSignature[];
}

const W = 1080;
const H = 1350;

export const TournamentProgramme: KeepsakeTemplate<TournamentProgrammeData> = (ctx, data, width, height) => {
  const w = width ?? W;
  const h = height ?? H;

  // Background — paper warm cream + programme gridline.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PALETTE.cream);
  grad.addColorStop(0.62, PALETTE.paper);
  grad.addColorStop(1, PALETTE.paperDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(14, 92, 58, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 38; x < w; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const padding = 80;
  let cursorY = padding;

  // 1. Gold-leaf eyebrow
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.font = `600 22px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawTracked(ctx, 'WORLD CUP FANTASY · FINAL PROGRAMME', padding, cursorY, 0.18);
  cursorY += 44;

  // Title — Fraunces, gold accent on "2026"
  ctx.fillStyle = PALETTE.pitchDeep;
  ctx.font = `700 84px ${FONT_DISPLAY}`;
  const titleA = data.tournamentName + ' ';
  ctx.fillText(titleA, padding, cursorY);
  const titleAWidth = ctx.measureText(titleA).width;
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `italic 700 84px ${FONT_DISPLAY}`;
  ctx.fillText('2026', padding + titleAWidth, cursorY);
  cursorY += 100;

  // League name + manager
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `italic 500 30px ${FONT_DISPLAY}`;
  ctx.fillText(`${data.leagueName} · ${data.managerName}`, padding, cursorY);
  cursorY += 56;

  // 2. Final score band — big mono numeric on pitch-green ribbon
  const bandH = 130;
  ctx.fillStyle = PALETTE.pitchDeep;
  ctx.fillRect(padding, cursorY, w - padding * 2, bandH);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `600 18px ${FONT_MONO}`;
  drawTracked(ctx, 'FINAL POINTS', padding + 28, cursorY + 22, 0.2);
  ctx.fillStyle = PALETTE.cream;
  ctx.font = `700 92px ${FONT_MONO}`;
  ctx.fillText(String(data.finalScore), padding + 28, cursorY + 50);
  cursorY += bandH + 36;

  // 3. Final squad with captain crown
  ctx.fillStyle = PALETTE.pitchDeep;
  ctx.font = `600 18px ${FONT_MONO}`;
  drawTracked(ctx, 'FINAL SQUAD', padding, cursorY, 0.18);
  cursorY += 32;

  const rowH = 30;
  for (const player of data.squad.slice(0, 15)) {
    ctx.fillStyle = player.isCaptain ? PALETTE.goldFaint : PALETTE.cream;
    ctx.fillRect(padding, cursorY, w - padding * 2, rowH - 4);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `600 18px ${FONT_DISPLAY}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${player.isCaptain ? '♛ ' : '  '}${player.name}`, padding + 12, cursorY + rowH / 2 - 2);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 14px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${player.team} · ${player.position}`, w - padding - 12, cursorY + rowH / 2 - 2);
    ctx.textAlign = 'left';
    cursorY += rowH;
  }
  cursorY += 18;

  // 4. Captain log table
  if (data.captainLog.length > 0) {
    ctx.fillStyle = PALETTE.pitchDeep;
    ctx.font = `600 18px ${FONT_MONO}`;
    ctx.textBaseline = 'top';
    drawTracked(ctx, 'CAPTAIN LOG', padding, cursorY, 0.18);
    cursorY += 30;

    for (const row of data.captainLog.slice(0, 8)) {
      ctx.fillStyle = PALETTE.ink;
      ctx.font = `500 16px ${FONT_DISPLAY}`;
      ctx.fillText(row.fixture, padding, cursorY);
      ctx.fillText(row.captain, padding + 280, cursorY);
      ctx.font = `600 16px ${FONT_MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${row.points} pts`, w - padding, cursorY);
      ctx.textAlign = 'left';
      ctx.strokeStyle = PALETTE.line;
      ctx.beginPath();
      ctx.moveTo(padding, cursorY + 22);
      ctx.lineTo(w - padding, cursorY + 22);
      ctx.stroke();
      cursorY += 26;
    }
    cursorY += 14;
  }

  // 5. League finish
  if (data.standings.length > 0) {
    ctx.fillStyle = PALETTE.pitchDeep;
    ctx.font = `600 18px ${FONT_MONO}`;
    drawTracked(ctx, 'LEAGUE FINISH', padding, cursorY, 0.18);
    cursorY += 30;
    const yourEntry = data.standings.find((s) => s.isYou);
    const top = data.standings[0];
    if (top && yourEntry) {
      const yourRank = data.standings.findIndex((s) => s.isYou) + 1;
      const delta = top.total - yourEntry.total;
      ctx.fillStyle = PALETTE.ink;
      ctx.font = `italic 500 22px ${FONT_DISPLAY}`;
      ctx.fillText(
        `You finished #${yourRank} of ${data.standings.length} · ${delta === 0 ? 'level with' : delta > 0 ? `${delta} behind` : `${-delta} ahead of`} ${top.managerName}.`,
        padding,
        cursorY,
      );
      cursorY += 36;
    }
  }

  // 6. Snapshot deltas (point trajectory)
  if (data.snapshots.length > 0) {
    ctx.fillStyle = PALETTE.pitchDeep;
    ctx.font = `600 18px ${FONT_MONO}`;
    drawTracked(ctx, 'POINT TRAJECTORY', padding, cursorY, 0.18);
    cursorY += 30;
    const chartH = 100;
    const chartW = w - padding * 2;
    const max = Math.max(1, ...data.snapshots.map((s) => s.total));
    const step = chartW / Math.max(1, data.snapshots.length - 1);
    ctx.strokeStyle = PALETTE.pitch;
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.snapshots.forEach((snap, i) => {
      const x = padding + i * step;
      const y = cursorY + chartH - (snap.total / max) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    data.snapshots.forEach((snap, i) => {
      const x = padding + i * step;
      const y = cursorY + chartH - (snap.total / max) * chartH;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 12px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(snap.label, x, cursorY + chartH + 14);
    });
    ctx.textAlign = 'left';
    cursorY += chartH + 44;
  }

  // 7. Peer signature row (initials + colour dots)
  if (data.peerSignatures.length > 0) {
    ctx.fillStyle = PALETTE.pitchDeep;
    ctx.font = `600 14px ${FONT_MONO}`;
    drawTracked(ctx, 'SIGNATURES', padding, cursorY, 0.18);
    cursorY += 22;
    let cursorX = padding;
    for (const sig of data.peerSignatures.slice(0, 12)) {
      ctx.fillStyle = sig.teamColor ?? PALETTE.gold;
      ctx.beginPath();
      ctx.arc(cursorX + 10, cursorY + 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.ink;
      ctx.font = `600 14px ${FONT_MONO}`;
      ctx.fillText(sig.initials, cursorX + 24, cursorY + 6);
      cursorX += 80;
      if (cursorX > w - padding - 80) break;
    }
    cursorY += 36;
  }

  // 8. Italic-mono footer
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `italic 600 18px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`wcfantasy/${data.leagueId}/final`, padding, h - padding + 30);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `italic 600 18px ${FONT_DISPLAY}`;
  ctx.textAlign = 'right';
  ctx.fillText('Shippie · Couch League', w - padding, h - padding + 30);
};

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  track: number,
): void {
  const sizeMatch = /([0-9.]+)px/.exec(ctx.font);
  const size = sizeMatch ? Number(sizeMatch[1]) : 16;
  const extra = size * track;
  let cursorX = x;
  for (const ch of text) {
    ctx.fillText(ch, cursorX, y);
    cursorX += ctx.measureText(ch).width + extra;
  }
}

/** Build the keepsake filename from a league id. */
export function programmeFilename(leagueId: string): string {
  return `wcfantasy-${leagueId}-final.pdf`;
}
