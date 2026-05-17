/**
 * Visit card. Shows the site, the date, the status, and a discreet
 * "open issue" dot when any check failed or needs attention.
 */

import type { Site, Visit } from '../db/schema.ts';

export interface VisitCardProps {
  visit: Visit;
  site: Site | null;
  hasIssues: boolean;
  onOpen: () => void;
}

const STATUS_LABELS: Record<Visit['status'], string> = {
  'in-progress': 'in progress',
  submitted: 'submitted',
  amended: 'amended',
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function VisitCard({ visit, site, hasIssues, onOpen }: VisitCardProps) {
  return (
    <button
      type="button"
      className={`visit-card visit-card--${visit.status} ${hasIssues ? 'has-issues' : ''}`}
      onClick={onOpen}
    >
      <span className="visit-card__site">{site?.name ?? 'site removed'}</span>
      <span className="visit-card__date">{formatDate(visit.started_at)}</span>
      <span className="visit-card__status">
        {STATUS_LABELS[visit.status]}
        {hasIssues ? <span className="visit-card__issue-dot" aria-label="open issue" /> : null}
      </span>
    </button>
  );
}
