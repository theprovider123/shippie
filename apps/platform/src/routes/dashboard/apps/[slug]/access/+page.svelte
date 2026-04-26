<script lang="ts">
  import VisibilityPicker from '$components/dashboard/VisibilityPicker.svelte';
  import CreateInviteForm from '$components/dashboard/CreateInviteForm.svelte';
  import InviteRow from '$components/dashboard/InviteRow.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const activeInvites = $derived(data.invites.filter((i) => i.revokedAt == null));
</script>

<svelte:head><title>Access · {data.app.name}</title></svelte:head>

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
  .invite-list { display: flex; flex-direction: column; gap: 0.5rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  ul li { padding: 0.5rem 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-family: ui-monospace, monospace; font-size: 13px; color: #8B847A; }
  @media (prefers-color-scheme: dark) {
    ul li { border-color: rgba(255,255,255,0.05); }
  }
</style>
