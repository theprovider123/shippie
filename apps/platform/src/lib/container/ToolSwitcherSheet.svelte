<!--
  Mobile tool switcher. This must scale past a few dozen tools, so the
  primary surface is searchable rows with visible names and state instead of
  an icon-only grid. It uses the shared Sheet primitive for scroll lock,
  focus trapping, and back/Escape dismissal.
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
  const totalCount = $derived(allApps.length);
  const searchable = $derived(totalCount > 8);
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
  title="Tools"
  subtitle={`${totalCount} available`}
  dismissOnBack={false}
>
  <div class="switcher">
    <div class="switcher-actions" aria-label="Tool actions">
      <a href="/tools" onclick={onClose}>Add</a>
      <a href="/tools" onclick={onClose}>Explore</a>
      <a href="/workspace?section=data" onclick={onClose}>Data</a>
    </div>

    {#if searchable}
      <label class="switcher-search" aria-label="Search tools">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search by name, category, or slug"
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
                <button type="button" class="tool-open" onclick={() => pick(tool.slug)}>
                  <span class="tool-icon" style="background:{tool.accent}">{tool.icon}</span>
                  <span class="tool-copy">
                    <strong>{tool.name}</strong>
                    <small>
                      {#if section.id === 'open'}
                        Running now
                      {:else if section.id === 'pinned'}
                        Pinned
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
                </button>
                {#if section.id === 'open' && onCloseTool}
                  <button
                    type="button"
                    class="tool-close"
                    aria-label={`Close ${tool.name}`}
                    title="Close"
                    onclick={() => closeRunning(tool.slug)}
                  >×</button>
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
        <p>Try a different name or category.</p>
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
  .switcher-actions a {
    min-height: 40px;
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .switcher-actions a:focus-visible,
  .switcher-actions a:hover {
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
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    outline: none;
  }
  .switcher-search button {
    width: 32px;
    height: 32px;
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
    gap: 1px;
    border: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .tool-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    background: var(--surface);
  }
  .tool-row.running {
    box-shadow: inset 3px 0 0 var(--sunset);
  }
  .tool-open {
    min-width: 0;
    min-height: 58px;
    border: 0;
    background: transparent;
    color: var(--text);
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
  }
  .tool-open:hover,
  .tool-open:focus-visible {
    background: var(--surface-alt);
    outline: none;
  }
  .tool-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    color: var(--bg);
    font-family: var(--font-heading);
    font-size: 0.78rem;
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
    font-size: 0.96rem;
  }
  .tool-copy small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-light);
    font-size: 0.78rem;
  }
  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success-soft);
  }
  .tool-close {
    width: var(--touch-min);
    min-height: 58px;
    border: 0;
    border-left: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.1rem;
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
</style>
