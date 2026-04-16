/**
 * /examples — curated, maker-approved templates.
 *
 * Distinct from the organic /apps storefront. Every entry has a "Deploy this"
 * button that clones the template into the visitor's account via /new.
 *
 * Differentiation plan Pillar B1.
 */
import Link from 'next/link';
import { RocketMark } from '../components/rocket-mark';
import { ThemeToggle } from '../theme-toggle';
import { ScrollReveal } from '../components/scroll-reveal';
import { CURATED_EXAMPLES, groupByType, type CuratedExample } from '@/lib/examples/curated';

export const runtime = 'nodejs';
export const revalidate = 600;

export const metadata = {
  title: 'Examples — templates you can deploy in 60 seconds',
  description:
    'Curated Shippie templates across apps, web apps, and websites. Click "Deploy this" to clone one into your account.',
};

const SHELVES: Array<{ label: string; type: 'app' | 'web_app' | 'website'; sub: string }> = [
  { label: 'Apps',      type: 'app',     sub: 'Phone-first. Installable. Works offline.' },
  { label: 'Web apps',  type: 'web_app', sub: 'Tools that live on the web. Tabs, URLs, desktop-friendly.' },
  { label: 'Websites',  type: 'website', sub: 'Static sites with marketplace + feedback built in.' },
];

export default function ExamplesPage() {
  const grouped = groupByType();

  return (
    <div className="grain">
      <nav className="navbar">
        <div className="nav-bar-inner">
          <div className="nav-group-left">
            <Link href="/" className="nav-logo">
              <RocketMark size={22} />
              <span className="nav-wordmark">shippie</span>
            </Link>
          </div>
          <div className="nav-group-center">
            <Link href="/apps" className="nav-link nav-desktop">Explore</Link>
            <Link href="/examples" className="nav-link nav-desktop">Examples</Link>
            <Link href="/why" className="nav-link nav-desktop">Why</Link>
            <Link href="/docs" className="nav-link nav-desktop">Docs</Link>
          </div>
          <div className="nav-group-right">
            <ThemeToggle />
            <Link href="/new" className="btn-primary nav-cta">Deploy an app</Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="section--lg">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <p className="section-label">Examples</p>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--h1-size)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                marginBottom: 'var(--space-xl)',
              }}
            >
              Start from something real.
            </h1>
            <p
              style={{
                fontSize: 'clamp(1rem, 1.8vw, 1.25rem)',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
              }}
            >
              {CURATED_EXAMPLES.length} curated templates. Click &quot;Deploy this&quot; to get a working copy under your own subdomain in about a minute.
            </p>
          </div>
        </section>

        {SHELVES.map((shelf) => (
          <section
            key={shelf.type}
            className="section"
            style={{ borderTop: '1px solid var(--border-light)' }}
          >
            <div className="wrap">
              <ScrollReveal>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 'var(--space-md)',
                    marginBottom: 'var(--space-xl)',
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: 'var(--h2-size)',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1,
                      }}
                    >
                      {shelf.label}
                    </h2>
                    <p
                      style={{
                        color: 'var(--text-secondary)',
                        marginTop: 'var(--space-sm)',
                        fontSize: 'var(--body-size)',
                      }}
                    >
                      {shelf.sub}
                    </p>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--caption-size)',
                      color: 'var(--text-light)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {grouped[shelf.type].length} template{grouped[shelf.type].length === 1 ? '' : 's'}
                  </span>
                </div>
              </ScrollReveal>

              <ScrollReveal>
                <div className="grid-3" style={{ gap: 'var(--space-lg)' }}>
                  {grouped[shelf.type].map((example) => (
                    <ExampleCard key={example.slug} example={example} />
                  ))}
                </div>
              </ScrollReveal>
            </div>
          </section>
        ))}

        <section className="section--lg" style={{ textAlign: 'center' }}>
          <div className="wrap">
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--h1-size)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}
            >
              Have a template to share?
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                marginTop: 'var(--space-lg)',
                maxWidth: 520,
                margin: 'var(--space-lg) auto 0',
                lineHeight: 1.7,
              }}
            >
              Open a PR against the <code>shippie-templates</code> org with a shippie.json and a quickstart README.
            </p>
            <div style={{ marginTop: 'var(--space-2xl)' }}>
              <a
                href="https://github.com/shippie-templates"
                className="btn-primary"
                style={{ padding: '1rem 2.5rem' }}
              >
                Contribute a template →
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ExampleCard({ example }: { example: CuratedExample }) {
  return (
    <article
      className="card reveal-child"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
    >
      <div
        className="shippie-icon"
        style={{
          width: 72,
          height: 72,
          background: example.themeColor,
          marginBottom: 'var(--space-sm)',
        }}
        aria-hidden
      />
      <div>
        <h3 style={{ fontWeight: 600, fontSize: 'var(--h3-size)', marginBottom: 'var(--space-xs)' }}>
          {example.name}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--caption-size)',
            color: 'var(--text-light)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 'var(--space-md)',
          }}
        >
          {example.type} · {example.category}
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 'var(--small-size)' }}>
          {example.tagline}
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-sm)',
          marginTop: 'auto',
          paddingTop: 'var(--space-md)',
          borderTop: '1px solid var(--border-light)',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href={`/new?template=${encodeURIComponent(example.slug)}&repo=${encodeURIComponent(example.repo)}`}
          className="btn-primary"
          style={{ padding: '0.5rem 1rem', fontSize: 'var(--small-size)' }}
        >
          Deploy this →
        </Link>
        <a
          href={`https://github.com/${example.repo}`}
          className="btn-secondary"
          style={{ padding: '0.5rem 1rem', fontSize: 'var(--small-size)' }}
        >
          Source
        </a>
        {example.liveUrl && (
          <a
            href={example.liveUrl}
            className="btn-secondary"
            style={{ padding: '0.5rem 1rem', fontSize: 'var(--small-size)' }}
          >
            Live
          </a>
        )}
      </div>
    </article>
  );
}
