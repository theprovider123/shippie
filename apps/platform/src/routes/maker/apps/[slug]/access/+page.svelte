<script lang="ts">
  import { onMount } from 'svelte';
  import { qrSvg } from '@shippie/qr';
  import VisibilityPicker from '$components/dashboard/VisibilityPicker.svelte';
  import CreateInviteForm from '$components/dashboard/CreateInviteForm.svelte';
  import InviteRow from '$components/dashboard/InviteRow.svelte';
  import PrivateSpaceShareComposer from '$components/dashboard/PrivateSpaceShareComposer.svelte';
  import type { ActionData, PageData } from './$types';
  import { shareStateFor } from '$lib/maker/share';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const activeInvites = $derived(data.invites.filter(isInviteActive));
  const hostRole = $derived(data.spaces?.roles.find((role) => role.permissions.includes('invite'))?.id ?? 'host');
  const canCreatePrivateSpace = $derived(
    Boolean(data.spaces?.enabled || data.app.visibilityScope === 'private' || data.privateSpaces.length > 0),
  );
  const cover = $derived(data.app.screenshotUrls?.[0] ?? '');
  const publicUrl = $derived(`https://${data.app.slug}.shippie.app/`);
  const share = $derived(shareStateFor(data.app));
  let qrMarkup = $state<string | null>(null);
  let copied = $state(false);

  onMount(() => {
    if (shareStateFor(data.app).kind !== 'public') return;
    void qrSvg(publicUrl, { ecc: 'M', size: 148 })
      .then((markup) => (qrMarkup = markup))
      .catch(() => (qrMarkup = null));
  });

  function isInviteActive(invite: (typeof data.invites)[number]): boolean {
    if (invite.revokedAt != null) return false;
    if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return false;
    if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) return false;
    return true;
  }

  async function copyShareUrl() {
    await navigator.clipboard.writeText(publicUrl);
    copied = true;
    window.setTimeout(() => (copied = false), 1400);
  }
</script>

<svelte:head><title>Share & Access · {data.app.name}</title></svelte:head>

<section class="access-page">
  <section id="share" class="block share-block">
    <div class="block-head">
      <p class="eyebrow">Share</p>
      <h2>Launch link</h2>
    </div>
    {#if share.kind === 'public'}
      <div class="share-panel">
        <div class="qr-box" aria-label={`QR code for ${data.app.name}`}>
          {#if qrMarkup}
            {@html qrMarkup}
          {:else}
            <span>QR</span>
          {/if}
        </div>
        <div>
          <strong>Public link</strong>
          <p>{publicUrl}</p>
          <button type="button" onclick={copyShareUrl}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
      </div>
    {:else if share.kind === 'invite'}
      <div class="compact-panel">
        <strong>Invite-only</strong>
        <p>Use private spaces or invite links below. Public QR sharing stays off for this app.</p>
      </div>
    {:else}
      <div class="compact-panel">
        <strong>{share.reason}</strong>
        <p>Ship or fix the app before sharing a public link.</p>
      </div>
    {/if}
  </section>

  <section class="block">
    <div class="block-head">
      <p class="eyebrow">Visibility</p>
      <h2>Who can discover it</h2>
    </div>
    <VisibilityPicker
      slug={data.app.slug}
      initial={data.app.visibilityScope as 'public' | 'unlisted' | 'private' | 'team'}
      organizationId={data.app.organizationId}
    />
  </section>

  {#if canCreatePrivateSpace}
    <section class="block">
      <div class="block-head">
        <p class="eyebrow">Private spaces</p>
        <h2>Create a room or team link</h2>
        {#if data.app.visibilityScope !== 'private'}
          <p>This app can stay listed publicly while each room, household, class, or team space stays private.</p>
        {/if}
      </div>
      <PrivateSpaceShareComposer
        slug={data.app.slug}
        appName={data.app.name}
        spaces={data.spaces}
        existingSpaces={data.privateSpaces}
      />
    </section>
  {/if}

  <section class="block">
    <div class="block-head">
      <p class="eyebrow">Spaces</p>
      <h2>Activity</h2>
    </div>
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
              <a href={`/dock?app=${encodeURIComponent(data.app.slug)}&focused=1&space=${encodeURIComponent(space.id)}&role=${encodeURIComponent(hostRole)}`}>Host</a>
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

  {#if data.app.visibilityScope !== 'private'}
    <section class="block">
      <div class="block-head">
        <p class="eyebrow">Invites</p>
        <h2>Create general invite link</h2>
      </div>
      <CreateInviteForm slug={data.app.slug} />
    </section>
  {/if}

  <section class="block">
    <div class="block-head">
      <p class="eyebrow">Active invites</p>
      <h2>Current links</h2>
    </div>
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
    <div class="block-head">
      <p class="eyebrow">Access list</p>
      <h2>Claims</h2>
    </div>
    {#if data.access.length === 0}
      <p class="muted">Nobody has claimed yet.</p>
    {:else}
      <ul class="claim-list">
        {#each data.access as a (a.id)}
          <li>{a.userId ?? a.email ?? '—'} · {a.source} · {a.grantedAt}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section id="listing" class="block listing">
    <div class="block-head">
      <p class="eyebrow">Public listing</p>
      <h2>Profile, source, license, remix</h2>
    </div>
    {#if form?.ok}<p class="ok">Profile saved.</p>{/if}
    {#if form?.error}<p class="err">{form.error}</p>{/if}
    <form method="POST" action="?/save">
      <label>
        Name
        <input name="name" value={data.app.name} maxlength="80" required />
      </label>
      <label>
        Tagline
        <input name="tagline" value={data.app.tagline ?? ''} maxlength="160" />
      </label>
      <label>
        Category
        <input name="category" value={data.app.category} maxlength="48" required />
      </label>
      <label class="wide">
        Description
        <textarea name="description" rows="7" maxlength="2000">{data.app.description ?? ''}</textarea>
      </label>
      <label>
        Icon URL
        <input name="iconUrl" value={data.app.iconUrl ?? ''} inputmode="url" />
      </label>
      <label>
        Cover image URL
        <input name="coverUrl" value={cover} inputmode="url" />
      </label>
      <label>
        Source repo
        <input name="sourceRepo" value={data.lineage?.sourceRepo ?? data.app.githubRepo ?? ''} inputmode="url" />
      </label>
      <label>
        License
        <input name="license" value={data.lineage?.license ?? ''} placeholder="MIT, AGPL-3.0, Apache-2.0" />
      </label>
      <label>
        Support email
        <input name="supportEmail" value={data.app.supportEmail ?? ''} />
      </label>
      <label>
        Privacy policy URL
        <input name="privacyPolicyUrl" value={data.app.privacyPolicyUrl ?? ''} inputmode="url" />
      </label>
      <label>
        Terms URL
        <input name="termsUrl" value={data.app.termsUrl ?? ''} inputmode="url" />
      </label>
      <label class="check">
        <input name="remixAllowed" type="checkbox" checked={data.lineage?.remixAllowed ?? false} />
        Allow remixing when source and license are present
      </label>
      <button type="submit">Save listing</button>
    </form>
  </section>
</section>

<style>
  .access-page {
    display: grid;
    gap: 2rem;
    max-width: 1080px;
  }
  .block {
    border-top: 1px solid var(--paper-cream);
    padding-top: 1rem;
  }
  .block-head {
    margin-bottom: 0.85rem;
  }
  .eyebrow,
  .metrics span,
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .eyebrow {
    font-size: var(--text-caption);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sunset);
    margin: 0;
  }
  h2 {
    margin: 0.2rem 0 0;
    font-size: var(--text-subhead);
    letter-spacing: 0;
  }
  .block-head p:not(.eyebrow),
  .muted {
    color: var(--text-muted-warm);
  }
  .share-panel {
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 1rem;
    align-items: center;
  }
  .qr-box {
    width: 148px;
    height: 148px;
    padding: 8px;
    border: 1px solid var(--paper-cream);
    background: var(--paper-warm);
    display: grid;
    place-items: center;
    color: var(--text-muted-warm);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--text-caption);
  }
  .qr-box :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .share-panel p,
  .compact-panel p {
    color: var(--text-muted-warm);
    overflow-wrap: anywhere;
  }
  .compact-panel {
    border: 1px dashed var(--border-paper-mid);
    padding: 0.9rem 1rem;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .metrics article {
    min-width: 0;
    border: 1px solid var(--border-light);
    padding: 0.875rem;
  }
  .metrics span {
    display: block;
    color: var(--text-muted-warm);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .metrics strong {
    display: block;
    margin-top: 0.35rem;
    font-size: var(--text-subhead);
    line-height: 1;
  }
  .metrics p {
    margin: 0.35rem 0 0;
    color: var(--text-muted-warm);
    font-size: var(--text-caption);
  }
  .invite-list,
  .space-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .space-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    border: 1px solid var(--paper-cream);
    padding: 0.75rem;
  }
  .space-row.archived {
    opacity: 0.62;
  }
  .space-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  a {
    color: var(--sunset);
    text-decoration: none;
    font-weight: 700;
    font-size: var(--text-small);
  }
  a:hover {
    text-decoration: underline;
  }
  button,
  .space-actions a {
    min-height: var(--touch-min, 44px);
    border: 1px solid var(--border-paper-mid);
    background: transparent;
    color: inherit;
    padding: 0 0.85rem;
    cursor: pointer;
  }
  .share-panel button,
  .listing button {
    border: 0;
    background: var(--sunset);
    color: white;
  }
  .claim-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .claim-list li {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: var(--text-small);
    color: var(--text-muted-warm);
  }
  .listing form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--ink-soft-warm);
    font-size: var(--text-small);
    font-weight: 700;
  }
  label.wide,
  label.check,
  .listing button,
  .ok,
  .err {
    grid-column: 1 / -1;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    font-weight: 500;
  }
  input,
  textarea {
    border: 1px solid var(--border-cream-soft);
    background: transparent;
    padding: 0.7rem;
    font: inherit;
    color: inherit;
  }
  .listing button {
    justify-self: start;
  }
  .ok { color: var(--success); }
  .err { color: var(--danger); }
  @media (prefers-color-scheme: dark) {
    .block,
    .space-row,
    .metrics article,
    .qr-box,
    input,
    textarea {
      border-color: var(--ink-warm);
    }
    .claim-list li {
      border-color: rgba(255,255,255,0.05);
    }
  }
  @media (max-width: 1024px) {
    .metrics {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .share-panel,
    .listing form {
      grid-template-columns: 1fr;
    }
    .qr-box {
      width: 112px;
      height: 112px;
    }
    .metrics {
      grid-template-columns: 1fr;
    }
    .space-row {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
