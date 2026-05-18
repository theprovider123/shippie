<script lang="ts">
  import EntryNav from '$lib/components/layout/EntryNav.svelte';
  import UploadForm from './upload-form.svelte';
  import WrapForm from './wrap-form.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const remixApp = $derived(data.remix?.ok ? data.remix.app : null);
  const remixSlug = $derived(remixApp ? `${remixApp.slug}-remix` : 'recipes');
  const forkUrl = $derived(
    remixApp?.sourceRepo.includes('github.com/') ? `${remixApp.sourceRepo.replace(/\/$/, '')}/fork` : null,
  );

  const checks = [
    'Detects framework output and app kind',
    'Blocks hard security failures before publish',
    'Writes an App Flight Recorder export',
    'Checks declared App Policy when present',
    'Keeps URL ownership and container eligibility separate',
  ];

  const paths = $derived([
    {
      label: 'I have a built folder',
      action: data.user ? 'Zip it and upload here' : 'Drop a zip, no sign-in',
      time: 'about 60s',
    },
    {
      label: 'It is already hosted',
      action: data.user ? 'Wrap the URL' : 'Sign in to wrap a URL',
      time: 'about 60s',
    },
    { label: 'I am in my editor', action: 'Use CLI or MCP', time: 'about 60s' },
    { label: 'I want repo deploys', action: 'Connect GitHub after first ship', time: '2-5min' },
  ]);
</script>

<svelte:head><title>Ship a new app · Shippie</title></svelte:head>

<main class="page">
  <div class="container">
    <EntryNav actions={[{ href: '/apps', label: 'Browse tools' }]} />

    <header class="hero">
      <div>
        <img
          src="/__shippie-pwa/icon.svg"
          alt=""
          width="56"
          height="56"
          class="header-mark"
          aria-hidden="true"
        />
        <p class="eyebrow">Maker console</p>
        <h1>{remixApp ? `Remix ${remixApp.name}.` : 'Ship your first app in under a minute.'}</h1>
        <p class="lede">
          {#if remixApp}
            Fork the source with GitHub, or upload your improved build directly. Shippie keeps the parent app,
            version, license, and attribution attached to your remix.
          {:else}
            Upload a build, wrap a live URL, or let CLI/MCP send it from your editor.
            Shippie checks the app, gives you a phone QR, and records what happened without seeing user data.
          {/if}
        </p>
      </div>
      <div class="hero-status" aria-label="Deploy checks">
        <p class="status-kicker">Every deploy gets</p>
        <ul>
          {#each checks as check (check)}
            <li>{check}</li>
          {/each}
        </ul>
      </div>
    </header>

    {#if data.remix && !data.remix.ok}
      <section class="remix-panel unavailable" aria-label="Remix unavailable">
        <div>
          <p class="eyebrow">Remix unavailable</p>
          <h2>{data.remix.reason}</h2>
        </div>
        <a href="/apps">Browse remixable apps</a>
      </section>
    {:else if remixApp}
      <section class="remix-panel" aria-label="Remix source">
        <div>
          <p class="eyebrow">Source app</p>
          <h2>{remixApp.name}</h2>
          {#if remixApp.tagline}<p>{remixApp.tagline}</p>{/if}
          <p class="meta-line">
            {remixApp.license}
            {#if remixApp.latestVersion} · v{remixApp.latestVersion}{/if}
          </p>
        </div>
        <div class="remix-actions">
          <a href={remixApp.sourceRepo} target="_blank" rel="noopener">Open source</a>
          {#if forkUrl}
            <a href={forkUrl} target="_blank" rel="noopener">Fork on GitHub</a>
          {/if}
        </div>
      </section>
    {/if}

    <section class="starter-row" aria-labelledby="starter-row-title">
      <p class="eyebrow">Start from</p>
      <h2 id="starter-row-title">Pick a starting point.</h2>
      <ul class="starter-list" role="list">
        <li>
          <a href="#quick-ship">
            <strong>Blank tool</strong>
            <span>Upload a zip from anywhere.</span>
          </a>
        </li>
        <li>
          <a href="/apps/recipe">
            <strong>Remix an existing tool</strong>
            <span>Fork Recipe Saver, Coffee, Lift…</span>
          </a>
        </li>
        <li>
          <a href="/docs/cli">
            <strong>From your CLI / MCP</strong>
            <span>Push from VS Code, Cursor, the terminal.</span>
          </a>
        </li>
        <li>
          <a href="#wrap-url">
            <strong>Wrap an existing URL</strong>
            <span>Make a hosted site installable.</span>
          </a>
        </li>
      </ul>
    </section>

    <section class="path-chooser" aria-labelledby="choose-path">
      <div>
        <p class="eyebrow">Choose a path</p>
        <h2 id="choose-path">Start with the thing you already have.</h2>
      </div>
      <ol>
        {#each paths as path (path.label)}
          <li>
            <span>{path.label}</span>
            <strong>{path.action}</strong>
            <small>{path.time}</small>
          </li>
        {/each}
      </ol>
    </section>

    <section class="primary-flow" aria-labelledby="quick-ship">
      <div class="section-head">
        <p class="eyebrow">{data.user ? 'Fastest path' : 'No-signup trial'}</p>
        <h2 id="quick-ship">{data.user ? 'Upload a zip' : 'Drop a zip. Get a link.'}</h2>
        <p>
          {#if data.user}
            {#if remixApp}
              Upload your improved build. GitHub is optional here; use it when you want fork history
              and repo deploys.
            {:else}
              Drop a zip of your built output or project export. Common roots like
              <code>dist/</code>, <code>build/</code>, and <code>out/</code> are normalized automatically.
            {/if}
          {:else}
            Your first upload creates a 24-hour unlisted trial app. Sign in only
            when you want to claim it, keep it, or open the dashboard.
          {/if}
        </p>
      </div>
      <div class="form-surface">
        <UploadForm trialMode={!data.user} initialSlug={remixSlug} remixFrom={remixApp?.slug ?? null} />
      </div>
    </section>

    <section class="secondary-flow" aria-labelledby="wrap-url">
      <div class="section-head">
        <p class="eyebrow">{data.user ? 'Already online' : 'Maker account'}</p>
        <h2 id="wrap-url">Wrap a hosted URL</h2>
        <p>
          {#if data.user}
            Keep your current hosting. Shippie gives it a maker subdomain, PWA install,
            proof surfaces, ratings, and a path into the container when it earns trust.
          {:else}
            URL wrapping touches ownership, redirects, and dashboard settings, so it starts
            after a magic-link sign-in. The zip trial above stays open.
          {/if}
        </p>
      </div>
      <div class="form-surface">
        {#if data.user}
          <WrapForm />
        {:else}
          <div class="signin-panel">
            <p>Already hosted somewhere else?</p>
            <a href="/auth/login?return_to=/new">Sign in to wrap a URL</a>
          </div>
        {/if}
      </div>
    </section>

    <section class="toolbelt" aria-label="Deploy from tools">
      <article>
        <h2>CLI</h2>
        <p>For terminal and CI deploys.</p>
        <pre><code>bun add -g @shippie/cli
shippie deploy ./dist</code></pre>
      </article>
      <article>
        <h2>Claude Code / Cursor</h2>
        <p>Install the MCP server, then ask your editor to deploy.</p>
        <pre><code>bunx @shippie/mcp install</code></pre>
      </article>
      <article>
        <h2>GitHub</h2>
        <p>Connect a repo from <a href="/dashboard">app settings</a> after your first deploy.</p>
        <pre><code>git push origin main</code></pre>
      </article>
    </section>

    <aside class="next">
      <div>
        <p class="eyebrow">After deploy</p>
        <h2>Shippie tells you what it did.</h2>
      </div>
      <ol>
        <li>Live at <code>{'<slug>'}.shippie.app</code> with install support and the wrapper runtime.</li>
        <li>The App Flight Recorder shows detected kind, blocked risks, fixed essentials, App Policy checks, and health checks.</li>
        <li>The dashboard tracks enhancements and runtime proof as real devices use the app.</li>
        <li>Share the URL, keep your custom domain story, and let the container become the richer home.</li>
      </ol>
    </aside>

    <p class="footer">
      {#if data.user}
        Signed in as {data.user.email}
      {:else}
        Anonymous trial deploys expire after 24 hours.
      {/if}
    </p>
  </div>
</main>

<style>
  .page {
    min-height: 100svh;
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) 1.25rem calc(var(--safe-bottom, 0px) + 4rem);
    background: #FAF7EF;
    color: #14120F;
  }
  .container { max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
    gap: 2rem;
    align-items: end;
    padding-bottom: 2rem;
    border-bottom: 1px solid #E5DDC8;
  }
  .header-mark { display: block; width: 56px; height: 56px; margin-bottom: 1rem; }
  .eyebrow {
    margin: 0 0 0.55rem;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #8B847A;
    font-family: ui-monospace, monospace;
  }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(2.35rem, 6vw, 4.75rem); line-height: 0.95; margin: 0; letter-spacing: -0.02em; max-width: 760px; }
  h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.5rem, 3vw, 2.15rem);
    line-height: 1.05;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .lede { color: #6F675E; font-size: 18px; line-height: 1.55; max-width: 720px; }
  .hero-status {
    border-left: 2px solid #E8603C;
    padding-left: 1rem;
  }
  .status-kicker {
    margin: 0 0 0.75rem;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: #E8603C;
    text-transform: uppercase;
  }
  .hero-status ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; color: #6F675E; font-size: 14px; line-height: 1.35; }
  .hero-status li::before { content: "✓"; color: #2E7D5B; margin-right: 0.5rem; }

  .remix-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1.5rem;
    align-items: center;
    padding: 1.25rem 0;
    border-bottom: 1px solid #E5DDC8;
  }
  .remix-panel h2 { font-size: 1.8rem; }
  .remix-panel p {
    margin: 0.55rem 0 0;
    color: #6F675E;
    line-height: 1.45;
  }
  .remix-panel .meta-line {
    color: #8B847A;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .remix-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
  }
  .remix-actions a,
  .remix-panel.unavailable > a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    padding: 0 1rem;
    border: 1px solid #14120F;
    color: #14120F;
    text-decoration: none;
    font-weight: 700;
  }
  .remix-actions a:first-child {
    background: #14120F;
    color: #EDE4D3;
  }
  .remix-panel.unavailable {
    border-left: 2px solid #E8603C;
    padding-left: 1rem;
  }

  .starter-row { display: grid; gap: 0.6rem; margin-bottom: 1.5rem; }
  .starter-row h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0; letter-spacing: -0.01em; }
  .starter-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.6rem;
  }
  .starter-list a {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem 1rem;
    background: rgba(232, 96, 60, 0.04);
    border: 1px solid rgba(232, 96, 60, 0.18);
    color: inherit;
    text-decoration: none;
    min-height: var(--touch-min, 44px);
  }
  .starter-list a:hover { background: rgba(232, 96, 60, 0.08); border-color: #E8603C; }
  .starter-list strong { font-size: 14px; }
  .starter-list span { font-size: 12px; color: #8B847A; }
  @media (prefers-color-scheme: dark) {
    .starter-list a { background: rgba(232, 96, 60, 0.06); border-color: rgba(232, 96, 60, 0.22); }
    .starter-list span { color: #B8A88F; }
  }

  .path-chooser {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }
  .path-chooser ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid #E5DDC8;
  }
  .path-chooser li { min-height: 120px; padding: 1rem; border-right: 1px solid #E5DDC8; display: flex; flex-direction: column; gap: 0.55rem; }
  .path-chooser li:last-child { border-right: 0; }
  .path-chooser span { color: #8B847A; font-size: 12px; line-height: 1.35; }
  .path-chooser strong { font-size: 15px; line-height: 1.25; }
  .path-chooser small { margin-top: auto; font-family: ui-monospace, monospace; color: #E8603C; }

  .primary-flow, .secondary-flow {
    display: grid;
    grid-template-columns: minmax(240px, 0.55fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: start;
    padding-top: 2rem;
    border-top: 1px solid #E5DDC8;
  }
  .section-head p { color: #6F675E; font-size: 14px; margin: 0.8rem 0 0; line-height: 1.55; }
  .form-surface { min-width: 0; }
  .signin-panel {
    border-left: 2px solid #E8603C;
    padding: 1rem 0 1rem 1rem;
  }
  .signin-panel p {
    margin: 0 0 0.75rem;
    color: #6F675E;
    font-size: 14px;
  }
  .signin-panel a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    padding: 0 1rem;
    background: #14120F;
    color: #EDE4D3;
    font-weight: 700;
  }

  .toolbelt {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid #E5DDC8;
  }
  .toolbelt article { padding: 1rem; border-right: 1px solid #E5DDC8; }
  .toolbelt article:last-child { border-right: 0; }
  .toolbelt h2 { font-size: 1.3rem; }
  .toolbelt p { color: #6F675E; font-size: 13px; line-height: 1.45; min-height: 2.8em; }
  pre {
    background: #14120F;
    color: #EDE4D3;
    padding: 0.75rem 1rem;
    border-radius: 0;
    font-size: 13px;
    margin: 0;
    overflow-x: auto;
  }
  a { color: #E8603C; }

  .next {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 1.5rem;
    padding: 1.5rem 0;
    border-top: 1px solid #E5DDC8;
    border-bottom: 1px solid #E5DDC8;
    background: rgba(232, 96, 60, 0.04);
  }
  .next ol {
    margin: 0;
    padding-left: 1.25rem;
    color: #6F675E;
    font-size: 14px;
    line-height: 1.55;
  }
  .footer { color: #8B847A; font-size: 13px; }
  code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  @media (max-width: 1024px) {
    .hero, .remix-panel, .path-chooser, .primary-flow, .secondary-flow, .next { grid-template-columns: 1fr; }
    .path-chooser ol, .toolbelt { grid-template-columns: 1fr; }
    .path-chooser li, .toolbelt article { border-right: 0; border-bottom: 1px solid #E5DDC8; }
    .path-chooser li:last-child, .toolbelt article:last-child { border-bottom: 0; }
    .hero-status { border-left: 0; padding-left: 0; border-top: 1px solid #E5DDC8; padding-top: 1rem; }
    .remix-actions { justify-content: flex-start; }
  }
  @media (max-width: 640px) {
    .page {
      padding: calc(var(--safe-top, 0px) + 0.75rem) 1rem calc(var(--safe-bottom, 0px) + 2rem);
    }
    .hero {
      gap: 1.25rem;
      padding-bottom: 1.25rem;
    }
    .header-mark {
      width: 44px;
      height: 44px;
      margin-bottom: 0.75rem;
    }
    h1 {
      font-size: clamp(2.25rem, 13vw, 3.5rem);
      line-height: 0.98;
    }
    .lede {
      font-size: 1rem;
    }
    .primary-flow,
    .secondary-flow {
      gap: 1rem;
      padding-top: 1.25rem;
    }
    .signin-panel a {
      width: 100%;
      justify-content: center;
      box-sizing: border-box;
    }
  }
  @media (prefers-color-scheme: dark) {
    .page { background: #14120F; color: #EDE4D3; }
    .hero, .remix-panel, .path-chooser ol, .path-chooser li, .primary-flow, .secondary-flow, .toolbelt, .toolbelt article, .next { border-color: #2A251E; }
    pre { background: #0D0B09; }
    .next { background: rgba(232, 96, 60, 0.06); }
    .lede, .remix-panel p, .section-head p, .toolbelt p, .hero-status ul, .next ol { color: #AFA693; }
    .signin-panel p { color: #AFA693; }
    .signin-panel a { background: #EDE4D3; color: #14120F; }
    .remix-actions a,
    .remix-panel.unavailable > a {
      border-color: #EDE4D3;
      color: #EDE4D3;
    }
    .remix-actions a:first-child {
      background: #EDE4D3;
      color: #14120F;
    }
  }
</style>
