<!--
  Mobile switcher. It is intentionally scoped to Dock context (running, saved,
  recent); full catalog discovery lives on /tools.
-->
<script lang="ts">
  import Sheet from '$lib/components/ui/Sheet.svelte';
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
  title="Switcher"
  subtitle="Running, saved, and recent"
  dismissOnBack={false}
>
  <div class="switcher">
    <div class="switcher-actions" aria-label="Tool actions">
      <button type="button" onclick={onClose}>Dock</button>
      <a href="/tools" onclick={onClose}>Tools</a>
      <a href="/you" onclick={onClose}>You</a>
    </div>

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
              <div class="tool-row" class:running={section.id === 'open'}>
                <a class="tool-open" href={`/dock?app=${encodeURIComponent(tool.slug)}`} onclick={() => pick(tool.slug)}>
                  <span class="tool-icon" style="background:{tool.accent}">{tool.icon}</span>
                  <span class="tool-copy">
                    <strong>{tool.name}</strong>
                    <small>
                      {#if section.id === 'open'}
                        Running now
                      {:else if section.id === 'saved'}
                        Saved to Dock
                      {:else if section.id === 'recent'}
                        Recent
                      {:else}
                        {tool.category ?? 'Tool'}
                      {/if}
                    </small>
                  </span>
                  {#if section.id === 'open'}
                    <span class="live-dot" aria-hidden="true"></span>
                  {/if}
                </a>
                {#if section.id === 'open' && onCloseTool}
                  <a
                    class="tool-close"
                    href={`/dock?close=${encodeURIComponent(tool.slug)}`}
                    aria-label={`Close ${tool.name}`}
                    title="Close"
                    onclick={() => {
                      closeRunning(tool.slug);
                      onClose();
                    }}
                  >×</a>
                {/if}
              </div>
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

  .switcher-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .switcher-actions a,
  .switcher-actions button {
    min-height: var(--touch-min);
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 0;
    cursor: pointer;
  }
  .switcher-actions button {
    appearance: none;
    -webkit-appearance: none;
  }
  .switcher-actions a:focus-visible,
  .switcher-actions a:hover,
  .switcher-actions button:focus-visible,
  .switcher-actions button:hover {
    color: var(--sunset);
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
  .tool-list {
    display: grid;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .tool-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    background: var(--surface);
    border-bottom: 1px solid var(--border-light);
  }
  .tool-row:last-child { border-bottom: 0; }
  .tool-row.running {
    box-shadow: inset 3px 0 0 var(--sunset);
  }
  .tool-open {
    min-width: 0;
    min-height: 64px;
    border: 0;
    background: transparent;
    color: var(--text);
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .tool-open:hover,
  .tool-open:focus-visible {
    background: var(--surface-alt);
    outline: none;
  }
  .tool-icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    color: var(--bg);
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 700;
  }
  .tool-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .tool-copy strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-heading);
    font-size: 1rem;
    line-height: 1.2;
  }
  .tool-copy small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
  }
  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success-soft);
  }
  .tool-close {
    display: grid;
    place-items: center;
    width: 52px;
    min-height: 64px;
    border: 0;
    border-left: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.1rem;
    text-decoration: none;
    cursor: pointer;
  }
  .tool-close:hover,
  .tool-close:focus-visible {
    color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
    outline: none;
  }
  .section-more {
    margin: 2px 0 0;
  }
  .empty {
    padding: 18px;
    border: 1px solid var(--border-light);
    background: var(--surface);
    display: grid;
    gap: 4px;
  }
  .empty p {
    margin: 0;
    color: var(--text-secondary);
  }
  .empty a {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: 0.76rem;
    letter-spacing: 0.06em;
    text-decoration: none;
    text-transform: uppercase;
  }
</style>
