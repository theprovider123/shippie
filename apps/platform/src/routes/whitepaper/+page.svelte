<script lang="ts">
  import { html, lastUpdated } from '$lib/_generated/whitepaper';
</script>

<svelte:head>
  <title>Whitepaper · Shippie</title>
  <meta
    name="description"
    content="Locally This, Locally That — how Shippie puts apps back on your device. The post-cloud platform thesis, the stack, and where help is wanted."
  />
  <meta property="og:title" content="Shippie Whitepaper — Locally This, Locally That" />
  <meta
    property="og:description"
    content="Wrap. Run. Connect. Apps that install on your phone, run on your device, and talk peer-to-peer."
  />
</svelte:head>

<main class="page">
  <article class="paper">
    {@html html}
  </article>
  <footer class="meta">
    <p>Source: <a href="https://github.com/theprovider123/shippie/blob/main/docs/WHITEPAPER.md">docs/WHITEPAPER.md</a> · last updated {lastUpdated}</p>
  </footer>
</main>

<style>
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 96px 24px 120px;
    color: var(--text);
  }

  .paper :global(h1) {
    font-family: var(--font-display, 'Fraunces', serif);
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.01em;
    margin: 0 0 8px;
  }

  .paper :global(h1 + p) {
    font-family: var(--font-display, 'Fraunces', serif);
    font-size: 1.4rem;
    font-weight: 400;
    color: var(--text-secondary);
    margin: 0 0 32px;
  }

  .paper :global(h2) {
    font-family: var(--font-display, 'Fraunces', serif);
    font-size: 1.8rem;
    font-weight: 600;
    margin: 64px 0 16px;
    letter-spacing: -0.005em;
  }

  .paper :global(h3) {
    font-family: var(--font-body, 'General Sans', system-ui, sans-serif);
    font-size: 1.15rem;
    font-weight: 600;
    margin: 32px 0 12px;
    color: var(--sage-leaf, #7A9A6E);
  }

  .paper :global(p) {
    font-family: var(--font-body, 'General Sans', system-ui, sans-serif);
    font-size: 1.05rem;
    line-height: 1.65;
    margin: 0 0 16px;
  }

  .paper :global(blockquote) {
    margin: 24px 0;
    padding: 16px 20px;
    border-left: 3px solid var(--sunset, #E8603C);
    background: var(--surface, #1E1A15);
    font-family: var(--font-display, 'Fraunces', serif);
    font-size: 1.15rem;
    font-style: italic;
    color: var(--text);
  }

  .paper :global(blockquote p) {
    margin: 0;
  }

  .paper :global(ul),
  .paper :global(ol) {
    font-family: var(--font-body, 'General Sans', system-ui, sans-serif);
    font-size: 1.05rem;
    line-height: 1.65;
    margin: 0 0 16px;
    padding-left: 24px;
  }

  .paper :global(li) {
    margin-bottom: 6px;
  }

  .paper :global(li > strong:first-child) {
    color: var(--sage-leaf, #7A9A6E);
  }

  .paper :global(code) {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 0.92em;
    background: var(--surface-alt, #252019);
    padding: 1px 6px;
    color: var(--text);
  }

  .paper :global(pre) {
    background: var(--surface, #1E1A15);
    padding: 16px;
    overflow-x: auto;
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 16px 0;
  }

  .paper :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .paper :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 24px 0;
    font-family: var(--font-body, 'General Sans', system-ui, sans-serif);
    font-size: 0.95rem;
  }

  .paper :global(th),
  .paper :global(td) {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border, #3D3530);
    vertical-align: top;
  }

  .paper :global(th) {
    font-weight: 600;
    color: var(--sage-leaf, #7A9A6E);
    border-bottom-color: var(--sage-moss, #5E7B5C);
  }

  .paper :global(hr) {
    border: 0;
    border-top: 1px solid var(--border, #3D3530);
    margin: 48px 0;
  }

  .paper :global(a) {
    color: var(--sunset, #E8603C);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .paper :global(a:hover) {
    color: var(--sunset-hover, #F47552);
  }

  .paper :global(em) {
    font-style: italic;
    color: var(--text-secondary);
  }

  .paper :global(strong) {
    font-weight: 600;
  }

  .paper :global(p:last-of-type em) {
    display: block;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid var(--border, #3D3530);
    font-size: 0.95rem;
    color: var(--text-light);
    font-style: normal;
  }

  .meta {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--border, #3D3530);
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 0.85rem;
    color: var(--text-light);
  }

  .meta a {
    color: var(--text-light);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .meta a:hover {
    color: var(--sunset, #E8603C);
  }
</style>
