<script lang="ts">
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
    'Detects local-tool capabilities',
    'Blocks cloud storage, auth, ads, and trackers',
    'Blocks security failures before publish',
    'Writes a flight-recorder export',
    'Honours Your Data secure backup policy',
  ];
</script>

<svelte:head><title>Ship a new app · Shippie</title></svelte:head>

<main class="page">
  <div class="container">
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
        <p class="eyebrow">Ship</p>
        <h1>{remixApp ? `Remix ${remixApp.name}.` : 'A live URL in under a minute.'}</h1>
        <p class="lede">
          {#if remixApp}
            Fork on GitHub or upload your build. Shippie keeps the parent app, version, license,
            and attribution wired to your remix.
          {:else}
            Drop a built local tool zip or push from your editor. Shippie scans the bundle,
            blocks user-data egress, gives you a phone QR, and records the deploy — never the user.
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
          <a href="/?remixable=1">
            <strong>Remix an existing tool</strong>
            <span>Browse tools with source and license published.</span>
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
            <strong>Convert a hosted app</strong>
            <span>Move Supabase/Firebase/Auth0 data paths to Shippie local primitives.</span>
          </a>
        </li>
      </ul>
    </section>

    <section class="primary-flow" aria-labelledby="quick-ship">
      <div class="section-head">
        <p class="eyebrow">{data.user ? 'Upload' : 'No-signup trial'}</p>
        <h2 id="quick-ship">{data.user ? 'Drop a zip' : 'Drop a zip. Get a link.'}</h2>
        <p>
          {#if data.user}
            {#if remixApp}
              Upload your improved build. GitHub is optional — wire it up when you want fork
              history and repo-driven deploys.
            {:else}
              Built folders work as-is. <code>dist/</code>, <code>build/</code>, and
              <code>out/</code> roots are detected and normalised.
            {/if}
          {:else}
            Your first upload is a 24-hour unlisted trial. Sign in when you want to keep it.
          {/if}
        </p>
      </div>
      <div class="form-surface">
        <UploadForm trialMode={!data.user} initialSlug={remixSlug} remixFrom={remixApp?.slug ?? null} />
      </div>
    </section>

    <section class="secondary-flow" aria-labelledby="wrap-url">
      <div class="section-head">
        <p class="eyebrow">{data.user ? 'Already hosted' : 'Maker account'}</p>
        <h2 id="wrap-url">Convert a hosted app</h2>
        <p>
          {#if data.user}
            URL wrapping is retired for the marketplace. If a tool depends on a hosted backend,
            move user data to <code>shippie.local.db</code> and publish the built bundle.
          {:else}
            Shippie tools are local-first by default. Try the zip flow above, then sign in
            when you want to keep the deploy.
          {/if}
        </p>
      </div>
      <div class="form-surface">
        <WrapForm />
      </div>
    </section>

    <aside class="next">
      <div>
        <p class="eyebrow">After deploy</p>
        <h2>Shippie tells you what it did.</h2>
        <ol>
          <li>Live at <code>{'<slug>'}.shippie.app</code> with the wrapper runtime and install support.</li>
          <li>The App Flight Recorder shows local-tool eligibility, blocked risks, fixed essentials, and health checks.</li>
          <li>The dashboard tracks proof badges as real devices use the app.</li>
          <li>Your tool runs locally; secure backup is optional continuity, not a cloud account.</li>
        </ol>
      </div>
      <div class="next-tools" aria-label="Other deploy paths">
        <article>
          <h3>CLI</h3>
          <pre><code>bun add -g @shippie/cli
shippie deploy ./dist</code></pre>
        </article>
        <article>
          <h3>Claude Code / Cursor</h3>
          <pre><code>bunx @shippie/mcp install</code></pre>
        </article>
        <article id="github">
          <h3>GitHub</h3>
          <pre><code>git push origin main</code></pre>
          <p><a href="/dashboard">Connect a repo</a> after your first deploy.</p>
        </article>
      </div>
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
    width: 100%;
    max-width: 100vw;
    padding: calc(var(--safe-top, 0px) + 1rem) 1.25rem calc(var(--safe-bottom, 0px) + 4rem);
    background: var(--paper-warm);
    color: var(--bg);
    overflow-x: hidden;
    overflow-x: clip;
    overscroll-behavior-x: none;
    touch-action: pan-y;
  }
  .container { width: 100%; max-width: 1040px; min-width: 0; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
    gap: 2rem;
    align-items: end;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--paper-cream);
  }
  .header-mark { display: block; width: 56px; height: 56px; margin-bottom: 1rem; }
  .eyebrow {
    margin: 0 0 0.55rem;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--text-muted-warm);
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
  .lede { color: var(--ink-muted-warm); font-size: 18px; line-height: 1.55; max-width: 720px; }
  .hero > *,
  .hero-status {
    min-width: 0;
  }
  .hero-status {
    border-left: 2px solid var(--sunset);
    padding-left: 1rem;
  }
  .status-kicker {
    margin: 0 0 0.75rem;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: var(--sunset);
    text-transform: uppercase;
  }
  .hero-status ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; color: var(--ink-muted-warm); font-size: 14px; line-height: 1.35; }
  .hero-status li::before { content: "✓"; color: var(--success); margin-right: 0.5rem; }

  .remix-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1.5rem;
    align-items: center;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--paper-cream);
  }
  .remix-panel h2 { font-size: 1.8rem; }
  .remix-panel p {
    margin: 0.55rem 0 0;
    color: var(--ink-muted-warm);
    line-height: 1.45;
  }
  .remix-panel .meta-line {
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .remix-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
    min-width: 0;
  }
  .remix-actions a,
  .remix-panel.unavailable > a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    padding: 0 1rem;
    border: 1px solid var(--bg);
    color: var(--bg);
    text-decoration: none;
    font-weight: 700;
  }
  .remix-actions a:first-child {
    background: var(--bg);
    color: var(--text);
  }
  .remix-panel.unavailable {
    border-left: 2px solid var(--sunset);
    padding-left: 1rem;
  }

  .starter-row { display: grid; gap: 0.6rem; min-width: 0; margin-bottom: 1.5rem; }
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
    min-width: 0;
    padding: 0.85rem 1rem;
    background: rgba(232, 96, 60, 0.04);
    border: 1px solid rgba(232, 96, 60, 0.18);
    color: inherit;
    text-decoration: none;
    min-height: var(--touch-min, 44px);
  }
  .starter-list a:hover { background: rgba(232, 96, 60, 0.08); border-color: var(--sunset); }
  .starter-list strong { font-size: 14px; }
  .starter-list span { font-size: 12px; color: var(--text-muted-warm); overflow-wrap: anywhere; }
  @media (prefers-color-scheme: dark) {
    .starter-list a { background: rgba(232, 96, 60, 0.06); border-color: rgba(232, 96, 60, 0.22); }
    .starter-list span { color: var(--text-secondary); }
  }

  .primary-flow, .secondary-flow {
    display: grid;
    grid-template-columns: minmax(240px, 0.55fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: start;
    padding-top: 2rem;
    border-top: 1px solid var(--paper-cream);
    min-width: 0;
  }
  .section-head { min-width: 0; }
  .section-head p { color: var(--ink-muted-warm); font-size: 14px; margin: 0.8rem 0 0; line-height: 1.55; overflow-wrap: anywhere; }
  .form-surface { min-width: 0; max-width: 100%; }

  .next-tools {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--paper-cream);
    min-width: 0;
  }
  .next-tools article { min-width: 0; padding: 1rem; border-right: 1px solid var(--paper-cream); }
  .next-tools article:last-child { border-right: 0; }
  .next-tools h3 { margin: 0 0 0.65rem; font-size: 1rem; line-height: 1.2; }
  .next-tools p { margin: 0.65rem 0 0; color: var(--ink-muted-warm); font-size: 13px; line-height: 1.45; }
  pre {
    background: var(--bg);
    color: var(--text);
    padding: 0.75rem 1rem;
    border-radius: 0;
    font-size: 13px;
    margin: 0;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  pre code { white-space: pre-wrap; overflow-wrap: anywhere; }
  a { color: var(--sunset); }

  .next {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 1.5rem;
    padding: 1.5rem 0;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
    background: rgba(232, 96, 60, 0.04);
    min-width: 0;
  }
  .next > * {
    min-width: 0;
  }
  .next ol {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--ink-muted-warm);
    font-size: 14px;
    line-height: 1.55;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .footer { color: var(--text-muted-warm); font-size: 13px; }
  code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  @media (max-width: 1024px) {
    .hero, .remix-panel, .primary-flow, .secondary-flow, .next { grid-template-columns: 1fr; }
    .next-tools { grid-template-columns: 1fr; }
    .next-tools article { border-right: 0; border-bottom: 1px solid var(--paper-cream); }
    .next-tools article:last-child { border-bottom: 0; }
    .hero-status { border-left: 0; padding-left: 0; border-top: 1px solid var(--paper-cream); padding-top: 1rem; }
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
  }
  @media (prefers-color-scheme: dark) {
    .page { background: var(--bg); color: var(--text); }
    .hero, .remix-panel, .primary-flow, .secondary-flow, .next-tools, .next-tools article, .next { border-color: var(--ink-warm); }
    pre { background: var(--bg-pure); }
    .next { background: rgba(232, 96, 60, 0.06); }
    .lede, .remix-panel p, .section-head p, .next-tools p, .hero-status ul, .next ol { color: var(--border-cream-soft); }
    .remix-actions a,
    .remix-panel.unavailable > a {
      border-color: var(--text);
      color: var(--text);
    }
    .remix-actions a:first-child {
      background: var(--text);
      color: var(--bg);
    }
  }
</style>
