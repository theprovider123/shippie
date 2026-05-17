<script lang="ts">
  import {
    getLocalApp,
    localProfileAvailable,
    markSaved,
    recordAppOpen,
    setFavorite,
    type LocalAppProfile,
    type LocalAppState,
  } from '$lib/client/local-profile';

  let {
    slug,
    name,
    appUrl,
    showFavorite = true,
  }: {
    slug: string;
    name: string;
    appUrl: string;
    showFavorite?: boolean;
  } = $props();

  let profile = $state<LocalAppProfile | null>(null);
  let saving = $state(false);
  let message = $state('');

  $effect(() => {
    if (!localProfileAvailable()) return;
    void (async () => {
      profile = await recordAppOpen({ slug, name, url: appUrl });
      const current = await getLocalApp(slug);
      if (current) profile = current;
      void refreshOfflineStatus();
    })();
  });

  async function toggleFavorite() {
    if (!profile) return;
    profile = await setFavorite(slug, !profile.favorite);
  }

  async function saveToDevice() {
    if (!profile || saving) return;
    saving = true;
    message = 'Saving...';
    try {
      const state = await downloadForOffline();
      profile = await markSaved(slug, state);
      message = state === 'offline_ready' ? 'Offline ready on this device.' : 'Saved locally.';
    } catch {
      profile = await markSaved(slug, 'partial');
      message = 'Saved, but offline package is incomplete.';
    } finally {
      saving = false;
    }
  }

  async function refreshOfflineStatus() {
    if (!profile) return;
    try {
      const state = await getOfflineStatus();
      if (state && state !== profile.state) profile = await markSaved(slug, state);
    } catch {
      /* best effort */
    }
  }

  function stateLabel(state: LocalAppState | undefined): string {
    if (state === 'offline_ready') return 'Offline ready';
    if (state === 'partial') return 'Partially saved';
    if (state === 'saved') return 'Saved';
    if (state === 'stale') return 'Update available';
    if (state === 'broken_cache') return 'Needs repair';
    return 'Seen on this device';
  }

  function postToServiceWorker(payload: Record<string, unknown>): Promise<MessageEvent['data']> {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker?.controller) {
        reject(new Error('service worker unavailable'));
        return;
      }
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('service worker timeout')), 20_000);
      channel.port1.onmessage = (event) => {
        if (event.data?.type === 'progress') {
          message = `Saving ${event.data.done}/${event.data.total}`;
          return;
        }
        clearTimeout(timer);
        resolve(event.data);
      };
      navigator.serviceWorker.controller.postMessage(payload, [channel.port2]);
    });
  }

  async function downloadForOffline(): Promise<LocalAppState> {
    if (!appUrl.startsWith('/run/')) {
      return 'saved';
    }
    const result = await postToServiceWorker({ type: 'DOWNLOAD_APP', slug });
    if (result?.state === 'saved') return 'offline_ready';
    if (result?.state === 'partial') return 'partial';
    return 'saved';
  }

  async function getOfflineStatus(): Promise<LocalAppState | null> {
    if (!appUrl.startsWith('/run/')) return null;
    const result = await postToServiceWorker({ type: 'GET_APP_STATUS', slug });
    if (result?.state === 'saved') return 'offline_ready';
    if (result?.state === 'partial') return 'partial';
    return null;
  }
</script>

{#if profile}
  <div class="local-actions" aria-label="Local app controls">
    {#if showFavorite}
      <button type="button" class:active={profile.favorite} onclick={toggleFavorite}>
        {profile.favorite ? 'Favorited' : 'Favorite'}
      </button>
    {/if}
    <button type="button" class="primary" onclick={saveToDevice} disabled={saving}>
      {saving ? 'Saving' : profile.state === 'offline_ready' ? 'Offline ready' : 'Save to device'}
    </button>
    <span>{message || stateLabel(profile.state)}</span>
  </div>
{/if}

<style>
  .local-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.75rem;
  }
  button {
    border: 1px solid rgba(20,18,15,0.25);
    background: transparent;
    color: #14120F;
    padding: 0.55rem 0.8rem;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  button.primary,
  button.active {
    background: #14120F;
    color: #EDE4D3;
    border-color: #14120F;
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
