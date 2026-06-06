<!--
  Mobile switcher. It is intentionally scoped to Dock context (running, saved,
  recent); full catalog discovery lives on /tools.
-->
<script lang="ts">
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import { ToolRow, toolState, type ToolDisplay } from '$lib/components/tool-surface';
  import type { RailGroups, RailTool } from './rail-groups';
  import { buildToolSwitcherSections } from './tool-switcher';

  interface Props {
    open: boolean;
    groups: RailGroups;
    allApps: RailTool[];
    onOpen: (slug: string) => void;
    onClose: () => void;
    onCloseTool?: (slug: string) => void;
  }
  let { open, groups, allApps, onOpen, onClose, onCloseTool = undefined }: Props = $props();

  const EMPTY_SLUGS: ReadonlySet<string> = new Set();
  function railToolToTile(tool: RailTool): ToolDisplay {
    return {
      slug: tool.slug,
      name: tool.name,
      category: tool.category ?? null,
      iconUrl: null,
      themeColor: tool.accent,
      glyph: tool.icon,
      firstPartySigned: false,
      badges: [],
    };
  }
  function stateForTool(tool: RailTool, sectionId: string) {
    return toolState({
      slug: tool.slug,
      isRunning: sectionId === 'open',
      savedSlugs: sectionId === 'saved' ? new Set([tool.slug]) : EMPTY_SLUGS,
      recentSlugs: sectionId === 'recent' ? new Set([tool.slug]) : EMPTY_SLUGS,
      download: undefined,
      updateSeverity: null,
      surface: 'drawer',
    });
  }

  let query = $state('');
  const contextCount = $derived(new Set([
    ...groups.open.map((tool) => tool.slug),
    ...groups.saved.map((tool) => tool.slug),
    ...groups.recent.map((tool) => tool.slug),
  ]).size);
  const searchable = $derived(contextCount > 8);
  const sections = $derived(buildToolSwitcherSections({ groups, allApps, query }));
  const hasResults = $derived(sections.some((section) => section.tools.length > 0));

  function pick(slug: string) {
    onOpen(slug);
    onClose();
  }

  function closeRunning(slug: string) {
    onCloseTool?.(slug);
  }
</script>

<Sheet
  open={open}
  onClose={onClose}
  label="Dock tools"
  dismissOnBack={false}
>
  <div class="switcher">
    <header class="switcher-head">
      <div>
        <p>Dock</p>
        <h3>Tools close by</h3>
      </div>
      <button type="button" aria-label="Close Dock tools" onclick={onClose}>×</button>
    </header>

    <nav class="switcher-nav" aria-label="Dock destinations">
      <button type="button" class="current" aria-current="page" onclick={onClose}>Dock</button>
      <a href="/tools" onclick={onClose}>Tools</a>
      <a href="/you" onclick={onClose}>You</a>
    </nav>

    {#if searchable}
      <label class="switcher-search" aria-label="Search Dock tools">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search your Dock"
          bind:value={query}
        />
        {#if query}
          <button type="button" aria-label="Clear search" onclick={() => (query = '')}>×</button>
        {/if}
      </label>
    {/if}

    {#if hasResults}
      {#each sections as section (section.id)}
        <section class="tool-section" aria-labelledby={`switcher-${section.id}`}>
          <div class="section-head">
            <h4 id={`switcher-${section.id}`}>{section.label}</h4>
            <span>{section.total}</span>
          </div>
          <div class="tool-list">
            {#each section.tools as tool (tool.slug)}
              <ToolRow
                app={railToolToTile(tool)}
                state={stateForTool(tool, section.id)}
                current={section.id === 'open'}
                hideRelationship
                caption={section.id !== 'open' && section.id !== 'saved' && section.id !== 'recent'
                  ? (tool.category ?? 'Tool')
                  : ''}
                onOpen={() => pick(tool.slug)}
                onClose={section.id === 'open' && onCloseTool
                  ? () => { closeRunning(tool.slug); onClose(); }
                  : undefined}
              />
            {/each}
          </div>
          {#if section.hidden > 0}
            <p class="section-more">Showing first {section.tools.length}. Search to narrow {section.hidden} more.</p>
          {/if}
        </section>
      {/each}
    {:else}
      <div class="empty">
        <strong>No tools found</strong>
        <p>Search saved, recent, and running tools here. Browse the catalog from Tools.</p>
        <a href="/tools" onclick={onClose}>Browse tools →</a>
      </div>
    {/if}
  </div>
</Sheet>

<style>
  .switcher {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .switcher-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-light);
  }

  .switcher-head p,
  .switcher-head h3 {
    margin: 0;
  }

  .switcher-head p {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset);
  }

  .switcher-head h3 {
    margin-top: 3px;
    font-family: var(--font-heading);
    font-size: clamp(1.25rem, 3vw, 1.65rem);
    line-height: 1;
    color: var(--text);
  }

  .switcher-head button {
    width: var(--touch-min);
    height: var(--touch-min);
    display: grid;
    place-items: center;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.15rem;
    cursor: pointer;
  }

  .switcher-head button:hover,
  .switcher-head button:focus-visible {
    color: var(--sunset);
    border-color: var(--sunset);
    outline: none;
  }

  .switcher-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .switcher-nav a,
  .switcher-nav button {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .switcher-nav button {
    appearance: none;
    -webkit-appearance: none;
  }

  .switcher-nav .current {
    color: var(--sunset);
    border-color: color-mix(in srgb, var(--sunset) 54%, var(--border-light));
    background: color-mix(in srgb, var(--sunset) 8%, transparent);
  }

  .switcher-nav a:focus-visible,
  .switcher-nav a:hover,
  .switcher-nav button:focus-visible,
  .switcher-nav button:hover {
    color: var(--text);
    border-color: var(--border);
    outline: none;
  }

  .switcher-search {
    min-height: var(--touch-min);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border-light);
    background: var(--surface);
    padding: 0 10px;
  }
  .switcher-search span {
    color: var(--text-light);
    font-family: var(--font-mono);
  }
  .switcher-search input {
    min-width: 0;
    min-height: var(--touch-min);
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    outline: none;
  }
  .switcher-search button {
    width: var(--touch-min);
    height: var(--touch-min);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .switcher-search button:hover,
  .switcher-search button:focus-visible {
    color: var(--sunset);
    border-color: var(--border-light);
  }

  .tool-section {
    display: grid;
    gap: 6px;
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .section-head h4 {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-light);
  }
  .section-head span,
  .section-more {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  /* Rows sit directly on the panel (transparent ToolRows with their own
     dividers) — no nested bordered box, so the list aligns with the header
     and the panel's own elevation carries the layering. */
  .tool-list {
    display: grid;
    border-top: 1px solid var(--border-light);
  }
  .section-more {
    margin: 2px 0 0;
  }
  .empty {
    padding: 4px 0 2px;
    display: grid;
    gap: 8px;
  }
  .empty strong {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text);
  }
  .empty p {
    margin: 0;
    max-width: 42ch;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .empty a {
    min-height: var(--touch-min);
    margin-top: 2px;
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    text-decoration: none;
    text-transform: uppercase;
  }
</style>
