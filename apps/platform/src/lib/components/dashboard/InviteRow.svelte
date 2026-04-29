<script lang="ts">
  let { slug, invite }: {
    slug: string;
    invite: {
      id: string;
      token: string;
      kind: string;
      maxUses: number | null;
      usedCount: number;
      expiresAt: string | null;
    };
  } = $props();

  let busy = $state(false);
  let revoked = $state(false);
  let error = $state<string | null>(null);

  async function revoke() {
    if (!confirm('Revoke this invite?')) return;
    busy = true;
    error = null;
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/invites/${invite.id}`, {
      method: 'DELETE',
    });
    busy = false;
    if (res.ok) {
      revoked = true;
    } else {
      error = 'Failed to revoke';
    }
  }

  const inviteUrl = `/invite/${invite.token}`;
</script>

{#if !revoked}
  <div class="row">
    <span class="kind">{invite.kind}</span>
    <a href={inviteUrl} class="url">{inviteUrl}</a>
    <span class="meta">
      {invite.usedCount}{#if invite.maxUses != null}/{invite.maxUses}{/if} used
      {#if invite.expiresAt} · expires {new Date(invite.expiresAt).toLocaleDateString()}{/if}
    </span>
    <button onclick={revoke} disabled={busy}>Revoke</button>
    {#if error}<span class="error">{error}</span>{/if}
  </div>
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.625rem 0.75rem;
    border: 1px solid #E5DDC8;
    border-radius: 0;
    font-size: 13px;
  }
  .kind { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; background: rgba(0,0,0,0.05); border-radius: 0; }
  .url { font-family: ui-monospace, monospace; color: #E8603C; text-decoration: none; }
  .url:hover { text-decoration: underline; }
  .meta { color: #8B847A; font-family: ui-monospace, monospace; font-size: 11px; }
  button { background: transparent; border: 1px solid #C9C2B1; padding: 4px 12px; border-radius: 0; cursor: pointer; font-size: 12px; }
  .error { color: #B43F2A; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    .row { border-color: #2A251E; }
    .kind { background: rgba(255,255,255,0.05); }
    button { border-color: #3A352D; color: inherit; }
  }
</style>
