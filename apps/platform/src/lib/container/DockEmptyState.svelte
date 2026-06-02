<!--
  Phase 3 — first-run Dock empty state. Shown in the home canvas when
  the device has no tools yet (no open/saved/recent). Small + operational:
  a slim hero band, a few curated starters, and a browse-all link. Not a
  marketing page — "a Dock that happens to be empty".
-->
<script lang="ts">
  import type { ContainerApp } from './state';
  import { initials } from './state';
  import { categoryColorFamily } from './category-color';

  interface Props {
    starters: ContainerApp[];
    totalCount: number;
    onOpen: (app: ContainerApp) => void;
  }
  let { starters, totalCount, onOpen }: Props = $props();
</script>

<div class="dock-empty">
  <div class="hero">
    <p class="hero-eyebrow">Wrap · Run · Connect</p>
    <h2 class="hero-title">Your private Dock for local tools</h2>
    <p class="hero-sub">Everything local. No account needed.</p>
  </div>

  {#if starters.length > 0}
    <p class="starters-label">Start with these</p>
    <div class="starters">
      {#each starters as app (app.slug)}
        <button class="starter" onclick={() => onOpen(app)}>
          <span class="starter-icon" style="background:{categoryColorFamily(app.category)}">{app.icon ?? initials(app.name)}</span>
          <span class="starter-text">
            <span class="starter-name">{app.name}</span>
            {#if app.description}<span class="starter-blurb">{app.description}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}

  <a class="browse-all" href="/tools">Browse all {totalCount} tools →</a>
</div>

<style>
  .dock-empty { display: flex; flex-direction: column; gap: var(--space-lg); padding: var(--space-lg) 0; }
  .hero { background: var(--paper-warm, #faf7ef); border: 1px solid var(--border-light); padding: var(--space-md) var(--space-lg); }
  .hero-eyebrow { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sunset); margin: 0 0 var(--space-xs); }
  .hero-title { font-family: var(--font-heading); font-size: 1.25rem; color: var(--ink-warm, #2a251e); margin: 0; }
  .hero-sub { font-size: 0.8rem; color: var(--text-muted-warm, #8b847a); margin: var(--space-xs) 0 0; }
  .starters-label { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-light); margin: 0; }
  .starters { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-sm); }
  .starter { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm); border: 1px solid var(--border); background: var(--surface); text-align: left; cursor: pointer; }
  .starter:hover { background: var(--surface-alt); }
  .starter-icon { width: 32px; height: 32px; flex: none; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 0.8rem; color: var(--bg); }
  .starter-text { display: flex; flex-direction: column; min-width: 0; }
  .starter-name { color: var(--text); font-size: 0.85rem; }
  .starter-blurb { color: var(--text-light); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .browse-all { color: var(--sunset); font-size: 0.85rem; }
</style>
