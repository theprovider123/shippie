<script lang="ts">
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import IconOrMonogram from './IconOrMonogram.svelte';
  import { recordAppLaunch } from '$lib/stores/launcher-memory';

  interface SheetApp {
    slug: string;
    name: string;
    iconUrl: string | null;
    themeColor: string;
    firstPartySigned?: boolean;
  }

  interface Props {
    apps: SheetApp[];
    onClose: () => void;
    onUnpin: (slug: string) => void;
    onSaveOffline: (slug: string) => void;
  }

  let { apps, onClose, onUnpin, onSaveOffline }: Props = $props();

  function launch(slug: string) {
    recordAppLaunch(slug);
    onClose();
  }
</script>

<Sheet open onClose={onClose} label="Manage saved tools">
  <header class="sheet-head">
    <div>
      <p class="eyebrow">Manage</p>
      <h2 id="manage-saved-title">Saved tools</h2>
      <p class="lede">
        Tools kept ready on this device. Open one to launch it; unsave to remove the offline copy.
      </p>
    </div>
    <button
      type="button"
      class="close"
      aria-label="Close manage saved sheet"
      onclick={onClose}
    >
      ×
    </button>
  </header>

  {#if apps.length === 0}
    <p class="empty">No saved tools yet. Tap the ★ on any tool to keep it ready here.</p>
  {:else}
    <ul class="list" role="list">
      {#each apps as app (app.slug)}
        <li class="row">
          <a
            class="row-launch"
            href={`/run/${encodeURIComponent(app.slug)}`}
            aria-label={`Open ${app.name}`}
            onclick={() => launch(app.slug)}
          >
            <span class="row-icon">
              <IconOrMonogram
                name={app.name}
                slug={app.slug}
                iconUrl={app.iconUrl}
                themeColor={app.themeColor}
                size={48}
              />
            </span>
            <span class="row-name">{app.name}</span>
          </a>
          <span class="row-actions">
            <button
              type="button"
              class="row-btn"
              aria-label={`Refresh offline copy of ${app.name}`}
              title="Refresh offline copy"
              onclick={() => onSaveOffline(app.slug)}
            >
              ↻
            </button>
            <button
              type="button"
              class="row-btn danger"
              aria-label={`Remove ${app.name} from saved`}
              title="Unsave"
              onclick={() => onUnpin(app.slug)}
            >
              ★
            </button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</Sheet>

<style>
  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }
  .eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0;
    color: var(--text-light);
  }
  .sheet-head h2 {
    margin: 4px 0 6px;
    font-family: var(--font-heading);
    font-size: 1.5rem;
    letter-spacing: 0;
  }
  .lede {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.5;
    max-width: 36rem;
  }
  .close {
    width: var(--touch-min);
    height: var(--touch-min);
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-light);
    font-family: var(--font-heading);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }
  .close:hover { color: var(--text); border-color: var(--sunset); }
  .close:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }

  .empty {
    color: var(--text-secondary);
    padding: var(--space-md);
    border: 1px dashed var(--border);
    text-align: center;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border-light);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-md);
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-light);
  }
  .row-launch {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .row-icon {
    display: inline-grid;
    place-items: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
  }
  .row-icon :global(.shippie-icon) {
    width: 48px !important;
    height: 48px !important;
  }
  .row-name {
    font-family: var(--font-heading);
    font-size: 1rem;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-actions {
    display: inline-flex;
    gap: 4px;
  }
  .row-btn {
    width: var(--touch-min);
    height: var(--touch-min);
    display: inline-grid;
    place-items: center;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.95rem;
    cursor: pointer;
  }
  .row-btn:hover { color: var(--text); border-color: var(--sunset); }
  .row-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
    color: var(--text);
  }
  .row-btn.danger {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.4);
    background: rgba(232, 197, 71, 0.06);
  }
  .row-btn.danger:hover { color: var(--sunset); border-color: var(--sunset); }
</style>
