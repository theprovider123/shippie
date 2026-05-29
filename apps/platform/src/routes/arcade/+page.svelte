<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Arcade — Shippie</title>
  <meta name="description" content="Shippie Arcade — daily puzzles, classic arcade games, room games, strategy. Offline. No ads. No tracking. No accounts." />
</svelte:head>

<main class="page">
  <header class="page-head">
    <h1>Shippie Arcade</h1>
    <p class="muted">Offline. No ads. No accounts. Daily puzzles, arcade classics, room games for two-plus phones, and slow-strategy.</p>
  </header>

  {#if data.featured.length > 0}
    <section class="featured" aria-label="Featured games">
      {#each data.featured as game, idx (game.slug)}
        <a
          class="hero-card"
          class:hero-1={idx === 0}
          href={game.standaloneUrl}
          style:--accent={game.accent ?? '#4FA487'}
        >
          <span class="hero-icon" aria-hidden="true">{game.icon ?? game.shortName ?? game.name.slice(0, 2)}</span>
          <span class="hero-meta">
            <strong>{game.name}</strong>
            <small>{game.description ?? ''}</small>
          </span>
        </a>
      {/each}
    </section>
  {/if}

  {#each data.shelves as shelf (shelf.key)}
    <section class="shelf" aria-label={shelf.title}>
      <header class="shelf-head">
        <h2>{shelf.title}</h2>
        <p class="muted small">{shelf.subtitle}</p>
      </header>
      <ul class="shelf-row" aria-label={`${shelf.title} games`}>
        {#each shelf.games as game (game.slug)}
          <li>
            <a
              class="game-card"
              href={game.standaloneUrl}
              style:--accent={game.accent ?? '#4FA487'}
            >
              <span class="game-icon" aria-hidden="true">{game.icon ?? game.shortName ?? game.name.slice(0, 2)}</span>
              <strong>{game.name}</strong>
              {#if game.description}
                <small>{game.description}</small>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if data.shelves.length === 0 && data.featured.length === 0}
    <section class="empty">
      <h2>Coming soon</h2>
      <p>The Arcade surface is live. Games land here once they pass the quality gates.</p>
    </section>
  {/if}
</main>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 32px 20px 80px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }
  .page-head h1 {
    font-family: var(--font-heading, serif);
    font-size: 36px;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .page-head p {
    margin: 6px 0 0;
    color: var(--muted, #5C5751);
    max-width: 560px;
  }
  .muted { color: var(--muted, #5C5751); }
  .muted.small { font-size: 13px; }

  .featured {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 640px) {
    .featured {
      grid-template-columns: 1fr 1fr;
    }
    .featured .hero-1 {
      grid-column: span 2;
    }
  }
  .hero-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    min-height: 160px;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000));
    color: #fff;
    text-decoration: none;
    border-radius: 8px;
    transition: transform 120ms ease, box-shadow 120ms ease;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .hero-card:hover,
  .hero-card:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .hero-card.hero-1 {
    min-height: 200px;
  }
  .hero-icon {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-heading, serif);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .hero-meta strong {
    display: block;
    font-family: var(--font-heading, serif);
    font-size: 20px;
    font-weight: 600;
  }
  .hero-meta small {
    display: block;
    margin-top: 4px;
    font-size: 13px;
    opacity: 0.92;
    line-height: 1.4;
  }

  .shelf {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .shelf-head h2 {
    margin: 0;
    font-family: var(--font-heading, serif);
    font-size: 22px;
    letter-spacing: -0.01em;
  }
  .shelf-head p {
    margin: 2px 0 0;
  }
  .shelf-row {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .game-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: #fff;
    border: 1px solid var(--line, var(--cream-border));
    border-top: 3px solid var(--accent);
    color: inherit;
    text-decoration: none;
    border-radius: 4px;
    min-height: 140px;
    transition: transform 120ms ease, border-color 120ms ease;
  }
  .game-card:hover,
  .game-card:focus-visible {
    transform: translateY(-2px);
    border-color: var(--accent);
  }
  .game-icon {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-heading, serif);
    font-size: 14px;
    font-weight: 700;
  }
  .game-card strong {
    font-family: var(--font-heading, serif);
    font-size: 16px;
    font-weight: 600;
  }
  .game-card small {
    color: var(--muted, #5C5751);
    font-size: 13px;
    line-height: 1.4;
  }

  .empty {
    border: 1px dashed var(--line, var(--cream-border));
    padding: 40px 24px;
    text-align: center;
    border-radius: 0;
  }
  .empty h2 {
    margin: 0 0 8px;
    font-family: var(--font-heading, serif);
  }
</style>
