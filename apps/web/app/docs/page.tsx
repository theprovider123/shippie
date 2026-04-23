import Link from 'next/link';
import { SiteNav } from '../components/site-nav';

export const runtime = 'nodejs';

export const metadata = {
  title: 'Docs — Shippie',
  description:
    'Everything you need to ship an app on Shippie. Quick start, core concepts, the CLI, the SDK, and the platform under the hood.',
};

const SECTIONS = [
  {
    id: 'quickstart',
    title: 'Quick start',
    blurb: 'Ship something in 60 seconds — pick the surface that matches where your code is.',
  },
  {
    id: 'concepts',
    title: 'Core concepts',
    blurb: 'App types, deploys, install funnels, ratings, leaderboards — the vocabulary of the marketplace.',
  },
  {
    id: 'cli',
    title: 'CLI',
    blurb: '`shippie init`, `shippie deploy`, `shippie link`. A Bun-native CLI that treats the marketplace like git.',
  },
  {
    id: 'sdk',
    title: 'SDK',
    blurb: '`@shippie/sdk/wrapper` — 42 runtime exports for PWA installs, push, ratings, offline, and analytics.',
  },
  {
    id: 'platform',
    title: 'Platform',
    blurb: 'Cloudflare Workers runtime, Postgres control plane, signed webhook spine. The parts that run your apps.',
  },
];

export default function DocsPage() {
  return (
    <div className="grain">
      <SiteNav />
      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: 'var(--space-xl)',
          paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))',
          paddingBottom: 'var(--space-3xl)',
        }}
      >
        <header style={{ marginBottom: 'var(--space-2xl)' }}>
          <p className="eyebrow">Documentation</p>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
              letterSpacing: '-0.02em',
              margin: '0.25rem 0 var(--space-md)',
              lineHeight: 1.05,
            }}
          >
            Ship an app on Shippie.
          </h1>
          <p style={{ fontSize: 'var(--body-size)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 620 }}>
            Shippie turns a git repo into an installable PWA on a marketplace in under a minute.
            The guides below cover everything from the first deploy to the runtime internals —
            pick whichever page is the shortest path to what you&apos;re trying to do.
          </p>
        </header>

        <nav
          aria-label="Docs sections"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-3xl)' }}
        >
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="card" style={{ padding: 'var(--space-md)' }}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>{s.title}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--small-size)', lineHeight: 1.5, margin: 0 }}>
                {s.blurb}
              </p>
            </a>
          ))}
        </nav>

        <Section id="quickstart" title="Quick start">
          <p>Four paths, same result. Pick the shortest one for your codebase.</p>
          <Subsection title="Wrap an already-hosted app">
            <p>
              App already on Vercel, Netlify, Render, or your own server? Don&apos;t move
              it. Shippie adds a marketplace entry + PWA shell + install funnel, served
              via edge reverse-proxy at <code>{'{slug}'}.shippie.app</code>. Your backend
              stays where it runs best.
            </p>
            <Code
              lines={[
                'shippie wrap https://mevrouw.vercel.app --slug mevrouw',
                '',
                '# → live at https://mevrouw.shippie.app/',
                '# → Supabase/Auth0/Clerk: add this redirect URI:',
                '#   https://mevrouw.shippie.app/api/auth/callback',
              ]}
            />
            <p>
              Works with any PWA that responds over HTTPS: Next.js, Astro, Remix, Nuxt,
              Rails, Django, Go — anything.
            </p>
          </Subsection>
          <Subsection title="From a git repo (recommended)">
            <p>
              Install the GitHub App and point it at a repo. Shippie detects the framework, builds
              it on every push, and publishes an installable app to your slug. No Vercel account,
              no separate hosting, no App Store review.
            </p>
            <Link href="/new" className="btn-primary" style={{ marginTop: 'var(--space-sm)' }}>
              Connect a repo →
            </Link>
          </Subsection>
          <Subsection title="From your terminal">
            <Code
              lines={[
                '# one-time: authenticate the CLI',
                'bunx shippie login',
                '',
                '# from your project root',
                'shippie init   # detect framework, scaffold config',
                'shippie deploy # build + publish',
              ]}
            />
          </Subsection>
          <Subsection title="From the web">
            <p>
              Paste a GitHub URL at <Link href="/new">/new</Link>. Shippie handles the OAuth, the
              build, and the slug assignment. Useful when you&apos;re deploying from a phone or a
              Chromebook.
            </p>
          </Subsection>
        </Section>

        <Section id="concepts" title="Core concepts">
          <Concept name="App type">
            Every app is <code>app</code>, <code>web_app</code>, or <code>website</code>. The
            shelves on the home page and the default layouts (bottom tabs vs. top nav) come from
            this classification. Changeable at any time from the dashboard.
          </Concept>
          <Concept name="Deploy">
            A frozen, reproducible build of your app at a git SHA. Every push to the tracked branch
            creates a new deploy. Only the <code>active_deploy_id</code> on an app record is what
            users install — the rest are hot-standby for instant rollback.
          </Concept>
          <Concept name="Install funnel">
            Shippie measures <code>install_prompt_shown</code>,
            <code>install_prompt_accepted</code>, and first-session opens. These feed the
            trending shelf on <Link href="/leaderboards">/leaderboards</Link> and the funnel cards
            on your dashboard.
          </Concept>
          <Concept name="Rating">
            A 1–5 score with optional text review, bound to an installed device. The top-rated
            leaderboard requires at least three ratings so a single-star troll doesn&apos;t own the
            shelf.
          </Concept>
          <Concept name="Slug">
            Your URL, marketplace handle, and rating namespace all share one slug. Claim once,
            yours forever — transferable between repos from the dashboard.
          </Concept>
        </Section>

        <Section id="cli" title="CLI">
          <p>
            The CLI is a thin wrapper around the marketplace API — no hidden state, one config
            file (<code>shippie.toml</code>), readable output. Install with:
          </p>
          <Code lines={['bun add -g @shippie/cli', '# or', 'npm i -g @shippie/cli']} />
          <DefList
            rows={[
              ['shippie login', 'Device-code flow. Writes a token to ~/.shippie/auth.json.'],
              ['shippie init', 'Detect framework, scaffold shippie.toml, write .gitignore entries.'],
              ['shippie link', 'Attach a repo to an existing slug — swap between local directories without losing history.'],
              ['shippie deploy', 'Build + publish + activate. Skip build if SHA is already deployed.'],
              ['shippie rollback', 'Flip the active_deploy_id to a previous deploy. Instant, no rebuild.'],
              ['shippie logs', 'Tail runtime + build logs from the Worker.'],
            ]}
          />
        </Section>

        <Section id="sdk" title="SDK">
          <p>
            <code>@shippie/sdk/wrapper</code> is a framework-agnostic runtime for PWA behaviour
            and platform integration. It&apos;s installed automatically on every deploy, but you
            can opt into pieces of it directly:
          </p>
          <Code
            lines={[
              "import { enableInstallPrompt, subscribeToPush, postRating } from '@shippie/sdk/wrapper';",
              '',
              'await enableInstallPrompt({ onAccept: () => track("install") });',
              'await subscribeToPush({ topics: ["updates"] });',
              'await postRating({ score: 5, body: "ships on my phone, worth it" });',
            ]}
          />
          <DefList
            rows={[
              ['Install prompt', 'Cross-browser install funnel — native where supported, iOS Chrome guide where it isn\'t.'],
              ['Push', 'VAPID-signed Web Push with topic subscriptions. Fanout lives in the control plane.'],
              ['Ratings', 'Installed-device-bound ratings, one per user per app, optimistic UI.'],
              ['Offline', 'Opinionated service-worker runtime caches + background sync queues for POSTs.'],
              ['Analytics', 'Trace-id-tagged events to /api/ingest — the same pipeline that powers leaderboards.'],
            ]}
          />
        </Section>

        <Section id="platform" title="Platform">
          <p>
            Apps run on Cloudflare Workers. Metadata, ratings, sessions, deploys, and webhook state
            live in Postgres 16. The two are stitched by a signed-request spine so every
            API call from a Worker to the control plane is authenticated end-to-end.
          </p>
          <DefList
            rows={[
              ['Runtime', 'Cloudflare Worker per app, one KV namespace for static assets, Durable Objects for rate limits.'],
              ['Control plane', 'Next.js 16 on Vercel, Postgres 16, Drizzle ORM, Auth.js magic links.'],
              ['Install attribution', 'Signed short-lived token on the install prompt so accepts can\'t be spoofed.'],
              ['Rollback', 'Active deploy id is a single column swap. No DNS, no cache warmup.'],
              ['Limits', '300s function timeout, 4MB request body, 25MB per deploy. Lift with a support request.'],
            ]}
          />
        </Section>

        <footer
          style={{
            marginTop: 'var(--space-3xl)',
            paddingTop: 'var(--space-xl)',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-md)',
            justifyContent: 'space-between',
            color: 'var(--text-light)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}
        >
          <span>Missing something? File an issue on{' '}
            <a href="https://github.com/shippie/shippie" style={{ color: 'var(--sunset)' }}>
              github.com/shippie/shippie
            </a>.
          </span>
          <span>v0.1 — docs are a work in progress</span>
        </footer>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 'var(--space-3xl)', scrollMarginTop: 'calc(var(--nav-height) + var(--safe-top) + 20px)' }}>
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
          letterSpacing: '-0.02em',
          paddingBottom: 'var(--space-sm)',
          borderBottom: '1px solid var(--border-light)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        {title}
      </h2>
      <div className="docs-prose" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {children}
      </div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'var(--space-sm)' }}>
      <h3 style={{ fontWeight: 600, fontSize: 'var(--body-size)', margin: '0 0 var(--space-sm)' }}>{title}</h3>
      {children}
    </div>
  );
}

function Concept({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, 180px) 1fr',
        gap: 'var(--space-lg)',
        paddingBottom: 'var(--space-md)',
        borderBottom: '1px dashed var(--border-light)',
      }}
      className="docs-concept-row"
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--sunset)', letterSpacing: '0.02em' }}>
        {name}
      </div>
      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function DefList({ rows }: { rows: [string, string][] }) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, 220px) 1fr',
        gap: 'var(--space-sm) var(--space-lg)',
        margin: 'var(--space-sm) 0 0',
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{k}</dt>
          <dd style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Code({ lines }: { lines: string[] }) {
  return (
    <pre
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-light)',
        padding: 'var(--space-md)',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--text-primary)',
        overflow: 'auto',
        lineHeight: 1.6,
      }}
    >
      <code>{lines.join('\n')}</code>
    </pre>
  );
}
