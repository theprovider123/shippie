<script lang="ts">
  // Minimal docs landing — structure ported from apps/web/app/docs/page.tsx,
  // copy lifted verbatim where the source had it. Each section is a stub:
  // 2-3 paragraphs, polish in a follow-up.
  const sections = [
    {
      id: 'getting-started',
      title: 'Getting started',
      blurb: 'Ship something in 60 seconds — pick the surface that matches where your code is.',
    },
    {
      id: 'sdk',
      title: 'SDK',
      blurb: '@shippie/sdk/wrapper — runtime exports for PWA installs, push, ratings, offline, and analytics.',
    },
    {
      id: 'wrapper',
      title: 'Wrapper',
      blurb: 'The HTML rewriter that injects the manifest, service worker, and SDK at the edge.',
    },
    {
      id: 'local-runtime',
      title: 'Local Runtime',
      blurb: 'Run apps locally against the same edge worker. Zero-cost dev loop with real bindings.',
    },
    {
      id: 'self-hosting',
      title: 'Self-hosting',
      blurb: 'Run your own instance. AGPL-3.0. No vendor lock-in.',
    },
    {
      id: 'auto-deploys',
      title: 'GitHub auto-deploys',
      blurb: 'Connect a repo — we clone and build on every push. Honestly slower than zip uploads.',
    },
  ];
</script>

<svelte:head>
  <title>Docs — Shippie</title>
  <meta
    name="description"
    content="Everything you need to ship an app on Shippie. Getting started, the SDK, the wrapper, the local runtime, and self-hosting."
  />
</svelte:head>

<main class="docs-page">
  <header class="head">
    <p class="eyebrow">Documentation</p>
    <h1 class="title">Ship an app on Shippie.</h1>
    <p class="lede">
      Shippie turns a git repo (or a zip, or a URL) into an installable PWA on a marketplace in
      under a minute. The sections below cover everything from the first deploy to the runtime
      internals — pick whichever is the shortest path to what you're trying to do.
    </p>
  </header>

  <nav class="nav-cards" aria-label="Docs sections">
    {#each sections as s (s.id)}
      <a href={`#${s.id}`} class="nav-card">
        <p class="card-eyebrow">{s.title}</p>
        <p class="card-blurb">{s.blurb}</p>
      </a>
    {/each}
  </nav>

  <section id="getting-started" class="section">
    <h2>Getting started</h2>
    <p>
      Four paths, same result. Pick the shortest one for your codebase.
    </p>
    <h3>Wrap an already-hosted app</h3>
    <p>
      App already on Vercel, Netlify, Render, or your own server? Don't move it. Shippie adds a
      marketplace entry, a PWA shell, and an install funnel via edge reverse-proxy at
      <code>{'{slug}'}.shippie.app</code>. Your backend stays where it runs best.
    </p>
    <pre class="code">shippie wrap https://your-app.vercel.app --slug your-app

# → live at https://your-app.shippie.app/</pre>
    <h3>Drop a zip in the browser</h3>
    <p>
      Visit <a href="/new">/new</a> and drag a zip of your built site into the drop zone. We unpack
      it to R2, register the slug, wire up the wrapper, and the URL goes live in under a minute.
    </p>
    <h3>Push from the CLI</h3>
    <p>
      <code>shippie ship</code> from any project directory. Detects the build output, zips it, and
      uploads with the same 60-second SLA as the web flow.
    </p>
    <h3>Connect a GitHub repo</h3>
    <p>
      For automated builds on every push. We clone, install, build, and upload — typically in 2–5
      minutes. Slower than zip uploads, but you don't have to think about it.
    </p>
  </section>

  <section id="sdk" class="section">
    <h2>SDK</h2>
    <p>
      <code>@shippie/sdk/wrapper</code> is the runtime injected into every Shippie-hosted page. It
      provides install prompts, push subscriptions, ratings UI, offline coordination, and a
      structured event spine that flows back to the marketplace.
    </p>
    <p>
      Every export is opt-in. The base wrapper is &lt;5kb gzipped. Add features by importing them.
    </p>
    <p>
      The SDK reference moves here in a follow-up — until then, the README in
      <a href="https://github.com/shippie/shippie/tree/main/packages/sdk">packages/sdk</a> is the
      source of truth.
    </p>
  </section>

  <section id="wrapper" class="section">
    <h2>Wrapper</h2>
    <p>
      The wrapper is the HTML rewriter that runs at the edge. It injects the PWA manifest, the
      service worker registration, the SDK runtime, and the install funnel — without touching your
      bundled code.
    </p>
    <p>
      Wrapper config lives in a tiny <code>shippie.json</code> at the root of your deploy. App name,
      theme color, icon path, and any opt-in capability flags. We have sensible defaults for every
      field.
    </p>
  </section>

  <section id="local-runtime" class="section">
    <h2>Local Runtime</h2>
    <p>
      The same edge worker runs locally via <code>wrangler dev</code>. D1 has a local SQLite mode,
      R2 has a filesystem-backed mode, KV has an in-memory mode. Your dev loop hits the same
      bindings the production worker does.
    </p>
    <p>
      No Docker, no cloud round-trips, no separate dev server. Run <code>bun dev</code> in
      <code>apps/platform/</code> and you're testing against the real wrapper.
    </p>
  </section>

  <section id="self-hosting" class="section">
    <h2>Self-hosting</h2>
    <p>
      Shippie is AGPL-3.0. The whole platform — control plane, edge worker, SDK, CLI — is on
      GitHub at <a href="https://github.com/shippie/shippie">shippie/shippie</a>. Fork it, deploy
      it, run it on your own Cloudflare account.
    </p>
    <p>
      You'll need a Cloudflare account, a domain you control, and the patience to register OAuth
      clients with GitHub and (optionally) Google. The hosted Shippie costs $5–10/month at our
      scale; your bill will be similar or smaller depending on traffic.
    </p>
  </section>

  <section id="auto-deploys" class="section">
    <h2>GitHub auto-deploys (the honest version)</h2>
    <p>
      Connect a GitHub repo to a Shippie app and every push triggers a build. We clone the repo on
      a fresh GitHub Actions runner, install dependencies, run your build script, and upload the
      output to R2.
    </p>
    <p>
      Typical end-to-end time: <strong>2–5 minutes</strong>. The cold runner is the floor; npm
      install variance is the spread. We don't claim sub-60-second auto-deploys — that path is the
      direct zip upload, where there's no clone or install to do.
    </p>
    <p>
      If you need 60-second deploys for a GitHub-tracked project, set up a CI step that ships the
      built artifact via <code>shippie ship</code>. Same speed as the web upload.
    </p>
  </section>
</main>

<style>
  .docs-page {
    max-width: 880px;
    margin: 0 auto;
    padding: var(--space-2xl) clamp(1.5rem, 4vw, 3rem) var(--space-3xl);
  }
  .head { margin-bottom: var(--space-2xl); }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0;
  }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2.2rem, 5vw, 3.4rem);
    letter-spacing: -0.02em;
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

  .nav-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-3xl);
  }
  .nav-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    transition: border-color 0.2s;
  }
  .nav-card:hover { border-color: var(--sunset); }
  .card-eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
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
  }
  .section h2 {
    font-family: var(--font-heading);
    font-size: 1.75rem;
    letter-spacing: -0.01em;
    margin: 0 0 var(--space-md);
  }
  .section h3 {
    font-family: var(--font-heading);
    font-size: 1.125rem;
    margin: var(--space-lg) 0 var(--space-xs);
  }
  .section p {
    color: var(--text-secondary);
    line-height: 1.7;
    margin: 0 0 var(--space-md);
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
    border-radius: 8px;
    padding: var(--space-md);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    line-height: 1.7;
    overflow-x: auto;
    color: var(--text);
  }
</style>
