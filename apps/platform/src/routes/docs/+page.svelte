<script lang="ts">
  /**
   * Docs landing — single-page anchor structure. Leads with the Local Tool
   * promise, then maker entry paths and the source/remix story.
   */

  const pillars = [
    {
      id: 'wrap',
      label: 'Local',
      blurb:
        'Public Shippie tools are expected to keep primary user data on the device by default, with no hidden login, tracker, or third-party user-data store.',
    },
    {
      id: 'run',
      label: 'Build',
      blurb:
        'Use one-line local database, local files, local AI, intents, and secure backup without provisioning a backend.',
    },
    {
      id: 'connect',
      label: 'Connect',
      blurb:
        'Tools can share local signals with each other and use encrypted Shippie relay when live collaboration needs it.',
    },
  ];

  const userSections = [
    {
      id: 'what-local-means',
      title: 'Where data lives',
      blurb:
        'On Shippie, primary user data stays on the device by default. Reference data can come in, and user data should not go out unless you explicitly export, back up, sync, join an encrypted relay, or connect a disclosed service.',
    },
    {
      id: 'your-data',
      title: 'Your data — where it lives, who sees it',
      blurb:
        'Tap "Your data" inside any tool to see what is stored on this device, what connections are disclosed, and which export, restore, backup, or wipe controls that tool supports. The default local path does not store app content on Shippie servers; optional backup, sync, relay, and private spaces are shown separately.',
    },
    {
      id: 'no-signup',
      title: 'No signup needed (most of the time)',
      blurb:
        'Tools open and work without an account. Sign in only when you want to ship your own tool, sync saved tools across devices, or join a private space someone invited you to.',
    },
  ];
</script>

<svelte:head>
  <title>Docs · Shippie</title>
  <meta
    name="description"
    content="Build local tools on Shippie: one-line local database, no external login, no third-party user-data storage, and deploy paths that enforce the promise."
  />
</svelte:head>

<main class="docs-page">
  <header class="head">
    <p class="eyebrow">
      <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
      Documentation
    </p>
    <h1 class="title">Local tools that know each other.</h1>
    <p class="lede">
      If it is on Shippie, data movement is visible. Build tools with one-line local
      database, zero backend setup, secure backup as continuity, and deploy paths that
      disclose outside connections before publish. Quiet local tools stay visually quiet;
      Shippie only raises a signal when something extra is connected.
    </p>
  </header>

  <a class="paper-card" href="/whitepaper">
    <div class="paper-card-meta">
      <p class="paper-eyebrow">Whitepaper · the long read</p>
      <h2>Build on Shippie</h2>
      <p class="paper-blurb">
        The category: cloud platforms deploy cloud apps, Netlify deploys static sites,
        Shippie deploys local tools. Start here if you want the why before the how.
      </p>
    </div>
    <span class="paper-cta">Read the whitepaper →</span>
  </a>

  <section class="pillars" aria-label="Local tool principles">
    {#each pillars as p (p.id)}
      <article class="pillar">
        <p class="pillar-eyebrow">{p.label}</p>
        <p class="pillar-blurb">{p.blurb}</p>
      </article>
    {/each}
  </section>

  <nav class="nav-cards" aria-label="On this page">
    <a href="#for-users" class="nav-card">
      <p class="card-eyebrow">For users</p>
      <p class="card-blurb">Open tools, save them, see where your data lives.</p>
    </a>
    <a href="#for-builders" class="nav-card">
      <p class="card-eyebrow">For builders</p>
      <p class="card-blurb">Quickstart, SDK, wrapper, spaces, local runtime, GitHub deploys.</p>
    </a>
    <a href="#remix" class="nav-card">
      <p class="card-eyebrow">Remix</p>
      <p class="card-blurb">How to enable remix on your app, and how to fork someone else’s.</p>
    </a>
    <a href="#open-source" class="nav-card">
      <p class="card-eyebrow">Open source</p>
      <p class="card-blurb">License positions, self-hosting, what is AGPL and what is MIT.</p>
    </a>
  </nav>

  <section id="for-users" class="section">
    <h2>For users</h2>
      <p class="section-lede">
      You don’t need an account, a download, or a credit card to use Shippie. Open a tool. If
      you like it, save it. Your data controls stay close by.
    </p>
    {#each userSections as s (s.id)}
      <h3 id={s.id}>{s.title}</h3>
      <p>{s.blurb}</p>
    {/each}
  </section>

  <section id="for-builders" class="section">
    <h2>For builders</h2>
    <p class="section-lede">
      Ship a local tool in under a minute. Pick the shortest path to a live URL, then come back
      to layer in haptics, local data, intents, secure backup, and proof — mostly automatic.
    </p>

    <h3 id="getting-started">Getting started</h3>
    <p>Three entry paths, same policy scanner. Pick the shortest one for your codebase.</p>

    <h4>Drop a zip in the browser</h4>
    <p>
      Visit <a href="/new">/new</a> and drag in a built local tool. We unpack it, scan it for
      local-tool eligibility, wire the wrapper, and put it live.
    </p>
    <pre class="code"># dist/, build/, out/, or a single HTML file all work
shippie deploy ./dist

# → live at https://your-app.shippie.app/</pre>

    <h4>Push from the CLI or MCP</h4>
    <p>
      CLI and MCP use the same deploy API as the browser zip upload. If Supabase, Firebase,
      Auth0, analytics, ad code, insecure connections, or bundled secrets are detected, the
      deploy is blocked with conversion guidance. External services are allowed by default
      when they can be disclosed cleanly.
    </p>

    <h4>Convert a hosted app</h4>
    <p>
      Hosted URL wraps are retired for marketplace publishing. Convert user data paths to
      <code>shippie.local.db</code> and <code>shippie.local.files</code>, then upload the built bundle.
    </p>

    <h4>Connect a GitHub repo</h4>
    <p>
      For automated builds on every push. We clone, install, build, and upload — typically in
      2–5 minutes. Slower than direct zip uploads, but you don’t have to think about it.
    </p>

    <h3 id="sdk">SDK</h3>
    <p>
      The maker entry point is <code>@shippie/sdk</code>. Store records with
      <code>shippie.local.db.save()</code>, list them with <code>shippie.local.db.list()</code>,
      write attachments with <code>shippie.local.files</code>, and broadcast useful local signals
      with Shippie intents.
    </p>
    <pre class="code">import &#123; shippie &#125; from '@shippie/sdk';

await shippie.local.db.save('receipts', receipt);
const receipts = await shippie.local.db.list('receipts');</pre>
    <p>
      <code>@shippie/sdk/wrapper</code> is the runtime injected into every Shippie-hosted page. It
      provides the device-ready shell, push subscriptions, ratings UI, offline coordination, and a
      structured event spine that flows back to the marketplace.
    </p>
    <p>
      Every export is opt-in. The base wrapper is &lt;5kb gzipped. Add features by importing them.
      Full reference moves into <code>/docs/sdk</code> in a later cut — until then, the README
      in
      <a href="https://github.com/theprovider123/shippie/tree/main/packages/sdk">packages/sdk</a> is the
      source of truth.
    </p>

    <h3 id="wrapper">Wrapper</h3>
    <p>
      The wrapper is the HTML rewriter that runs at the edge. It injects the PWA manifest, the
      service worker registration, the SDK runtime, and device-ready support — without touching
      your bundled code.
    </p>
    <p>
      Wrapper config lives in a tiny <code>shippie.json</code> at the root of your deploy. App
      name, theme colour, icon path, and any opt-in capability flags. Sensible defaults for every
      field.
    </p>

    <h3 id="private-spaces">Private spaces</h3>
    <p>
      A private space is Shippie’s shared context for a tool: a room, class, household, team,
      trip, or match-day group. Builders do not write account systems to use it. They declare the
      roles their app understands, then Shippie generates signed invite links and QR codes that
      carry only that scoped access.
    </p>
    <p>
      The public app can stay listed on the marketplace while each space stays private to the
      people holding its link. Shippie can count joins and archive a space, but the space content
      stays sealed to the members and devices that hold the keys.
    </p>

    <h3 id="local-runtime">Local Runtime</h3>
    <p>
      The same edge worker runs locally via <code>wrangler dev</code>. D1 has a local SQLite mode,
      R2 has a filesystem-backed mode, KV has an in-memory mode. Your dev loop hits the same
      bindings the production worker does — no Docker, no cloud round-trips.
    </p>

    <h3 id="auto-deploys">GitHub auto-deploys (the honest version)</h3>
    <p>
      Connect a GitHub repo to a Shippie app and every push triggers a build. We clone the repo,
      install dependencies, run your build script, and upload the output to R2. Typical
      end-to-end time: <strong>2–5 minutes</strong>. The cold runner is the floor; npm
      install variance is the spread.
    </p>
    <p>
      If you need under-a-minute deploys for a GitHub-tracked project, set up a CI step that ships the
      built artifact via <code>shippie deploy ./dist</code>. Same speed as the web upload.
    </p>
  </section>

  <section id="remix" class="section remix-section">
    <h2>Remix</h2>
    <p class="section-lede">
      Shippie apps can be remixable. If the maker has flagged it on, anyone can fork the source,
      tweak it for their niche, and ship the result back to the marketplace under a new slug
      — through the same local-tool scanner as the original. This is how good ideas become good
      ideas for everyone.
    </p>

    <h3 id="remix-look-for">What "remixable" looks like</h3>
    <p>
      Every public app page shows an <strong>Open source</strong> badge and a
      <strong>Remix this</strong> button when three conditions are met:
    </p>
    <ul>
      <li>The maker has published a <code>sourceRepo</code> (a public GitHub URL).</li>
      <li>The maker has selected an OSI-recognised <code>license</code>.</li>
      <li>The maker has flipped <code>remixAllowed</code> on in their app profile.</li>
    </ul>
    <p>
      All three are per-app, controlled by the maker. A Shippie listing without that trio is
      hosted on Shippie but not fork-friendly — the maker is welcome to enable it later.
    </p>

    <h3 id="remix-flow">How to remix someone else’s app</h3>
    <ol>
      <li>Open the app’s page and click <strong>Remix this</strong>.</li>
      <li>
        Shippie sends you to <a href="/new"><code>/new?remix=&lt;slug&gt;</code></a> with the
        source repo, license, and starter config pre-filled.
      </li>
      <li>
        Fork the repo on GitHub (one click), make your changes, then ship it: zip upload, CLI, or
        re-connect the fork for auto-deploy. The remix lands at
        <code>&lt;slug&gt;-remix</code> by default and you can rename it freely.
      </li>
    </ol>
    <pre class="code"># CLI shortcut after a one-click fork
shippie deploy ./dist --slug my-recipe-saver --remix recipe-saver</pre>
    <p>
      Lineage is recorded automatically. Your remix page links back to the original; the original
      shows a count of remixes downstream. Credit travels with the code.
    </p>

    <h3 id="remix-enable">How to enable remix on your own app</h3>
    <ol>
      <li>Open your app in the maker dashboard.</li>
      <li>
        Under <strong>Profile</strong>, set the <strong>Source repo</strong> to a public GitHub
        URL.
      </li>
      <li>Pick a <strong>License</strong> (MIT, Apache-2.0, AGPL-3.0, etc.).</li>
      <li>Tick <strong>Allow remixes</strong>.</li>
    </ol>
    <p>
      That’s it — the badge and the Remix button appear on your public page within
      seconds. Toggle it off at any time and the affordances disappear for new visitors; existing
      remixes continue to exist on their own.
    </p>

    <h3 id="remix-why">Why this matters</h3>
    <p>
      One vibe-coded recipe saver becomes ten: a sourdough version, a vegan version, a
      restaurant-staff version, a five-ingredient version. The same code skeleton, niche-tuned by
      people closer to the niche than the original maker could ever be. Software diversity used
      to require a fork on a hidden engineering team’s back-burner. On Shippie it’s a button.
    </p>
  </section>

  <section id="open-source" class="section">
    <h2>Open source</h2>
    <p class="section-lede">
      The whole platform — control plane, edge worker, SDK, CLI, container, AI iframe —
      lives at
      <a href="https://github.com/theprovider123/shippie">github.com/theprovider123/shippie</a>. Fork it, deploy
      it, run it on your own Cloudflare account. Nothing is hidden behind a paid tier.
    </p>

    <h3 id="licenses">License positions</h3>
    <p>
      Two licenses, picked deliberately so the platform can federate and the SDK can spread:
    </p>
    <table class="license-table">
      <thead>
        <tr><th>What</th><th>License</th><th>Why</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Platform &middot; edge worker &middot; AI iframe &middot; Hub</td>
          <td>AGPL-3.0</td>
          <td>
            Fork and self-host freely; network-accessible modifications must publish under the
            same license. The platform is the part worth federating.
          </td>
        </tr>
        <tr>
          <td>SDK &middot; CLI &middot; MCP server &middot; shared types &middot; templates</td>
          <td>MIT</td>
          <td>
            Link into your apps without constraint. The SDK is the part that should spread to
            every project, including closed-source ones.
          </td>
        </tr>
      </tbody>
    </table>

    <h3 id="self-hosting">Self-hosting</h3>
    <p>
      You’ll need a Cloudflare account, a domain you control, and the patience to register
      OAuth clients with GitHub and (optionally) Google. The hosted Shippie costs $5–10/month
      at our scale; your bill will be similar or smaller depending on traffic.
    </p>
    <p>
      Walkthrough: see
      <a href="https://github.com/theprovider123/shippie/blob/main/docs/self-hosting.md">docs/self-hosting.md</a>
      in the repo. Stale sections are flagged at the top — follow the Cloudflare-only path,
      not the legacy Postgres one.
    </p>

    <h3 id="contributing">Contributing</h3>
    <p>
      Issues, PRs, and discussions live on GitHub. The repo has a top-level
      <code>CONTRIBUTING.md</code> and active maintainers. Small fixes get merged within days;
      bigger architecture changes get a design-doc round first.
    </p>
  </section>

  <footer class="docs-footer">
    <p>
      Still reading? <a href="/whitepaper">The whitepaper</a> goes deeper on the thesis and the
      composition. <a href="https://github.com/theprovider123/shippie">The repo</a> goes deeper on the
      code. <a href="/new">Ship something</a> goes deeper on first-hand evidence.
    </p>
  </footer>
</main>

<style>
  .docs-page {
    max-width: 880px;
    margin: 0 auto;
    padding: var(--space-2xl) clamp(1.5rem, 4vw, 3rem) var(--space-3xl);
  }
  .head { margin-bottom: var(--space-xl); }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0;
  }
  .eyebrow img { display: block; }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 5vw, 3rem);
    letter-spacing: 0;
    margin: 0.25rem 0 var(--space-md);
    line-height: 1.05;
  }
  .lede {
    font-size: var(--body-size);
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 620px;
    margin: 0;
  }

  /* Whitepaper hero card — lives directly under the head, the first
     decisive next-tap for anyone curious about the thesis. */
  .paper-card {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: var(--space-lg);
    margin: var(--space-xl) 0 var(--space-2xl);
    padding: var(--space-xl) var(--space-lg);
    background: linear-gradient(135deg, var(--surface-elevated), var(--surface));
    border: 1px solid var(--sunset);
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s var(--ease-out), background 0.15s var(--ease-out);
  }
  .paper-card:hover { background: var(--surface-alt); border-color: var(--sunset-hover); }
  .paper-card:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }
  .paper-eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    color: var(--sunset);
  }
  .paper-card h2 {
    margin: 6px 0 8px;
    font-family: var(--font-heading);
    font-size: clamp(1.6rem, 3vw, 2.25rem);
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.1;
  }
  .paper-blurb {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--body-size);
    line-height: 1.55;
    max-width: 56ch;
  }
  .paper-cta {
    align-self: end;
    display: inline-flex;
    align-items: center;
    padding: 10px 16px;
    background: var(--sunset);
    color: #fff;
    font-weight: 600;
    white-space: nowrap;
    min-height: var(--touch-min);
  }
  @media (max-width: 640px) {
    .paper-card {
      grid-template-columns: 1fr;
      align-items: start;
    }
    .paper-cta { justify-self: stretch; justify-content: center; }
  }

  /* Pillars are principles, not navigation. Drop the card chrome so
     they read as content blocks (label + body) separated by space, not
     as four clickable tiles. The big serif label + sunset accent does
     the visual work — no border needed. */
  .pillars {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-2xl);
    padding: var(--space-lg) 0;
    border-top: 1px solid var(--border-light);
    border-bottom: 1px solid var(--border-light);
  }
  .pillar {
    padding: 0;
    background: transparent;
    border: 0;
  }
  .pillar-eyebrow {
    margin: 0 0 8px;
    font-family: var(--font-heading);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--sunset);
  }
  .pillar-blurb {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.55;
  }

  /* Nav-cards are navigation. Keep the card chrome; add an arrow
     glyph + hover translate so the link affordance reads at a glance.
     Pillars vs nav-cards now resolve in <100ms: pillars = open block,
     nav-cards = bordered tile with an arrow pulling toward its anchor. */
  .nav-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-3xl);
  }
  .nav-card {
    position: relative;
    padding: var(--space-md) var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
    min-height: var(--touch-min);
    text-decoration: none;
  }
  .nav-card::after {
    content: '↘';
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--text-light);
    transition: color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
  }
  .nav-card:hover {
    border-color: var(--sunset);
    transform: translateY(-1px);
  }
  .nav-card:hover::after {
    color: var(--sunset);
    transform: translate(2px, -2px);
  }
  .nav-card:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }
  .card-eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    color: var(--text-light);
    margin: 0 0 4px;
  }
  .card-blurb {
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.5;
    margin: 0;
  }

  .section {
    margin-bottom: var(--space-2xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--border-light);
    scroll-margin-top: calc(var(--nav-height) + var(--space-md));
  }
  .section h2 {
    font-family: var(--font-heading);
    font-size: 1.75rem;
    letter-spacing: 0;
    margin: 0 0 var(--space-md);
  }
  .section h3 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    letter-spacing: 0;
    margin: var(--space-lg) 0 var(--space-xs);
    scroll-margin-top: calc(var(--nav-height) + var(--space-md));
  }
  .section h4 {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 600;
    margin: var(--space-md) 0 var(--space-xs);
    color: var(--sage-leaf);
  }
  .section p,
  .section ul,
  .section ol {
    color: var(--text-secondary);
    line-height: 1.7;
    margin: 0 0 var(--space-md);
  }
  .section ul,
  .section ol { padding-left: 1.5rem; }
  .section li { margin-bottom: 6px; }
  .section li > strong:first-child { color: var(--sage-leaf); }
  .section-lede {
    font-size: 1.05rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-md);
    max-width: 64ch;
  }
  .section a {
    color: var(--sunset);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .section code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    background: var(--surface);
    padding: 1px 6px;
    border: 1px solid var(--border-light);
  }
  .code {
    background: var(--bg-pure);
    border: 1px solid var(--border-light);
    padding: var(--space-md);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    line-height: 1.7;
    overflow-x: auto;
    color: var(--text);
  }

  .remix-section {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: var(--space-xl) var(--space-lg);
  }
  .remix-section h2 { color: var(--sunset); }

  .license-table {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-md) 0 var(--space-lg);
    font-size: var(--small-size);
  }
  .license-table th,
  .license-table td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: top;
    color: var(--text-secondary);
  }
  .license-table th {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--text-light);
    text-transform: uppercase;
    border-bottom-color: var(--border);
  }
  .license-table td:nth-child(2) {
    font-family: var(--font-mono);
    color: var(--sage-leaf);
    white-space: nowrap;
  }

  .docs-footer {
    margin-top: var(--space-2xl);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border-light);
    color: var(--text-light);
    font-size: var(--small-size);
    line-height: 1.6;
  }
  .docs-footer a {
    color: var(--sunset);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
