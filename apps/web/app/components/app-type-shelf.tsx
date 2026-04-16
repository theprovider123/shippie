import Link from 'next/link';
import type { ProjectType } from '@shippie/shared';

export interface ShelfApp {
  slug: string;
  name: string;
  tagline: string | null;
  themeColor: string;
  installCount: number;
}

interface ShelfConfig {
  type: ProjectType;
  label: string;
  valueProp: string;
  bestFor: string;
}

const SHELVES: ShelfConfig[] = [
  {
    type: 'app',
    label: 'Apps',
    valueProp: 'Phone-first. Installable. Works offline. No review queue.',
    bestFor: 'AI-built micro-tools, habit trackers, capture + journal tools, single-purpose utilities',
  },
  {
    type: 'web_app',
    label: 'Web apps',
    valueProp: 'Real tools that live on the web. Tabs, URLs, desktop-friendly.',
    bestFor: 'Internal tools, dashboards, authoring tools, productivity',
  },
  {
    type: 'website',
    label: 'Websites',
    valueProp: 'Static sites with a marketplace, feedback, and analytics built in.',
    bestFor: 'Portfolios, docs, landing pages, marketing sites',
  },
];

export function AppTypeShelves({
  appsByType,
}: {
  appsByType: Record<ProjectType, ShelfApp[]>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3xl)' }}>
      {SHELVES.map((shelf) => (
        <Shelf key={shelf.type} config={shelf} apps={appsByType[shelf.type]} />
      ))}
    </div>
  );
}

function Shelf({ config, apps }: { config: ShelfConfig; apps: ShelfApp[] }) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-xl)',
          paddingBottom: 'var(--space-md)',
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        <div style={{ maxWidth: 620 }}>
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--h2-size)',
              lineHeight: 1.1,
              marginBottom: 'var(--space-sm)',
              letterSpacing: '-0.02em',
            }}
          >
            {config.label}
          </h3>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 'var(--body-size)' }}>
            {config.valueProp}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--caption-size)',
              color: 'var(--text-light)',
              marginTop: 'var(--space-sm)',
              letterSpacing: '0.02em',
            }}
          >
            best for: {config.bestFor}
          </p>
        </div>
        <Link
          href={`/apps?type=${config.type}`}
          className="btn-secondary"
          style={{ fontSize: 'var(--small-size)', padding: '0.5rem 1rem' }}
        >
          Browse {config.label.toLowerCase()} →
        </Link>
      </div>

      {apps.length === 0 ? (
        <p style={{ color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 'var(--small-size)' }}>
          No {config.label.toLowerCase()} shipped yet. Be first.
        </p>
      ) : (
        <div className="grid-3">
          {apps.slice(0, 3).map((app) => (
            <Link
              key={app.slug}
              href={`/apps/${app.slug}`}
              className="card reveal-child"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div
                className="shippie-icon"
                style={{ width: 56, height: 56, background: app.themeColor, marginBottom: 'var(--space-md)' }}
                aria-hidden
              />
              <h4 style={{ fontWeight: 600, fontSize: 'var(--body-size)', marginBottom: 'var(--space-xs)' }}>
                {app.name}
              </h4>
              {app.tagline && (
                <p style={{ fontSize: 'var(--small-size)', color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>
                  {app.tagline}
                </p>
              )}
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--caption-size)',
                  color: 'var(--text-light)',
                  marginTop: 'var(--space-sm)',
                }}
              >
                <span style={{ color: 'var(--sunset)' }}>↑</span> {app.installCount}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
