<script lang="ts">
  import UploadForm from './upload-form.svelte';
  import WrapForm from './wrap-form.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Ship a new app · Shippie</title></svelte:head>

<main class="page">
  <div class="container">
    <header>
      <h1>Ship your app</h1>
      <p class="lede">
        Get live at <code>{'<slug>'}.shippie.app</code> with the wrapper, the
        local-first runtime, and Connect-ready primitives baked in. Pick the
        path that matches how you build.
      </p>
    </header>

    <ul class="path-times">
      <li><strong>Zip / Wrap / CLI / MCP</strong> — ~60 seconds (pre-built)</li>
      <li><strong>GitHub auto-deploy</strong> — 2–5 minutes (we run the build)</li>
    </ul>

    <section class="card">
      <h2>Upload a zip <span class="time">60s</span></h2>
      <p>Drop a zip of your built output — any static site, SPA, or framework <code>dist/</code>. Must have <code>index.html</code> at the root.</p>
      <UploadForm />
    </section>

    <section class="card">
      <h2>Wrap a hosted URL <span class="time">60s</span></h2>
      <p>Already on Vercel, Netlify, or your own server? Keep it there. Shippie serves it at <code>{'{slug}'}.shippie.app</code> with PWA install, the Your Data panel, capability proof badges, and ratings layered on top.</p>
      <WrapForm />
    </section>

    <section class="card">
      <h2>CLI <span class="time">60s</span></h2>
      <p>From your terminal:</p>
      <pre><code>bun add -g @shippie/cli
shippie deploy ./dist</code></pre>
      <p>Same hosting + wrapper as the zip path. Authenticates against your Shippie session.</p>
    </section>

    <section class="card">
      <h2>From Claude Code / Cursor (MCP) <span class="time">60s</span></h2>
      <p>Install the Shippie MCP server in your AI tool and ask it to <em>"deploy this to Shippie"</em>. Files go from your editor to a maker subdomain without you leaving the chat.</p>
      <pre><code>bunx @shippie/mcp install</code></pre>
    </section>

    <section class="card">
      <h2>Connect a GitHub repo <span class="time">2–5min</span></h2>
      <p>Push to a connected repo and GitHub Actions runs the build, then we publish the output. Connect via the dashboard's <a href="/dashboard">app settings</a> after your first deploy.</p>
    </section>

    <aside class="next">
      <h3>What happens after deploy</h3>
      <ol>
        <li>Live at <code>{'<slug>'}.shippie.app</code> with PWA install, offline fallback, haptics, spring transitions, and the Your Data panel — automatic.</li>
        <li>The <strong>Enhancements</strong> tab in your dashboard shows what was auto-detected and what you can opt into.</li>
        <li>The <strong>Proof</strong> tab tracks Capability Proof Badges as real devices use the app.</li>
        <li>Share the link. Anyone can install it to their phone with one tap.</li>
      </ol>
    </aside>

    <p class="footer">Signed in as {data.user.email}</p>
  </div>
</main>

<style>
  .page { min-height: 100dvh; padding: 4rem 1.5rem; background: #FAF7EF; color: #14120F; }
  .container { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(2rem, 5vw, 3rem); margin: 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; font-size: 17px; line-height: 1.6; }

  .path-times {
    list-style: none;
    padding: 0;
    margin: -0.5rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: #8B847A;
  }
  .path-times li { padding: 0.3rem 0.6rem; border: 1px solid #E5DDC8; border-radius: 100px; }
  .path-times strong { color: #14120F; }

  .card { padding: 1.5rem 1.75rem; border: 1px solid #E5DDC8; border-radius: 12px; }
  .card h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.5rem;
    margin: 0 0 0.5rem 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .card h2 .time {
    font-family: ui-monospace, monospace;
    font-size: 0.7em;
    color: #E8603C;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .card p { color: #8B847A; font-size: 14px; margin: 0 0 1rem 0; line-height: 1.55; }
  .card pre {
    background: #14120F;
    color: #EDE4D3;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 13px;
    margin: 0 0 1rem 0;
    overflow-x: auto;
  }
  .card a { color: #E8603C; }

  .next {
    padding: 1.5rem 1.75rem;
    border: 1px solid #E5DDC8;
    background: rgba(232, 96, 60, 0.04);
    border-radius: 12px;
  }
  .next h3 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
  }
  .next ol {
    margin: 0;
    padding-left: 1.25rem;
    color: #8B847A;
    font-size: 14px;
    line-height: 1.55;
  }
  .next ol strong { color: #14120F; }

  .footer { color: #8B847A; font-size: 13px; }
  code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  @media (prefers-color-scheme: dark) {
    .page { background: #14120F; color: #EDE4D3; }
    .card, .path-times li, .next { border-color: #2A251E; }
    .next ol strong, .path-times strong { color: #EDE4D3; }
    .card pre { background: #0D0B09; }
    .next { background: rgba(232, 96, 60, 0.06); }
  }
</style>
