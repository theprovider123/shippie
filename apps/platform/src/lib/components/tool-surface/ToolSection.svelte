<!--
  ToolSection — section header + grid wrapper used by every tool
  surface. Carries Quick → Browse → Data as the shared vocabulary.

  The shell decides density; ToolSection just lays out the header
  (with count) and a flexible grid wrapper. Children render the tiles.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ToolDensity } from './types';

  interface Props {
    title: string;
    count?: number | null;
    hint?: string | null;
    density?: ToolDensity;
    /** Grid template — override only when the surface needs it. */
    columns?: string;
    children: Snippet;
    id?: string;
  }

  let {
    title,
    count = null,
    hint = null,
    density = 'card',
    columns,
    children,
    id,
  }: Props = $props();

  const headingId = $derived(id ?? `tool-section-${title.toLowerCase().replace(/\s+/g, '-')}`);
  const gridStyle = $derived(columns ? `grid-template-columns: ${columns};` : '');
</script>

<section class="tool-section" data-density={density} aria-labelledby={headingId}>
  <header class="tool-section-head">
    <h2 id={headingId}>{title}</h2>
    {#if count !== null || hint}
      <span class="tool-section-hint">{hint ?? (count === 1 ? '1 tool' : `${count} tools`)}</span>
    {/if}
  </header>
  <div class="tool-grid tool-grid-{density}" style={gridStyle}>
    {@render children()}
  </div>
</section>

<style>
  .tool-section {
    margin: 0 0 var(--space-xl, 24px);
  }
  .tool-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md, 16px);
    margin-bottom: 10px;
  }
  .tool-section-head h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .tool-section-hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .tool-grid {
    display: grid;
    gap: 12px;
  }
  .tool-grid-card {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .tool-grid-drawer {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .tool-grid-dock {
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 10px;
  }

  @media (max-width: 640px) {
    .tool-grid-card {
      grid-template-columns: 1fr;
    }
  }
</style>
