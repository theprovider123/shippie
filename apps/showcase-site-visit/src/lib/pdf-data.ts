/**
 * Pure projection from the DB shape to the print view's read model.
 * Joining sites + visits + checks + incidents on a phone is cheap; we
 * still keep this pure so it tests without a DB and without a DOM.
 *
 * The print view consumes a `PdfPayload` directly — no extra component
 * logic, no async fetches, no surprises when the inspector hits
 * `window.print()` on a slow site.
 */

import type {
  Check,
  CheckStatus,
  Incident,
  IncidentSeverity,
  Site,
  Visit,
} from '../db/schema.ts';

export interface PdfCheck {
  id: string;
  label: string;
  status: CheckStatus;
  statusLabel: string;
  notes: string | null;
  photoCount: number;
}

export interface PdfIncident {
  id: string;
  severity: IncidentSeverity;
  severityLabel: string;
  description: string;
  hasPhoto: boolean;
  followUp: boolean;
  createdAt: string;
}

export interface PdfPayload {
  site: {
    id: string;
    name: string;
    address: string;
    contact: string;
  };
  visit: {
    id: string;
    inspectorName: string;
    weather: string;
    startedAt: string;
    endedAt: string | null;
    statusLabel: string;
  };
  checks: PdfCheck[];
  incidents: PdfIncident[];
  signatureSvg: string | null;
  /** Aggregate counts so the print header can show "8/10 pass — 1 issue" at a glance. */
  summary: {
    total: number;
    pass: number;
    fail: number;
    na: number;
    needsAttention: number;
    pending: number;
  };
}

const CHECK_LABELS: Record<CheckStatus, string> = {
  pending: 'Pending',
  pass: 'Pass',
  fail: 'Fail',
  na: 'N/A',
  'needs-attention': 'Needs attention',
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: 'Low',
  med: 'Medium',
  high: 'High',
};

const VISIT_STATUS_LABELS: Record<Visit['status'], string> = {
  'in-progress': 'In progress',
  submitted: 'Submitted',
  amended: 'Amended',
};

export function buildPdfPayload(input: {
  site: Site;
  visit: Visit;
  checks: ReadonlyArray<Check>;
  incidents: ReadonlyArray<Incident>;
}): PdfPayload {
  const { site, visit, checks, incidents } = input;
  const summary = {
    total: checks.length,
    pass: 0,
    fail: 0,
    na: 0,
    needsAttention: 0,
    pending: 0,
  };
  for (const c of checks) {
    if (c.status === 'pass') summary.pass++;
    else if (c.status === 'fail') summary.fail++;
    else if (c.status === 'na') summary.na++;
    else if (c.status === 'needs-attention') summary.needsAttention++;
    else summary.pending++;
  }
  return {
    site: {
      id: site.id,
      name: site.name,
      address: site.address ?? '',
      contact: [site.contact_name, site.contact_phone].filter(Boolean).join(' · '),
    },
    visit: {
      id: visit.id,
      inspectorName: visit.inspector_name ?? '',
      weather: visit.weather ?? '',
      startedAt: visit.started_at ?? '',
      endedAt: visit.ended_at ?? null,
      statusLabel: VISIT_STATUS_LABELS[visit.status] ?? visit.status,
    },
    checks: [...checks]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        label: c.label,
        status: c.status,
        statusLabel: CHECK_LABELS[c.status] ?? c.status,
        notes: c.notes ?? null,
        photoCount: c.photo_paths.length,
      })),
    incidents: [...incidents]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((i) => ({
        id: i.id,
        severity: i.severity,
        severityLabel: SEVERITY_LABELS[i.severity] ?? i.severity,
        description: i.description,
        hasPhoto: Boolean(i.photo_path),
        followUp: i.follow_up,
        createdAt: i.created_at,
      })),
    signatureSvg: visit.signature_svg ?? null,
    summary,
  };
}

export function summaryHeadline(payload: PdfPayload): string {
  const { pass, total, fail, needsAttention } = payload.summary;
  const issueCount = fail + needsAttention;
  if (total === 0) return 'No checks recorded';
  const head = `${pass}/${total} pass`;
  if (issueCount === 0) return head;
  return `${head} — ${issueCount} issue${issueCount === 1 ? '' : 's'}`;
}
