/**
 * Leadership rollup — server-side composition of the reusable
 * `computeLeadershipRollup` primitive (Phase 8).
 *
 * Reads the school's append-only event log + subjects + roster (active +
 * tombstoned) from the workspace, derives lesson metadata (reusing the same
 * date-derivation as What Works), and produces the deterministic cohort rollup.
 * No AI. Always available. The HTML renderer below turns the rollup into a
 * clean, print-friendly evidence summary a leader / SENCO can show in a meeting
 * or attach to an inspection / EHCP context.
 *
 * HONESTY GUARD: everything is labelled "lesson feedback evidence" — never
 * "attainment" / "statutory". The wording comes from EVIDENCE_BASIS /
 * EVIDENCE_DISCLAIMER in the contract so copy + types stay in lock-step.
 */
import {
  computeLeadershipRollup,
  EVIDENCE_BASIS,
  EVIDENCE_DISCLAIMER,
  type LeadershipRollup,
  type RollupSubject,
  type RosterPupil,
  type WorkspaceEvent,
} from '@shippie/cloudlet-contract';
import type { LessonRow, SubjectRow } from './workspace-store';
import { buildLessonMeta } from './what-works';

export { EVIDENCE_BASIS, EVIDENCE_DISCLAIMER };
export type { LeadershipRollup };

/** The roster shape from `WorkspaceStore.rosterSnapshot()`. */
export interface RosterSnapshotPupil {
  id: string;
  send: boolean;
  eal: boolean;
  fsm: boolean;
  active: boolean;
}

export interface BuildRollupInput {
  instanceId: string;
  events: Array<WorkspaceEvent & { receivedAt?: number }>;
  subjects: SubjectRow[];
  lessons: LessonRow[];
  /** ALL pupils incl. tombstoned (from rosterSnapshot) — historic evidence. */
  roster: RosterSnapshotPupil[];
  /** true = current cohort only (active); false = include historic leavers. */
  activeOnly?: boolean;
  minDataPoints?: number;
  now?: () => number;
}

/** Build the deterministic leadership rollup from raw workspace reads. */
export function buildLeadershipRollup(input: BuildRollupInput): LeadershipRollup {
  const subjects: RollupSubject[] = input.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    parentId: s.parentId,
    color: s.color,
  }));
  const roster: RosterPupil[] = input.roster.map((p) => ({
    id: p.id,
    send: p.send,
    eal: p.eal,
    fsm: p.fsm,
    active: p.active,
  }));
  return computeLeadershipRollup({
    instanceId: input.instanceId,
    events: input.events,
    subjects,
    lessons: buildLessonMeta(input.lessons, input.events),
    roster,
    activeOnly: input.activeOnly,
    minDataPoints: input.minDataPoints,
    now: input.now,
  });
}

// ── Print-friendly HTML export ───────────────────────────────────────────────

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);
const rate = (n: number | null): string => (n === null ? '—' : `${Math.round(n * 100)}%`);

/** Pupil-id → display name resolver for the export (optional). */
export type NameResolver = (pupilId: string) => string;

export interface ExportMeta {
  schoolName: string;
  /** Free-text period e.g. "Summer Term 2026 · Week 8". */
  period?: string;
  /** Who generated it (for the footer provenance line). */
  generatedBy?: string;
  /** Resolve a pupil id to a display name (else the id is shown). */
  resolveName?: NameResolver;
}

/**
 * Render the rollup as a standalone, print-friendly HTML document. Calm, plain,
 * no JS. The honesty disclaimer is shown prominently at the top AND in the
 * footer so the evidence basis travels with the document.
 */
export function renderRollupHtml(rollup: LeadershipRollup, meta: ExportMeta): string {
  const name = meta.resolveName ?? ((id: string) => id);
  const generatedAt = new Date(rollup.computedAt).toLocaleString('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const subjectRows = rollup.subjects
    .map((s) => {
      const strandRows = s.strands
        .map(
          (st) =>
            `<tr class="strand"><td>↳ ${escapeHtml(st.name)}</td><td>${pct(st.pct)}</td><td>${st.dataPoints}</td></tr>`,
        )
        .join('');
      return `<tr class="headline"><td><strong>${escapeHtml(s.name)}</strong></td><td><strong>${pct(s.pct)}</strong></td><td>${s.dataPoints}</td></tr>${strandRows}`;
    })
    .join('');

  const inclusionRows = rollup.inclusion
    .map(
      (g) =>
        `<tr><td>${escapeHtml(g.label)}</td><td>${g.pupils}</td><td>${pct(g.pct)}</td><td>${g.needSupportPct === null ? '—' : `${g.needSupportPct}%`}</td><td>${g.dataPoints}</td></tr>`,
    )
    .join('');

  const strategyRows = rollup.topStrategies
    .slice(0, 8)
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.strategy)}</td><td>${rate(s.successRate)}</td><td>${s.n}</td><td>${escapeHtml(s.subjects.join(', ') || '—')}</td></tr>`,
    )
    .join('');

  const usedRows = rollup.adaptationsUsed
    .slice(0, 8)
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.strategy)}</td><td>${a.timesUsed}</td><td>${escapeHtml(a.subjects.join(', ') || '—')}</td></tr>`,
    )
    .join('');

  const revisitRows = rollup.pupilsToRevisit
    .slice(0, 40)
    .map((p) => {
      const objs = p.objectives.map((o) => escapeHtml(o.objective)).join('; ');
      const leaver = p.active ? '' : ' <span class="leaver">(left — historic)</span>';
      return `<tr><td>${escapeHtml(name(p.pupilId))}${leaver}</td><td>${p.objectives.length}</td><td>${objs}</td></tr>`;
    })
    .join('');

  const impact = rollup.adaptationImpact;
  const impactBlock =
    impact.flaggedCount > 0
      ? `<p>Of <strong>${impact.flaggedCount}</strong> flagged strategies with follow-up feedback, <strong>${impact.improvedCount}</strong> (${rate(impact.improvedRate)}) saw the next feedback on that objective improve. Average change: <strong>${impact.avgScoreDelta === null ? '—' : (impact.avgScoreDelta > 0 ? '+' : '') + impact.avgScoreDelta} points</strong>.</p>`
      : `<p class="muted">Not enough follow-up feedback yet to measure adaptation impact.</p>`;

  const scopeNote = rollup.includesHistoric
    ? 'Includes pupils who have since left (historic evidence).'
    : 'Current cohort only.';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.schoolName)} — Lesson Feedback Evidence Summary</title>
<style>
  :root { --teal:#1B9B7A; --ink:#1A1917; --muted:#6B6864; --border:#E8E6E3; --bg:#F8F7F4; }
  * { box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; color: var(--ink); margin: 0; padding: 32px; background: #fff; line-height: 1.5; }
  .wrap { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 16px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid var(--border); }
  .sub { color: var(--muted); font-size: 14px; margin: 0; }
  .banner { background: #E4F5F0; border: 1px solid var(--teal); border-radius: 10px; padding: 12px 16px; margin: 20px 0; font-size: 13px; color: #137A60; font-weight: 600; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin: 18px 0; }
  .stat { border: 1px solid var(--border); border-radius: 10px; padding: 12px 18px; min-width: 110px; }
  .stat .n { font-size: 24px; font-weight: 800; color: var(--teal); }
  .stat .l { font-size: 12px; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  td:not(:first-child), th:not(:first-child) { text-align: center; }
  tr.strand td { color: var(--muted); padding-left: 22px; }
  tr.headline td { background: var(--bg); }
  .muted { color: var(--muted); }
  .leaver { color: var(--muted); font-size: 11px; font-weight: 600; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
  @media print { body { padding: 0; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style></head>
<body><div class="wrap">
  <h1>${escapeHtml(meta.schoolName)}</h1>
  <p class="sub">Lesson Feedback Evidence Summary${meta.period ? ` · ${escapeHtml(meta.period)}` : ''}</p>

  <div class="banner">⚑ ${escapeHtml(EVIDENCE_DISCLAIMER)} ${escapeHtml(scopeNote)}</div>

  <div class="stats">
    <div class="stat"><div class="n">${rollup.totals.pupils}</div><div class="l">Pupils</div></div>
    <div class="stat"><div class="n">${rollup.totals.lessons}</div><div class="l">Lessons</div></div>
    <div class="stat"><div class="n">${rollup.totals.feedbackPoints}</div><div class="l">Feedback points</div></div>
    <div class="stat"><div class="n">${rollup.totals.subjects}</div><div class="l">Subjects</div></div>
  </div>

  <h2>Progress by subject (feedback-based)</h2>
  <table><thead><tr><th>Subject / strand</th><th>Secure score</th><th>Data points</th></tr></thead>
  <tbody>${subjectRows || '<tr><td colspan="3" class="muted">No feedback recorded yet.</td></tr>'}</tbody></table>

  <h2>Inclusion — vulnerable groups</h2>
  <table><thead><tr><th>Group</th><th>Pupils</th><th>Secure score</th><th>Needs support</th><th>Data points</th></tr></thead>
  <tbody>${inclusionRows}</tbody></table>

  <h2>Strategies with the strongest outcomes</h2>
  <table><thead><tr><th>Strategy</th><th>Worked</th><th>Recorded</th><th>Subjects</th></tr></thead>
  <tbody>${strategyRows || '<tr><td colspan="4" class="muted">No strategy outcomes recorded yet.</td></tr>'}</tbody></table>

  <h2>Adaptation impact</h2>
  ${impactBlock}

  <h2>Adaptations used most</h2>
  <table><thead><tr><th>Strategy</th><th>Times used</th><th>Subjects</th></tr></thead>
  <tbody>${usedRows || '<tr><td colspan="3" class="muted">No adaptations recorded yet.</td></tr>'}</tbody></table>

  <h2>Pupils to revisit</h2>
  <table><thead><tr><th>Pupil</th><th>Objectives</th><th>Detail</th></tr></thead>
  <tbody>${revisitRows || '<tr><td colspan="3" class="muted">No pupils currently flagged for revisit.</td></tr>'}</tbody></table>

  <footer>
    <p><strong>Evidence basis:</strong> ${escapeHtml(EVIDENCE_BASIS)}. ${escapeHtml(EVIDENCE_DISCLAIMER)}</p>
    <p>Generated ${escapeHtml(generatedAt)}${meta.generatedBy ? ` by ${escapeHtml(meta.generatedBy)}` : ''} · Uniti School Cloud · Data stays within your school's private cloud.</p>
  </footer>
</div></body></html>`;
}
