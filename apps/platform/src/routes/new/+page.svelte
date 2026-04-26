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
        Three ways to get live at <code>{'<slug>'}.shippie.app</code>. Pick one.
      </p>
    </header>

    <section class="card">
      <h2>Upload a zip</h2>
      <p>Drop a zip of your built output — any static site, SPA, or framework <code>dist/</code>. Must have <code>index.html</code> at the root.</p>
      <UploadForm />
    </section>

    <section class="card">
      <h2>Wrap a hosted URL</h2>
      <p>Already on Vercel, Netlify, or your own server? Keep it there. Shippie serves it at <code>{'{slug}'}.shippie.app</code> with PWA install + ratings on top.</p>
      <WrapForm />
    </section>

    <section class="card">
      <h2>Connect a GitHub repo</h2>
      <p>GitHub-repo deploys ship after Phase 6 of the post-cloud refactor. For now, <code>npm run build</code> locally and use the zip uploader.</p>
    </section>

    <p class="footer">Signed in as {data.user.email}</p>
  </div>
</main>

<style>
  .page { min-height: 100dvh; padding: 4rem 1.5rem; background: #FAF7EF; color: #14120F; }
  .container { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(2rem, 5vw, 3rem); margin: 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; font-size: 17px; }
  .card { padding: 1.5rem 1.75rem; border: 1px solid #E5DDC8; border-radius: 12px; }
  .card h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0 0 0.5rem 0; }
  .card p { color: #8B847A; font-size: 14px; margin: 0 0 1rem 0; }
  .footer { color: #8B847A; font-size: 13px; }
  code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  @media (prefers-color-scheme: dark) {
    .page { background: #14120F; color: #EDE4D3; }
    .card { border-color: #2A251E; }
  }
</style>
