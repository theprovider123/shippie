<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getLocalApp,
    localProfileAvailable,
    markSaved,
    recordAppOpen,
    setFavorite,
    type LocalAppProfile,
    type LocalAppState,
  } from '$lib/client/local-profile';
  import { cachedSlugs, ensureAppOffline, offlineStatuses } from '$lib/stores/cached-slugs';
  import { hydrateLauncherMemory, saveAppToDock } from '$lib/stores/launcher-memory';

  let {
    slug,
    name,
    appUrl,
    showFavorite = true,
    variant = 'default',
    showStatus = true,
  }: {
    slug: string;
    name: string;
    appUrl: string;
    showFavorite?: boolean;
    variant?: 'default' | 'inline';
    showStatus?: boolean;
  } = $props();

  let profile = $state<LocalAppProfile | null>(null);
  let saving = $state(false);
  let message = $state('');

  onMount(() => {
    hydrateLauncherMemory();
  });

  $effect(() => {
    if (!localProfileAvailable()) return;
    void (async () => {
      profile = await recordAppOpen({ slug, name, url: appUrl });
      const current = await getLocalApp(slug);
      if (current) profile = current;
      refreshOfflineStatus();
    })();
  });

  async function toggleFavorite() {
    if (!profile) return;
    profile = await setFavorite(slug, !profile.favorite);
  }

  async function saveToDevice() {
    if (!profile || saving) return;
    saving = true;
    message = 'Saving';
    try {
      saveAppToDock(slug);
      const state = await saveOfflineState();
      profile = await markSaved(slug, state);
      message = state === 'offline_ready' ? 'Saved' : 'Saved';
    } catch {
      profile = await markSaved(slug, 'partial');
      message = 'Saved. Refresh later.';
    } finally {
      saving = false;
    }
  }

  function refreshOfflineStatus() {
    if (!profile) return;
    const status = $offlineStatuses[slug];
    const state = $cachedSlugs.has(slug) || status?.state === 'saved' ? 'offline_ready' : null;
    if (state && state !== profile.state) {
      void markSaved(slug, state).then((next) => {
        if (next) profile = next;
      });
    }
  }

  function stateLabel(state: LocalAppState | undefined): string {
    if (state === 'offline_ready') return 'Saved';
    if (state === 'partial') return 'Saved';
    if (state === 'saved') return 'Saved';
    if (state === 'stale') return 'Update available';
    if (state === 'broken_cache') return 'Needs repair';
    return 'Not saved yet';
  }

  function saveButtonLabel(state: LocalAppState | undefined): string {
    if (saving) return 'Saving';
    if (state === 'offline_ready' || state === 'partial' || state === 'saved') return 'Saved';
    return 'Save';
  }

  async function saveOfflineState(): Promise<LocalAppState> {
    if (!appUrl.startsWith('/run/')) {
      return 'saved';
    }
    const result = await ensureAppOffline(slug);
    if (result?.state === 'saved') return 'offline_ready';
    if (result?.state === 'partial') return 'partial';
    return 'saved';
  }
</script>

<div class="local-actions" class:inline={variant === 'inline'} aria-label="Save this tool">
  {#if profile}
    {#if showFavorite}
      <button type="button" class:active={profile.favorite} onclick={toggleFavorite}>
        {profile.favorite ? 'Saved' : 'Save'}
      </button>
    {/if}
    <button type="button" class="primary" onclick={saveToDevice} disabled={saving || !profile}>
      {saveButtonLabel(profile.state)}
    </button>
    {#if showStatus}
      <span>{message || stateLabel(profile.state)}</span>
    {/if}
  {:else}
    <button type="button" class="primary" disabled>Save</button>
  {/if}
</div>

<style>
  .local-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.75rem;
  }
  .local-actions.inline {
    margin-top: 0;
  }
  button {
    border: 1px solid rgba(20,18,15,0.25);
    background: transparent;
    color: var(--bg);
    padding: 0.55rem 0.8rem;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .local-actions.inline button {
    min-height: 44px;
    border-color: var(--border-light);
    background: var(--surface);
    color: var(--text);
    padding: 0 1.25rem;
    font: inherit;
    font-weight: 600;
  }
  .local-actions.inline button:hover,
  .local-actions.inline button:focus-visible {
    background: var(--surface-alt);
    border-color: var(--sunset);
  }
  button.primary,
  button.active {
    background: var(--bg);
    color: var(--text);
    border-color: var(--bg);
  }
  .local-actions.inline button.primary,
  .local-actions.inline button.active {
    background: var(--surface);
    color: var(--text);
    border-color: var(--border-light);
  }
  button:disabled {
    opacity: 0.65;
    cursor: progress;
  }
  span {
    font-size: 0.82rem;
    color: rgba(20,18,15,0.72);
  }
</style>
