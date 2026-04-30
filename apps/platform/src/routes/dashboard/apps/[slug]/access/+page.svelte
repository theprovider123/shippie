<script lang="ts">
  import VisibilityPicker from '$components/dashboard/VisibilityPicker.svelte';
  import CreateInviteForm from '$components/dashboard/CreateInviteForm.svelte';
  import InviteRow from '$components/dashboard/InviteRow.svelte';
  import { qrSvg } from '@shippie/qr';
  import { toast } from '$lib/stores/toast';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const activeInvites = $derived(data.invites.filter((i) => i.revokedAt == null));
  const latest = $derived(activeInvites.length > 0 ? activeInvites[activeInvites.length - 1]! : null);

  let latestUrl = $state<string | null>(null);
  let qrMarkup = $state<string | null>(null);

  $effect(() => {
    if (typeof window === 'undefined' || !latest) {
      latestUrl = null;
      qrMarkup = null;
      return;
    }
    const url = `${window.location.origin}/invite/${latest.token}`;
    latestUrl = url;
    void qrSvg(url, { ecc: 'M', size: 224 })
      .then((svg) => {
        qrMarkup = svg;
      })
      .catch(() => {
        qrMarkup = null;
      });
  });

  async function copyLatest() {
    if (!latestUrl) return;
    try {
      await navigator.clipboard.writeText(latestUrl);
      toast.push({ kind: 'success', message: 'Link copied to clipboard.' });
    } catch {
      toast.push({ kind: 'error', message: 'Could not copy. Long-press to copy manually.' });
    }
  }

  async function shareLatest() {
    if (!latestUrl) return;
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: `Join me on ${data.app.name}`,
          text: 'A private invite link.',
          url: latestUrl,
        });
        return;
      } catch {
        // User cancelled — fall through.
      }
    }
    void copyLatest();
  }
</script>

<svelte:head><title>Access · {data.app.name}</title></svelte:head>

{#if data.app.visibilityScope === 'private'}
  <section class="block share">
    <h2>Share this link</h2>
    {#if latest && latestUrl}
      <div class="share-card">
        <div class="share-text">
          <p class="share-url">{latestUrl}</p>
          <p class="muted">
            {#if latest.maxUses}
              {latest.usedCount} / {latest.maxUses} uses
            {:else}
              {latest.usedCount} use{latest.usedCount === 1 ? '' : 's'}
            {/if}
            {#if latest.expiresAt}
              · expires {new Date(latest.expiresAt).toLocaleDateString()}
            {/if}
          </p>
          <div class="share-actions">
            <button type="button" class="primary" onclick={shareLatest}>Share</button>
            <button type="button" class="ghost" onclick={copyLatest}>Copy link</button>
          </div>
        </div>
        {#if qrMarkup}
          <div class="qr">{@html qrMarkup}</div>
        {/if}
      </div>
    {:else}
      <p class="muted">Create an invite link below to get a QR you can scan or share.</p>
    {/if}
  </section>
{/if}

<section class="block">
  <h2>Visibility</h2>
  <VisibilityPicker slug={data.app.slug} initial={data.app.visibilityScope as 'public' | 'unlisted' | 'private'} />
</section>

<section class="block">
  <h2>Create invite link</h2>
  <CreateInviteForm slug={data.app.slug} />
</section>

<section class="block">
  <h2>Active invites</h2>
  {#if activeInvites.length === 0}
    <p class="muted">No invites yet.</p>
  {:else}
    <div class="invite-list">
      {#each activeInvites as inv (inv.id)}
        <InviteRow slug={data.app.slug} invite={{
          id: inv.id,
          token: inv.token,
          kind: inv.kind,
          maxUses: inv.maxUses,
          usedCount: inv.usedCount,
          expiresAt: inv.expiresAt,
        }} />
      {/each}
    </div>
  {/if}
</section>

<section class="block">
  <h2>Access list</h2>
  {#if data.access.length === 0}
    <p class="muted">Nobody has claimed yet.</p>
  {:else}
    <ul>
      {#each data.access as a (a.id)}
        <li>{a.userId ?? a.email ?? '—'} · {a.source} · {a.grantedAt}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .block { margin-bottom: 2.5rem; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 0 0 0.75rem 0; }
  .muted { color: #8B847A; }
  .share-card {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    padding: 1.25rem;
    border: 1px solid #E5DDC8;
    border-left: 3px solid #E8603C;
  }
  .share-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .share-url {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: #E8603C;
    margin: 0;
    word-break: break-all;
  }
  .share-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
  .share-actions .primary {
    height: 36px;
    background: #E8603C;
    color: white;
    border: none;
    padding: 0 1.25rem;
    border-radius: 0;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    cursor: pointer;
  }
  .share-actions .ghost {
    height: 36px;
    background: transparent;
    color: inherit;
    border: 1px solid currentColor;
    padding: 0 1.25rem;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    cursor: pointer;
  }
  .share-actions .ghost:hover { background: rgba(232, 96, 60, 0.08); }
  .qr { width: 224px; height: 224px; flex-shrink: 0; background: #FAF7EF; padding: 8px; box-sizing: content-box; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  @media (max-width: 600px) {
    .share-card { flex-direction: column; }
  }
  @media (prefers-color-scheme: dark) {
    .share-card { border-color: #2A251E; }
  }
  .invite-list { display: flex; flex-direction: column; gap: 0.5rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  ul li { padding: 0.5rem 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-family: ui-monospace, monospace; font-size: 13px; color: #8B847A; }
  @media (prefers-color-scheme: dark) {
    ul li { border-color: rgba(255,255,255,0.05); }
  }
</style>
