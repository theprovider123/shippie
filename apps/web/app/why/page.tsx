/**
 * /why — Maker economics page.
 *
 * Plain-text math making the Shippie-vs-alternatives case concrete.
 * See differentiation plan Pillar B4.
 */
import Link from 'next/link';
import { RocketMark } from '../components/rocket-mark';
import { ThemeToggle } from '../theme-toggle';
import { ScrollReveal } from '../components/scroll-reveal';
import { ComparisonMatrix } from '../components/comparison-matrix';

export const runtime = 'nodejs';

export const metadata = {
  title: 'Why Shippie — maker economics',
  description:
    'App Store takes 30% and 14 days. Shippie takes 0% and 60 seconds. Here is the math, and the reasons it adds up that way.',
};

export default function WhyPage() {
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
        {/* Hero */}
        <section className="section--lg">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <p className="section-label">The math</p>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--h1-size)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                marginBottom: 'var(--space-xl)',
              }}
            >
              Why Shippie.
            </h1>
            <p
              style={{
                fontSize: 'clamp(1.125rem, 2vw, 1.375rem)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              Not an argument. Just three numbers, plainly true, and rarely stated together.
            </p>
          </div>
        </section>

        {/* Three numbers */}
        <section className="section" style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="wrap">
            <div className="grid-3" style={{ gap: 'var(--space-xl)' }}>
              <ScrollReveal>
                <NumberCard
                  stat="$3,000"
                  heading="out of every $10k"
                  body="Apple keeps 30% of what your app earns on the App Store. Shippie takes 0%. If your app makes $10k/yr, you keep $10k/yr."
                />
              </ScrollReveal>
              <ScrollReveal>
                <NumberCard
                  stat="14 days"
                  heading="vs 60 seconds"
                  body="Median App Store review. Shippie median time-to-live: under a minute. That’s not a small difference — it’s a different job."
                />
              </ScrollReveal>
              <ScrollReveal>
                <NumberCard
                  stat="0 rejections"
                  heading="by design"
                  body="There’s no review queue on Shippie. Your app ships when you ship it. If it violates policy you get taken down — but nothing sits for a week waiting for permission."
                />
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* Side by side */}
        <section
          className="section"
          style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-pure)' }}
        >
          <div className="wrap">
            <ScrollReveal>
              <div className="section-intro">
                <p className="section-label">Side by side</p>
                <h2 className="section-heading">What each platform actually does.</h2>
                <p className="section-subheading">
                  No tool is strictly best. Pick the one whose constraints fit what you’re building.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <ComparisonMatrix />
            </ScrollReveal>
          </div>
        </section>

        {/* Why open source */}
        <section className="section" style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="wrap" style={{ maxWidth: 760 }}>
            <ScrollReveal>
              <p className="section-label">And why it’s open source</p>
              <h2 className="section-heading" style={{ fontSize: 'var(--h2-size)' }}>
                A platform you can leave.
              </h2>
              <div
                style={{
                  color: 'var(--text-secondary)',
                  lineHeight: 1.8,
                  marginTop: 'var(--space-xl)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-md)',
                }}
              >
                <p>
                  Platforms that host your audience have leverage over your work. We built Shippie so that leverage is always returnable.
                </p>
                <p>
                  The platform is AGPL-3.0. Self-host it. Fork it. Run your own instance on any box. Your apps are yours; your users install from a URL you own.
                </p>
                <p>
                  If Shippie ever does something you disagree with, the door out is short: change your DNS and keep shipping.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* CTA */}
        <section className="section--lg" style={{ textAlign: 'center' }}>
          <div className="wrap">
            <ScrollReveal>
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'var(--h1-size)',
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                }}
              >
                Ship the first one.
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  marginTop: 'var(--space-lg)',
                  maxWidth: 480,
                  margin: 'var(--space-lg) auto 0',
                }}
              >
                Drop a zip. Get a URL. Install it on your phone. See the math for yourself.
              </p>
              <div style={{ marginTop: 'var(--space-2xl)' }}>
                <Link
                  href="/"
                  className="btn-primary"
                  style={{ padding: '1rem 2.5rem', fontSize: 'clamp(1rem, 2vw, 1.125rem)' }}
                >
                  Try it now →
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>
    </div>
  );
}

function NumberCard({ stat, heading, body }: { stat: string; heading: string; body: string }) {
  return (
    <div
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
    >
      <p
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: 'var(--sunset)',
        }}
      >
        {stat}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--caption-size)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-light)',
        }}
      >
        {heading}
      </p>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 'var(--small-size)' }}>
        {body}
      </p>
    </div>
  );
}
