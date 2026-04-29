<script lang="ts">
  let { slug }: { slug: string } = $props();

  let maxUses = $state('');
  let expiresDays = $state('');
  let url = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit() {
    error = null;
    busy = true;
    const body: Record<string, unknown> = { kind: 'link' };
    if (maxUses) body.max_uses = Number(maxUses);
    if (expiresDays) {
      const d = new Date();
      d.setDate(d.getDate() + Number(expiresDays));
      body.expires_at = d.toISOString();
    }
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    busy = false;
    const j = (await res.json().catch(() => ({}))) as { url?: string; short_url?: string | null; error?: string };
    if (j.url) {
      url = j.short_url ?? j.url;
      maxUses = '';
      expiresDays = '';
    } else {
      error = j.error ?? 'Failed';
    }
  }
</script>

<div class="form">
  <label>
    <span>Max uses (optional)</span>
    <input bind:value={maxUses} placeholder="unlimited" />
  </label>
  <label>
    <span>Expires in (days)</span>
    <input bind:value={expiresDays} placeholder="never" />
  </label>
  <button onclick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
  {#if url}
    <p class="url">{url}</p>
  {/if}
  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  .form { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: flex-end; }
  label { display: flex; flex-direction: column; gap: 4px; }
  label span { font-size: 11px; color: #8B847A; font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.12em; }
  input { height: 40px; padding: 0 0.75rem; background: transparent; border: 1px solid #C9C2B1; font-family: ui-monospace, monospace; font-size: 14px; width: 140px; box-sizing: border-box; color: inherit; }
  button {
    height: 40px;
    background: #14120F;
    color: white;
    border: none;
    padding: 0 1.5rem;
    border-radius: 0;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; }
  .url { font-family: ui-monospace, monospace; font-size: 13px; color: #E8603C; flex-basis: 100%; }
  .error { color: #B43F2A; font-size: 13px; }
  @media (prefers-color-scheme: dark) {
    input { border-color: #3A352D; }
    button { background: #E8603C; }
  }
</style>
