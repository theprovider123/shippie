<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.page.title} — Shippie Docs</title>
  <meta name="description" content={data.page.description} />
  <meta name="theme-color" content="#1E1A15" />
</svelte:head>

<main class="doc-page">
  <article class="doc">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/docs">Docs</a>
      <span aria-hidden="true">/</span>
      <span>{data.page.title}</span>
    </nav>

    <header class="hero">
      <p class="eyebrow">{data.page.eyebrow}</p>
      <h1>{data.page.title}</h1>
      <p class="lede">{data.page.description}</p>
      <p class="updated">Updated {data.page.updated}</p>
    </header>

    <div class="content">
      {#each data.page.sections as section (section.title)}
        <section>
          <h2>{section.title}</h2>
          {#each section.body as paragraph}
            <p>{paragraph}</p>
          {/each}
          {#if section.bullets}
            <ul>
              {#each section.bullets as bullet}
                <li>{bullet}</li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </div>

    {#if data.page.links && data.page.links.length > 0}
      <footer class="next-links" aria-label="Related docs">
        {#each data.page.links as link}
          <a href={link.href}>{link.label}</a>
        {/each}
      </footer>
    {/if}
  </article>
</main>

<style>
  .doc-page {
    min-height: 100dvh;
    padding: var(--space-xl) clamp(1.25rem, 5vw, 4rem) var(--space-3xl);
    background:
      linear-gradient(180deg, rgba(232, 96, 60, 0.08), transparent 320px),
      var(--bg);
    color: var(--text);
  }

  .doc {
    max-width: 820px;
    margin: 0 auto;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: var(--space-xl);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .crumbs a {
    min-height: var(--touch-min);
    min-width: var(--touch-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    text-decoration: none;
  }

  .crumbs a:hover {
    color: var(--text);
  }

  .hero {
    padding-bottom: var(--space-xl);
    border-bottom: 1px solid var(--border-light);
  }

  .eyebrow,
  .updated {
    margin: 0;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h1,
  h2 {
    font-family: var(--font-heading);
    letter-spacing: 0;
  }

  h1 {
    margin: 0.6rem 0 1rem;
    font-size: clamp(2.5rem, 8vw, 5rem);
    line-height: 0.95;
  }

  .lede {
    max-width: 680px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 1.12rem;
    line-height: 1.6;
  }

  .updated {
    margin-top: var(--space-lg);
    color: var(--text-light);
  }

  .content {
    display: grid;
    gap: var(--space-xl);
    padding-top: var(--space-xl);
  }

  section {
    display: grid;
    gap: 0.85rem;
  }

  h2 {
    margin: 0;
    color: var(--text);
    font-size: clamp(1.45rem, 4vw, 2rem);
    line-height: 1.1;
  }

  p,
  li {
    color: var(--text-secondary);
    font-size: 1rem;
    line-height: 1.72;
  }

  p,
  ul {
    margin: 0;
  }

  ul {
    display: grid;
    gap: 0.6rem;
    padding-left: 1.1rem;
  }

  li::marker {
    color: var(--sunset);
  }

  .next-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: var(--space-2xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--border-light);
  }

  .next-links a {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-min);
    padding: 0 1rem;
    border: 1px solid var(--border-light);
    color: var(--text);
    text-decoration: none;
    font-size: var(--small-size);
    font-weight: 700;
  }

  .next-links a:hover {
    border-color: var(--sunset);
    color: var(--sunset);
  }

  @media (max-width: 640px) {
    .doc-page {
      padding-left: calc(1rem + var(--safe-left));
      padding-right: calc(1rem + var(--safe-right));
    }
  }
</style>
