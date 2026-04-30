<script lang="ts">
  import { qrSvg } from '@shippie/qr';
  import { toast } from '$lib/stores/toast';

  let { slug }: { slug: string } = $props();

  let maxUses = $state('');
  let expiresDays = $state('');
  let url = $state<string | null>(null);
  let qrMarkup = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit() {
    error = null;
    qrMarkup = null;
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
    const j = (await res.json().catch(() => ({}))) as {
      url?: string;
      short_url?: string | null;
      error?: string;
    };
    if (j.url) {
      url = j.short_url ?? j.url;
      maxUses = '';
      expiresDays = '';
      try {
        qrMarkup = await qrSvg(url, { ecc: 'M', size: 192 });
      } catch {
        qrMarkup = null;
      }
    } else {
      error = j.error ?? 'Failed';
      toast.push({ kind: 'error', message: error });
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ kind: 'success', message: 'Link copied to clipboard.' });
    } catch {
      toast.push({ kind: 'error', message: 'Could not copy. Long-press to copy manually.' });
    }
  }

  async function shareLink() {
    if (!url) return;
    if ('share' in navigator) {
      try {
        await navigator.share({ title: 'Join me on Shippie', text: 'A private invite link.', url });
        return;
      } catch {
        // User cancelled — fall through to copy.
      }
    }
    void copyLink();
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
  <button type="button" onclick={submit} disabled={busy}>
    {busy ? 'Creating…' : 'Create link'}
  </button>
  {#if url}
    <div class="result">
      <div class="result-text">
        <p class="url">{url}</p>
        <div class="actions">
          <button type="button" class="ghost" onclick={copyLink}>Copy</button>
          <button type="button" class="ghost" onclick={shareLink}>Share</button>
        </div>
      </div>
      {#if qrMarkup}
        <div class="qr">{@html qrMarkup}</div>
      {/if}
    </div>
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
  .result { display: flex; gap: 1.25rem; align-items: flex-start; flex-basis: 100%; padding: 1rem 0 0; }
  .result-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .url { font-family: ui-monospace, monospace; font-size: 13px; color: #E8603C; margin: 0; word-break: break-all; }
  .actions { display: flex; gap: 0.5rem; }
  .ghost {
    height: 32px;
    background: transparent;
    color: inherit;
    border: 1px solid currentColor;
    padding: 0 0.875rem;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
  }
  .ghost:hover { background: rgba(232, 96, 60, 0.08); }
  .qr { width: 192px; height: 192px; flex-shrink: 0; background: #FAF7EF; padding: 8px; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .error { color: #B43F2A; font-size: 13px; }
  @media (prefers-color-scheme: dark) {
    input { border-color: #3A352D; }
    button { background: #E8603C; }
    .qr { background: #FAF7EF; }
  }
</style>
