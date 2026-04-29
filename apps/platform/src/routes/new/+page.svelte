<script lang="ts">
  import UploadForm from './upload-form.svelte';
  import WrapForm from './wrap-form.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const checks = [
    'Detects framework output and app kind',
    'Blocks hard security failures before publish',
    'Writes a portable deploy report artifact',
    'Keeps URL ownership and container eligibility separate',
  ];

  const paths = [
    { label: 'I have a built folder', action: 'Zip it and upload here', time: 'about 60s' },
    { label: 'It is already hosted', action: 'Wrap the URL', time: 'about 60s' },
    { label: 'I am in my editor', action: 'Use CLI or MCP', time: 'about 60s' },
    { label: 'I want repo deploys', action: 'Connect GitHub after first ship', time: '2-5min' },
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
        <p class="eyebrow">Maker console</p>
        <h1>Ship your first app in under a minute.</h1>
        <p class="lede">
          Upload a build, wrap a live URL, or let CLI/MCP send it from your editor.
          Shippie checks the app, explains what happened, and gives you a link people can install.
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
        <p class="eyebrow">Fastest path</p>
        <h2 id="quick-ship">Upload a zip</h2>
        <p>
          Drop a zip of your built output or project export. Common roots like
          <code>dist/</code>, <code>build/</code>, and <code>out/</code> are normalized automatically.
        </p>
      </div>
      <div class="form-surface">
        <UploadForm />
      </div>
    </section>

    <section class="secondary-flow" aria-labelledby="wrap-url">
      <div class="section-head">
        <p class="eyebrow">Already online</p>
        <h2 id="wrap-url">Wrap a hosted URL</h2>
        <p>
          Keep your current hosting. Shippie gives it a maker subdomain, PWA install,
          proof surfaces, ratings, and a path into the container when it earns trust.
        </p>
      </div>
      <div class="form-surface">
        <WrapForm />
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
        <li>The deploy report shows detected kind, blocked risks, fixed essentials, and health checks.</li>
        <li>The dashboard tracks enhancements and runtime proof as real devices use the app.</li>
        <li>Share the URL, keep your custom domain story, and let the container become the richer home.</li>
      </ol>
    </aside>

    <p class="footer">Signed in as {data.user.email}</p>
  </div>
</main>

<style>
  .page { min-height: 100dvh; padding: 3rem 1.25rem 4rem; background: #FAF7EF; color: #14120F; }
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
  @media (max-width: 860px) {
    .hero, .path-chooser, .primary-flow, .secondary-flow, .next { grid-template-columns: 1fr; }
    .path-chooser ol, .toolbelt { grid-template-columns: 1fr; }
    .path-chooser li, .toolbelt article { border-right: 0; border-bottom: 1px solid #E5DDC8; }
    .path-chooser li:last-child, .toolbelt article:last-child { border-bottom: 0; }
    .hero-status { border-left: 0; padding-left: 0; border-top: 1px solid #E5DDC8; padding-top: 1rem; }
  }
  @media (prefers-color-scheme: dark) {
    .page { background: #14120F; color: #EDE4D3; }
    .hero, .path-chooser ol, .path-chooser li, .primary-flow, .secondary-flow, .toolbelt, .toolbelt article, .next { border-color: #2A251E; }
    pre { background: #0D0B09; }
    .next { background: rgba(232, 96, 60, 0.06); }
    .lede, .section-head p, .toolbelt p, .hero-status ul, .next ol { color: #AFA693; }
  }
</style>
