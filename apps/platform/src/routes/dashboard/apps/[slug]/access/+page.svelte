<script lang="ts">
  import VisibilityPicker from '$components/dashboard/VisibilityPicker.svelte';
  import CreateInviteForm from '$components/dashboard/CreateInviteForm.svelte';
  import InviteRow from '$components/dashboard/InviteRow.svelte';
  import PrivateSpaceShareComposer from '$components/dashboard/PrivateSpaceShareComposer.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const activeInvites = $derived(data.invites.filter(isInviteActive));
  const hostRole = $derived(
    data.spaces?.roles.find((role) => role.permissions.includes('invite'))?.id ?? 'host',
  );
  const canCreatePrivateSpace = $derived(
    Boolean(data.spaces?.enabled || data.app.visibilityScope === 'private' || data.privateSpaces.length > 0),
  );

  function isInviteActive(invite: (typeof data.invites)[number]): boolean {
    if (invite.revokedAt != null) return false;
    if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return false;
    if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) return false;
    return true;
  }
</script>

<svelte:head><title>Access · {data.app.name}</title></svelte:head>

{#if canCreatePrivateSpace}
  <section class="block share">
    <h2>Create private space</h2>
    {#if data.app.visibilityScope !== 'private'}
      <p class="section-note">
        This app can stay listed publicly while each room, household, class, or team space remains
        private to the people holding its link.
      </p>
    {/if}
    <PrivateSpaceShareComposer
      slug={data.app.slug}
      appName={data.app.name}
      spaces={data.spaces}
      existingSpaces={data.privateSpaces}
    />
  </section>
{/if}

<section class="block">
  <h2>Private spaces</h2>
  <div class="metrics" aria-label="Private space activity">
    <article>
      <span>Spaces</span>
      <strong>{data.privateSpaceMetrics.totalSpaces}</strong>
      <p>{data.privateSpaceMetrics.activeSpaces} active · {data.privateSpaceMetrics.archivedSpaces} archived</p>
    </article>
    <article>
      <span>Join links</span>
      <strong>{data.privateSpaceMetrics.activeJoinLinks}</strong>
      <p>{data.privateSpaceMetrics.totalJoinLinks} created</p>
    </article>
    <article>
      <span>Claims</span>
      <strong>{data.privateSpaceMetrics.totalClaims}</strong>
      <p>aggregate only</p>
    </article>
    <article>
      <span>Invite uses</span>
      <strong>{data.privateSpaceMetrics.totalInviteUses}</strong>
      <p>no member content exposed</p>
    </article>
  </div>
  {#if data.privateSpaces.length === 0}
    <p class="muted">No private spaces yet. Create an invite to start one.</p>
  {:else}
    <div class="space-list">
      {#each data.privateSpaces as space (space.id)}
        <article class:archived={space.status === 'archived'} class="space-row">
          <div>
            <strong>{space.name}</strong>
            <p class="muted mono">
              {space.id} · {space.status}
              {#if space.latestToken}
                · latest {space.latestToken.role}
                · {space.latestToken.inviteUsedCount}{#if space.latestToken.inviteMaxUses != null}/{space.latestToken.inviteMaxUses}{/if} used
              {/if}
              · {space.totalClaimCount} claim{space.totalClaimCount === 1 ? '' : 's'}
            </p>
          </div>
          <div class="space-actions">
            <a href={`/container?app=${encodeURIComponent(data.app.slug)}&focused=1&space=${encodeURIComponent(space.id)}&role=${encodeURIComponent(hostRole)}`}>Host</a>
            {#if space.status !== 'archived'}
              <form method="POST" action="?/archiveSpace">
                <input type="hidden" name="spaceId" value={space.id} />
                <button type="submit">Archive</button>
              </form>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<section class="block">
  <h2>Visibility</h2>
  <VisibilityPicker slug={data.app.slug} initial={data.app.visibilityScope as 'public' | 'unlisted' | 'private'} />
</section>

{#if data.app.visibilityScope !== 'private'}
  <section class="block">
    <h2>Create general invite link</h2>
    <CreateInviteForm slug={data.app.slug} />
  </section>
{/if}

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
  .muted,
  .section-note { color: var(--text-muted-warm); }
  .section-note {
    max-width: 64ch;
    margin: -0.25rem 0 0.875rem;
    line-height: 1.55;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .metrics article {
    min-width: 0;
    border: 1px solid var(--paper-cream);
    padding: 0.875rem;
    background: rgba(250, 247, 239, 0.52);
  }
  .metrics span {
    display: block;
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .metrics strong {
    display: block;
    margin-top: 0.35rem;
    font-size: 1.45rem;
    line-height: 1;
  }
  .metrics p {
    margin: 0.35rem 0 0;
    color: var(--text-muted-warm);
    font-size: 12px;
  }
  .invite-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .space-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .space-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    border: 1px solid var(--paper-cream);
    padding: 0.75rem;
  }
  .space-row.archived { opacity: 0.62; }
  .space-row strong { display: block; margin-bottom: 0.25rem; }
  .mono { font-family: ui-monospace, monospace; font-size: 12px; }
  .space-actions { display: flex; gap: 0.5rem; align-items: center; }
  .space-actions a,
  .space-actions button {
    border: 1px solid var(--border-paper-mid);
    background: transparent;
    color: inherit;
    padding: 4px 12px;
    font-size: 12px;
    text-decoration: none;
    cursor: pointer;
  }
  ul { list-style: none; padding: 0; margin: 0; }
  ul li { padding: 0.5rem 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-family: ui-monospace, monospace; font-size: 13px; color: var(--text-muted-warm); }
  @media (prefers-color-scheme: dark) {
    ul li { border-color: rgba(255,255,255,0.05); }
    .space-row { border-color: var(--ink-warm); }
    .metrics article { border-color: var(--ink-warm); background: rgba(42, 37, 30, 0.48); }
    .space-actions a,
    .space-actions button { border-color: var(--ink-warm-mid); }
  }
  @media (max-width: 1024px) {
    .metrics { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 640px) {
    .metrics { grid-template-columns: 1fr; }
  }
</style>
