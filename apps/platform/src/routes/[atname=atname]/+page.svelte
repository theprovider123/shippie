<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function kindLabel(kind: string | null): string {
    if (kind === 'local') return 'Local';
    if (kind === 'connected') return 'Connected';
    if (kind === 'cloud') return 'Cloud';
    return 'Verifying';
  }
</script>

<svelte:head>
  <title>{data.maker.displayName ?? `@${data.maker.username}`} · Shippie</title>
  <meta
    name="description"
    content={data.maker.headline ?? data.maker.bio ?? `Tools by @${data.maker.username} on Shippie`}
  />
</svelte:head>

<main class="profile">
  <header class="hero">
    <div class="identity">
      <div class="avatar">
        {#if data.maker.avatarUrl}
          <img src={data.maker.avatarUrl} alt="" />
        {:else}
          <span>{(data.maker.displayName ?? data.maker.username ?? 'S').slice(0, 1).toUpperCase()}</span>
        {/if}
      </div>
      <div>
        <p class="eyebrow">Builder</p>
        <h1>{data.maker.displayName ?? `@${data.maker.username}`}</h1>
        <p class="handle">
          @{data.maker.username}
          {#if data.maker.verifiedMaker}<span>Verified maker</span>{/if}
        </p>
      </div>
    </div>

    {#if data.maker.headline}<p class="headline">{data.maker.headline}</p>{/if}
    {#if data.maker.bio}<p class="bio">{data.maker.bio}</p>{/if}
    {#if data.maker.location}<p class="muted">{data.maker.location}</p>{/if}

    {#if data.links.length > 0}
      <nav class="links" aria-label="Builder links">
        {#each data.links as link (link.href)}
          <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
        {/each}
      </nav>
    {/if}
  </header>

  <section class="tools">
    <div class="section-head">
      <p class="eyebrow">Tools</p>
      <h2>{data.apps.length} public {data.apps.length === 1 ? 'tool' : 'tools'}</h2>
    </div>

    {#if data.apps.length > 0}
      <ul class="grid" role="list">
        {#each data.apps as app (app.slug)}
          <li>
            <a class="tool" href={`/apps/${app.slug}`}>
              <span class="icon" style={`--accent:${app.themeColor}`}>
                {#if app.iconUrl}
                  <img src={app.iconUrl} alt="" />
                {:else}
                  {app.name.slice(0, 2).toUpperCase()}
                {/if}
              </span>
              <strong>{app.name}</strong>
              <small>{kindLabel(app.currentDetectedKind)} · {app.category}</small>
              <p>{app.tagline ?? app.description ?? `${app.name} on Shippie`}</p>
              <span class="meta">{app.installCount.toLocaleString()} opens · {app.upvoteCount.toLocaleString()} upvotes</span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <h3>No public tools yet</h3>
        <p>This builder has not published anything public on Shippie.</p>
      </div>
    {/if}
  </section>
</main>

<style>
  .profile {
    min-height: 100dvh;
    padding-top: calc(var(--nav-height) + var(--safe-top));
    background: var(--bg, #14120F);
    color: var(--text, #EDE4D3);
  }
  .hero,
  .tools {
    max-width: 1080px;
    margin: 0 auto;
    padding: clamp(2rem, 5vw, 4rem) clamp(1.25rem, 4vw, 3rem);
  }
  .eyebrow,
  .handle,
  .meta {
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: var(--text-caption);
  }
  .eyebrow { color: var(--sunset, #E8603C); margin: 0 0 0.4rem; }
  .identity {
    display: flex;
    gap: 1.25rem;
    align-items: center;
    margin-top: 0;
  }
  .avatar,
  .icon {
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--accent, var(--sunset, #E8603C));
    color: var(--bg-pure, #0F0D0A);
    font-family: var(--font-heading, Georgia, serif);
  }
  .avatar { width: 112px; height: 112px; font-size: var(--text-display); }
  .avatar img,
  .icon img { width: 100%; height: 100%; object-fit: cover; }
  h1,
  h2,
  h3 {
    font-family: var(--font-heading, Georgia, serif);
    letter-spacing: -0.02em;
  }
  h1 { font-size: var(--text-display); line-height: 0.95; margin: 0; }
  h2 { font-size: var(--text-display); margin: 0; }
  .handle,
  .muted,
  .bio,
  .tool p,
  .tool small,
  .meta { color: var(--text-secondary, #B8A88F); }
  .handle span {
    margin-left: 0.75rem;
    color: var(--marigold, #E8C547);
  }
  .headline {
    font-family: var(--font-heading, Georgia, serif);
    font-size: var(--text-display);
    line-height: 1.1;
    max-width: 860px;
    margin: 2rem 0 0;
  }
  .bio { max-width: 760px; line-height: 1.65; white-space: pre-wrap; }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }
  .links a {
    border: 1px solid var(--border, var(--border));
    color: var(--text, #EDE4D3);
    text-decoration: none;
    padding: 0.5rem 0.75rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .links a:hover { border-color: var(--sunset, #E8603C); color: var(--sunset, #E8603C); }
  .section-head { margin-bottom: 1rem; }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
  }
  .tool,
  .empty {
    display: grid;
    gap: 0.55rem;
    min-height: 220px;
    border: 1px solid var(--border, var(--border));
    background: var(--surface, #1E1A15);
    color: inherit;
    text-decoration: none;
    padding: 1rem;
  }
  .tool:hover { border-color: var(--sage-moss, #5E7B5C); background: var(--surface-alt, #252019); }
  .icon { width: 48px; height: 48px; }
  .tool strong { font-family: var(--font-heading, Georgia, serif); font-size: var(--text-lede); }
  .tool p {
    line-height: 1.5;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta { margin-top: auto; }
  .empty { place-content: center; text-align: center; border-style: dashed; }
  @media (max-width: 640px) {
    .identity { align-items: flex-start; flex-direction: column; }
    .avatar { width: 88px; height: 88px; }
  }
</style>
