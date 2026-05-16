<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { qrSvg } from '@shippie/qr';
  import { toast } from '$lib/stores/toast';

  let { slug, appName }: { slug: string; appName: string } = $props();

  let maxUses = $state('1');
  let expiresDays = $state('30');
  let shareUrl = $state<string | null>(null);
  let qrMarkup = $state<string | null>(null);
  let status = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function startShare() {
    error = null;
    qrMarkup = null;
    shareUrl = null;
    busy = true;
    status = 'Creating private invite...';

    try {
      const doc = await import('@shippie/doc');
      const transferId = doc.generateAccessTransferId();
      const body: Record<string, unknown> = { kind: 'link' };
      const uses = Number(maxUses);
      if (Number.isInteger(uses) && uses > 0) body.max_uses = uses;
      const days = Number(expiresDays);
      if (Number.isFinite(days) && days > 0) {
        const expires = new Date();
        expires.setDate(expires.getDate() + days);
        body.expires_at = expires.toISOString();
      }

      const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/invites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        short_url?: string | null;
        error?: string;
      };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? `Invite returned ${res.status}.`);
      }

      const nextShareUrl = addTransferParam(json.short_url ?? json.url, transferId);
      shareUrl = nextShareUrl;
      status = 'Invite ready. Keep this tab open until the other device joins.';
      try {
        qrMarkup = await qrSvg(nextShareUrl, { ecc: 'M', size: 224 });
      } catch {
        qrMarkup = null;
      }

      try {
        const { openYourData } = await import('@shippie/sdk/wrapper');
        openYourData({
          appSlug: slug,
          transferRelayOrigin: window.location.origin,
          accessTransferId: transferId,
          buildAccessTransferUrl: () => nextShareUrl,
          initialTransferAction: 'add-device',
        });
      } catch {
        status = 'Invite ready. Open Your Data for this app to send sealed data access.';
      }

      await invalidateAll();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not create private invite.';
      toast.push({ kind: 'error', message: error });
      status = '';
    } finally {
      busy = false;
    }
  }

  function addTransferParam(rawUrl: string, transferId: string): string {
    const url = new URL(rawUrl, window.location.origin);
    url.searchParams.set('transfer', transferId);
    return url.toString();
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.push({ kind: 'success', message: 'Private space link copied.' });
    } catch {
      toast.push({ kind: 'error', message: 'Could not copy. Long-press to copy manually.' });
    }
  }

  async function shareLink() {
    if (!shareUrl) return;
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: `Join ${appName}`,
          text: 'Open this private Shippie space.',
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled. Fall through to copy.
      }
    }
    void copyLink();
  }
</script>

<div class="composer">
  <div class="composer-copy">
    <p class="muted">Create one link that grants access, installs the private package, and starts sealed data handoff.</p>
    <div class="fields">
      <label>
        <span>Max uses</span>
        <input bind:value={maxUses} inputmode="numeric" placeholder="1" />
      </label>
      <label>
        <span>Expires in days</span>
        <input bind:value={expiresDays} inputmode="numeric" placeholder="30" />
      </label>
      <button type="button" class="primary" onclick={startShare} disabled={busy}>
        {busy ? 'Creating...' : 'Create private space'}
      </button>
    </div>
    {#if status}
      <p class="status">{status}</p>
    {/if}
    {#if error}
      <p class="error">{error}</p>
    {/if}
  </div>

  {#if shareUrl}
    <div class="result">
      <div class="result-text">
        <p class="url">{shareUrl}</p>
        <div class="actions">
          <button type="button" class="ghost" onclick={shareLink}>Share</button>
          <button type="button" class="ghost" onclick={copyLink}>Copy</button>
        </div>
      </div>
      {#if qrMarkup}
        <div class="qr">{@html qrMarkup}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .composer {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid #E5DDC8;
    border-left: 3px solid #E8603C;
  }
  .composer-copy {
    display: grid;
    gap: 0.75rem;
  }
  .muted,
  .status {
    color: #8B847A;
    margin: 0;
  }
  .fields {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    font-size: 11px;
    color: #8B847A;
    font-family: ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  input {
    height: 40px;
    width: 132px;
    box-sizing: border-box;
    padding: 0 0.75rem;
    border: 1px solid #C9C2B1;
    background: transparent;
    color: inherit;
    font-family: ui-monospace, monospace;
    font-size: 14px;
  }
  button {
    height: 40px;
    border-radius: 0;
    cursor: pointer;
    font-weight: 600;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .primary {
    background: #14120F;
    color: white;
    border: none;
    padding: 0 1.25rem;
  }
  .result {
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
  }
  .result-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.5rem;
  }
  .url {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: #E8603C;
    margin: 0;
    word-break: break-all;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
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
  .ghost:hover {
    background: rgba(232, 96, 60, 0.08);
  }
  .qr {
    width: 224px;
    height: 224px;
    flex-shrink: 0;
    background: #FAF7EF;
    padding: 8px;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .error {
    color: #B43F2A;
    font-size: 13px;
    margin: 0;
  }
  @media (max-width: 640px) {
    .result {
      flex-direction: column;
    }
  }
  @media (prefers-color-scheme: dark) {
    .composer {
      border-color: #2A251E;
    }
    input {
      border-color: #3A352D;
    }
    .primary {
      background: #E8603C;
    }
  }
</style>
