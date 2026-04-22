import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { PROJECT_TYPES, isProjectType, type ProjectType } from '@shippie/shared';
import { RocketMark } from './components/rocket-mark';
import { ThemeToggle } from './theme-toggle';
import { ScrollReveal } from './components/scroll-reveal';
import { HeroCanvas } from './components/hero-canvas';
import { InstallRuntime } from './components/install-runtime';
import { HeroDropZone } from './components/drop-zone';
import { AppTypeShelves, type ShelfApp } from './components/app-type-shelf';
import { ComparisonMatrix } from './components/comparison-matrix';
import { Manifesto } from './components/manifesto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DbAppRow {
  slug: string;
  name: string;
  tagline: string | null;
  themeColor: string;
  installCount: number;
  type: string;
}

const PLACEHOLDERS: Record<ProjectType, ShelfApp[]> = {
  app: [
    { slug: 'recipe-saver', name: 'Recipe Saver', tagline: 'Save, organize, share. Yours forever.', themeColor: '#E8603C', installCount: 247 },
    { slug: 'workout',      name: 'Workout Logger', tagline: 'Track lifts. Watch numbers climb.', themeColor: '#5E7B5C', installCount: 89 },
    { slug: 'dough',        name: 'Dough Ratios', tagline: 'Hydration, salt, yeast. Perfect pizza.', themeColor: '#E8C547', installCount: 67 },
  ],
  web_app: [
    { slug: 'timezones',  name: 'Time Zones',      tagline: 'Paste cities. See overlap. Schedule.', themeColor: '#B07856', installCount: 203 },
    { slug: 'rate-calc',  name: 'Rate Calculator', tagline: 'Expenses + goals = real hourly rate.', themeColor: '#3A4D35', installCount: 45 },
    { slug: 'budget',     name: 'Budget Tracker',  tagline: 'Know where your money goes.',         themeColor: '#8BA8B8', installCount: 134 },
  ],
  website: [
    { slug: 'portfolio-a', name: 'Maker Portfolio', tagline: 'Static site with built-in feedback.', themeColor: '#7A9A6E', installCount: 28 },
    { slug: 'docs-a',      name: 'Project Docs',    tagline: 'Markdown out. Search in. Analytics.', themeColor: '#8A7A66', installCount: 54 },
    { slug: 'launch-a',    name: 'Launch Page',     tagline: 'Collect emails, ship updates.',       themeColor: '#E8C547', installCount: 91 },
  ],
};

async function loadAppsByType(): Promise<Record<ProjectType, ShelfApp[]>> {
  const db = await getDb();
  const rows = (await db.execute(sql`
    select slug, name, tagline, type,
           theme_color as "themeColor",
           install_count as "installCount"
    from apps
    where active_deploy_id is not null and is_archived = false
    order by greatest(ranking_score_app, ranking_score_web_app, ranking_score_website) desc nulls last
    limit 30
  `)) as unknown as DbAppRow[];

  const grouped: Record<ProjectType, ShelfApp[]> = { app: [], web_app: [], website: [] };
  for (const row of rows) {
    if (isProjectType(row.type)) {
      grouped[row.type].push({
        slug: row.slug,
        name: row.name,
        tagline: row.tagline,
        themeColor: row.themeColor,
        installCount: row.installCount,
      });
    }
  }

  // Fall back to placeholders per-shelf so the page stays populated pre-launch.
  for (const t of PROJECT_TYPES) {
    if (grouped[t].length === 0) grouped[t] = PLACEHOLDERS[t];
  }
  return grouped;
}

export default async function HomePage() {
  const appsByType = await loadAppsByType();

  return (
    <div className="grain">
      {/* ━━━ NAV ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav className="navbar">
        <div className="nav-bar-inner">
          <div className="nav-group-left">
            <Link href="/" className="nav-logo">
              <span className="nav-wordmark">shippie</span>
            </Link>
          </div>
          <div className="nav-group-center">
            <Link href="/apps" className="nav-link nav-desktop">Explore</Link>
            <Link href="/why" className="nav-link nav-desktop">Why</Link>
            <Link href="/docs" className="nav-link nav-desktop">Docs</Link>
            <a href="https://github.com/shippie/shippie" className="nav-link nav-wide">Open Source</a>
          </div>
          <div className="nav-group-right">
            <ThemeToggle />
            <Link href="/auth/signin" className="nav-signin nav-tablet">Sign in</Link>
            <Link href="/new" className="btn-primary nav-cta">Deploy an app</Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ━━━ HERO — Hook · Identity · Proof ━━━━━━━━━━━━━━━━━━ */}
        <section className="hero" style={{ position: 'relative', overflow: 'hidden' }}>
          <HeroCanvas />
          <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
            <div
              className="badge"
              style={{ borderColor: 'var(--marigold)', color: 'var(--marigold)', marginBottom: 'var(--space-xl)' }}
            >
              Open source · Launched 2026
            </div>

            <div className="grid-7-5">
              <div>
                {/* Move 1 — Hook */}
                <h1 className="hero-heading" style={{ maxWidth: 620, lineHeight: 1.05 }}>
                  <span style={{ display: 'block' }}>Built it with AI.</span>
                  <span style={{ display: 'block' }}>Installed on a phone.</span>
                  <span style={{ display: 'block', color: 'var(--sunset)' }}>60 seconds.</span>
                </h1>

                {/* Move 2 — Identity */}
                <p
                  className="hero-sub"
                  style={{
                    marginTop: 'var(--space-2xl)',
                    maxWidth: 560,
                    fontSize: 'clamp(1rem, 1.8vw, 1.25rem)',
                    lineHeight: 1.6,
                  }}
                >
                  No app store. No review. No 30% cut.<br />
                  Your data stays on your backend. Open source.
                </p>

                {/* Move 3 — Proof (drop zone) */}
                <div style={{ marginTop: 'var(--space-xl)', maxWidth: 560 }}>
                  <HeroDropZone />
                </div>

                <div className="hero-ctas" style={{ marginTop: 'var(--space-lg)' }}>
                  <Link href="/new" className="btn-secondary" style={{ fontSize: 'var(--small-size)' }}>
                    Or sign in to deploy →
                  </Link>
                  <Link href="/examples" className="btn-secondary" style={{ fontSize: 'var(--small-size)' }}>
                    See what&apos;s been shipped
                  </Link>
                </div>
              </div>

              <div
                className="hidden md:flex"
                style={{
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  marginTop: '-2rem',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: '-20%',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, var(--sunset-intense) 0%, var(--sunset-glow) 30%, transparent 65%)',
                  }}
                />
                <RocketMark size={480} className="animate-launch" />
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ 01 · THREE APP TYPES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="section" style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="wrap">
            <ScrollReveal>
              <div className="section-intro">
                <p className="section-label">01 · Three kinds of thing you can ship</p>
                <h2 className="section-heading">Apps. Web apps. Websites.</h2>
                <p className="section-subheading">
                  The same 60-second deploy. Three different stories. Pick the one that fits what you&apos;re building.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <AppTypeShelves appsByType={appsByType} />
            </ScrollReveal>
          </div>
        </section>

        {/* ━━━ 02 · COMPARISON ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="section" style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-pure)' }}>
          <div className="wrap">
            <ScrollReveal>
              <div className="section-intro">
                <p className="section-label">02 · Shippie vs the alternatives</p>
                <h2 className="section-heading">Honest on purpose.</h2>
                <p className="section-subheading">
                  Each of these does something well. So does Shippie. Here&apos;s the honest diff.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <ComparisonMatrix />
            </ScrollReveal>
          </div>
        </section>

        {/* ━━━ 03 · WHAT SHIPPIE IS NOT ━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="section" style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="wrap">
            <ScrollReveal>
              <div className="section-intro">
                <p className="section-label">03 · Things Shippie is not</p>
                <h2 className="section-heading">We&apos;re narrow on purpose.</h2>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="grid-3" style={{ gap: 'var(--space-xl)' }}>
                <NotACard
                  label="Not a native app builder"
                  desc="Your app runs in a browser and installs via PWA. If you need the App Store SDK, ARKit, or push sent through APNs, Shippie isn’t it."
                />
                <NotACard
                  label="Not a no-code tool"
                  desc="You ship code you wrote (or your AI wrote). We package it, host it, and wire up PWA + marketplace. We don’t generate it."
                />
                <NotACard
                  label="Not your data warehouse"
                  desc="Auth, storage, database — those stay on your own Supabase or Firebase. We host your frontend. Your users never touch our servers."
                />
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ━━━ 04 · THE LOOP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="section" style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-pure)' }}>
          <div className="wrap">
            <ScrollReveal>
              <div className="section-intro">
                <p className="section-label">04 · The loop</p>
                <h2 className="section-heading">Deploy is the beginning.</h2>
                <p className="section-subheading">
                  Every app ships with a feedback channel wired in. Your AI tool reads the feedback through MCP and iterates. The loop is the product.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="grid-4" style={{ background: 'var(--border-light)', gap: 1 }}>
                <LoopStep n="01" label="Ship"       color="var(--sunset)"     desc="60-second deploys via MCP, GitHub, or CLI. Your app goes live instantly." />
                <LoopStep n="02" label="Hear"       color="var(--sage-moss)"  desc="Structured feedback — feature requests, bugs, upvotes. All in one place." />
                <LoopStep n="03" label="Build"      color="var(--sage-moss)"  desc="Claude Code reads the feedback via MCP. You iterate in minutes, not weeks." />
                <LoopStep n="04" label="Ship again" color="var(--sunset)"     desc="Push updates. Users get them instantly. Version history and rollback built in." />
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ━━━ 05 · MANIFESTO (cream) ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="section--lg section--cream">
          <div className="wrap">
            <ScrollReveal>
              <Manifesto />
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3xl)' }}>
                <a
                  href="https://github.com/shippie/shippie"
                  className="btn-secondary"
                  style={{ borderColor: 'var(--cream-border)', color: 'var(--cream-text)' }}
                >
                  View on GitHub →
                </a>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ━━━ FINAL CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="section--lg" style={{ textAlign: 'center' }}>
          <div className="wrap">
            <ScrollReveal>
              <RocketMark size={80} className="animate-float" />
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'var(--h1-size)',
                  lineHeight: 1.05,
                  marginTop: 'var(--space-2xl)',
                  letterSpacing: '-0.02em',
                }}
              >
                Your first app is 60 seconds away.
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'clamp(1rem, 2vw, 1.25rem)',
                  marginTop: 'var(--space-lg)',
                  maxWidth: 480,
                  margin: 'var(--space-lg) auto 0',
                }}
              >
                No review. No credit card. No one telling you it isn&apos;t ready.
              </p>
              <div style={{ marginTop: 'var(--space-2xl)' }}>
                <Link
                  href="/new"
                  className="btn-primary"
                  style={{ padding: '1rem 2.5rem', fontSize: 'clamp(1rem, 2vw, 1.125rem)' }}
                >
                  Deploy now →
                </Link>
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--caption-size)',
                  color: 'var(--text-light)',
                  marginTop: 'var(--space-xl)',
                }}
              >
                Or <Link href="/apps" style={{ color: 'var(--sunset)', textDecoration: 'underline' }}>browse apps already shipping →</Link>
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <footer className="footer">
          <div className="wrap">
            <div className="footer-grid">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 'var(--space-md)' }}>
                  <RocketMark size="sm" />
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem' }}>shippie</span>
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontStyle: 'italic',
                    fontSize: 'var(--small-size)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  No app store. Just the web, installed.
                </p>
                <div style={{ marginTop: 'var(--space-lg)' }}>
                  <a href="https://github.com/shippie/shippie" className="footer-link">GitHub</a>
                </div>
              </div>
              <div>
                <p className="footer-heading">Product</p>
                <Link href="/apps" className="footer-link">Explore</Link>
                <Link href="/examples" className="footer-link">Examples</Link>
                <Link href="/new" className="footer-link">Deploy</Link>
                <Link href="/why" className="footer-link">Why Shippie</Link>
              </div>
              <div>
                <p className="footer-heading">Build</p>
                <Link href="/docs/getting-started" className="footer-link">Getting started</Link>
                <Link href="/docs/sdk-reference" className="footer-link">SDK reference</Link>
                <Link href="/docs/self-hosting" className="footer-link">Self-hosting</Link>
              </div>
              <div>
                <p className="footer-heading">Community</p>
                <a href="https://github.com/shippie/shippie" className="footer-link">GitHub</a>
                <Link href="/CONTRIBUTING.md" className="footer-link">Contribute</Link>
              </div>
            </div>
            <div className="footer-bottom">
              <span>&copy; 2026 Shippie · AGPL · Made with sage and sunset</span>
              <span>Privacy · Terms · Security</span>
            </div>
          </div>
        </footer>
      </main>

      <InstallRuntime />
    </div>
  );
}

function LoopStep({ n, label, color, desc }: { n: string; label: string; color: string; desc: string }) {
  return (
    <div style={{ background: 'var(--bg)', padding: 'var(--space-xl)' }}>
      <div className="step-number" style={{ background: color }}>{n}</div>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', marginBottom: 'var(--space-sm)' }}>{label}</h3>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 'var(--small-size)' }}>{desc}</p>
    </div>
  );
}

function NotACard({ label, desc }: { label: string; desc: string }) {
  return (
    <div
      className="card reveal-child"
      style={{
        borderColor: 'var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--caption-size)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--sunset)',
        }}
      >
        ✗ {label}
      </p>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 'var(--small-size)' }}>
        {desc}
      </p>
    </div>
  );
}
