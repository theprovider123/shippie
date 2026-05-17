/**
 * Home — what the inspector wants on the lock screen of their day.
 * "Today's visits" if any, recent submitted ones underneath, big
 * "new visit" call to action.
 */

import type { Site, Visit } from '../db/schema.ts';
import { VisitCard } from '../components/VisitCard.tsx';

export interface HomeProps {
  visits: ReadonlyArray<Visit>;
  sitesById: Map<string, Site>;
  visitHasIssues: (visitId: string) => boolean;
  onOpenVisit: (visitId: string) => void;
  onNewVisit: () => void;
}

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function Home({ visits, sitesById, visitHasIssues, onOpenVisit, onNewVisit }: HomeProps) {
  const today = visits.filter((v) => isToday(v.started_at));
  const inProgress = visits.filter((v) => v.status === 'in-progress' && !isToday(v.started_at));
  const recent = visits
    .filter((v) => v.status !== 'in-progress' && !isToday(v.started_at))
    .slice(0, 6);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Site Visit</h1>
      </header>

      <button type="button" className="primary primary--big" onClick={onNewVisit}>
        New visit
      </button>

      {today.length > 0 ? (
        <section className="page-section">
          <h2 className="page-section__title">today</h2>
          <div className="card-stack">
            {today.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                site={sitesById.get(v.site_id) ?? null}
                hasIssues={visitHasIssues(v.id)}
                onOpen={() => onOpenVisit(v.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {inProgress.length > 0 ? (
        <section className="page-section">
          <h2 className="page-section__title">drafts</h2>
          <div className="card-stack">
            {inProgress.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                site={sitesById.get(v.site_id) ?? null}
                hasIssues={visitHasIssues(v.id)}
                onOpen={() => onOpenVisit(v.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="page-section">
          <h2 className="page-section__title">recent</h2>
          <div className="card-stack">
            {recent.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                site={sitesById.get(v.site_id) ?? null}
                hasIssues={visitHasIssues(v.id)}
                onOpen={() => onOpenVisit(v.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {today.length === 0 && inProgress.length === 0 && recent.length === 0 ? (
        <p className="empty-state">
          No visits yet. Tap <strong>New visit</strong> to start.
        </p>
      ) : null}
    </section>
  );
}
