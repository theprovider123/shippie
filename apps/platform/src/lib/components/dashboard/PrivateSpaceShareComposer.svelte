<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { qrSvg } from '@shippie/qr';
  import { toast } from '$lib/stores/toast';

  type SpaceRole = { id: string; permissions: string[] };
  type SpacesConfig = {
    enabled: boolean;
    roles: SpaceRole[];
    syncMode: 'gossip' | 'sealed-cloud' | 'hub' | 'inherited';
    archivable: boolean;
  };
  type ExistingSpace = {
    id: string;
    name: string;
    status: string;
    activeTokenCount: number;
    latestToken: { id: string; role: string } | null;
  };

  let {
    slug,
    appName,
    spaces = null,
    existingSpaces = [],
  }: {
    slug: string;
    appName: string;
    spaces?: SpacesConfig | null;
    existingSpaces?: ExistingSpace[];
  } = $props();

  const fallbackRoles: SpaceRole[] = [
    { id: 'member', permissions: ['read', 'write'] },
    { id: 'viewer', permissions: ['read'] },
  ];
  const roleOptions = $derived(spaces?.enabled && spaces.roles.length > 0 ? spaces.roles : fallbackRoles);

  let selectedRole = $state('member');
  let spaceId = $state('');
  let maxUses = $state('1');
  let expiresDays = $state('30');
  let shareUrl = $state<string | null>(null);
  let hostUrl = $state<string | null>(null);
  let qrMarkup = $state<string | null>(null);
  let selectedExistingSpace = $state('__new');
  let status = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let initialised = $state(false);

  $effect(() => {
    if (!initialised) {
      selectedRole = roleOptions[0]?.id ?? 'member';
      spaceId = generateSpaceId(slug);
      maxUses = spaces?.enabled ? '20' : '1';
      initialised = true;
    }
    if (!roleOptions.some((role) => role.id === selectedRole)) {
      selectedRole = roleOptions[0]?.id ?? 'member';
    }
  });

  async function startShare() {
    error = null;
    qrMarkup = null;
    shareUrl = null;
    hostUrl = null;
    busy = true;
    status = 'Creating private space invite...';

    try {
      const doc = await import('@shippie/doc');
      const transferId = doc.generateAccessTransferId();
      const body: Record<string, unknown> = { kind: 'link' };
      const joinToken = generateJoinToken();
      const activeSpaceId = spaceId || generateSpaceId(slug);
      if (!spaceId) spaceId = activeSpaceId;
      body.transfer_id = transferId;
      body.space_id = activeSpaceId;
      body.space_name = existingSpaces.find((space) => space.id === activeSpaceId)?.name ?? `${appName} private space`;
      body.space_role = selectedRole;
      body.space_join = joinToken;
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

      const nextShareUrl = json.short_url ?? json.url;
      const nextHostUrl = buildHostUrl({
        role: roleOptions.find((role) => role.permissions.includes('invite'))?.id ?? roleOptions[0]?.id ?? 'host',
        spaceId: activeSpaceId,
      });
      shareUrl = nextShareUrl;
      hostUrl = nextHostUrl;
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

  function buildHostUrl(input: { role: string; spaceId: string }): string {
    const url = new URL('/container', window.location.origin);
    url.searchParams.set('app', slug);
    url.searchParams.set('focused', '1');
    url.searchParams.set('space', input.spaceId);
    url.searchParams.set('role', input.role);
    return url.toString();
  }

  function rotateSpace() {
    selectedExistingSpace = '__new';
    spaceId = generateSpaceId(slug);
    shareUrl = null;
    hostUrl = null;
    qrMarkup = null;
    status = 'New space ready. Create an invite when you are happy with the role.';
  }

  function chooseSpace(value: string) {
    selectedExistingSpace = value;
    if (value === '__new') {
      rotateSpace();
    } else {
      spaceId = value;
      shareUrl = null;
      hostUrl = null;
      qrMarkup = null;
      status = 'Existing space selected. Create an invite to rotate a fresh join link.';
    }
  }

  function generateSpaceId(prefix: string): string {
    return `${prefix.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}_${randomSuffix(10)}`;
  }

  function generateJoinToken(): string {
    return `join_${randomSuffix(16)}`;
  }

  function randomSuffix(length: number): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
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
    <p class="muted">Create one role-bound space link that grants access, installs the private package, and starts sealed data handoff.</p>
    <div class="fields">
      {#if existingSpaces.some((space) => space.status === 'active')}
        <label class="wide">
          <span>Use</span>
          <select value={selectedExistingSpace} onchange={(event) => chooseSpace(event.currentTarget.value)}>
            <option value="__new">New private space</option>
            {#each existingSpaces.filter((space) => space.status === 'active') as space (space.id)}
              <option value={space.id}>{space.name} · {space.activeTokenCount} active link{space.activeTokenCount === 1 ? '' : 's'}</option>
            {/each}
          </select>
        </label>
      {/if}
      <label class="wide">
        <span>Space</span>
        <div class="inline-field">
          <input bind:value={spaceId} placeholder="space id" />
          <button type="button" class="ghost compact" onclick={rotateSpace}>New</button>
        </div>
      </label>
      <label>
        <span>Role</span>
        <select bind:value={selectedRole}>
          {#each roleOptions as role (role.id)}
            <option value={role.id}>{role.id}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Max uses</span>
        <input bind:value={maxUses} inputmode="numeric" placeholder="1" />
      </label>
      <label>
        <span>Expires in days</span>
        <input bind:value={expiresDays} inputmode="numeric" placeholder="30" />
      </label>
      <button type="button" class="primary" onclick={startShare} disabled={busy}>
        {busy ? 'Creating...' : 'Create invite'}
      </button>
    </div>
    {#if spaces?.enabled}
      <p class="meta">This app declares private spaces · {spaces.syncMode} sync · {spaces.archivable ? 'archive ready' : 'live only'}</p>
    {:else}
      <p class="meta">No spaces block found in the latest deploy, so Shippie uses member/viewer role hints for this link.</p>
    {/if}
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
        {#if hostUrl}
          <p class="host-url">Host link: <a href={hostUrl}>{hostUrl}</a></p>
        {/if}
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
  label.wide {
    flex: 1 1 260px;
  }
  label span {
    font-size: 11px;
    color: #8B847A;
    font-family: ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  input,
  select {
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
  label.wide input {
    width: 100%;
  }
  .inline-field {
    display: flex;
    gap: 0.5rem;
    align-items: center;
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
  .host-url,
  .meta {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: #8B847A;
    margin: 0;
    word-break: break-all;
  }
  .host-url a {
    color: #5C5751;
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
  .ghost.compact {
    flex: 0 0 auto;
    height: 40px;
    padding: 0 0.75rem;
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
    input,
    select {
      border-color: #3A352D;
    }
    .primary {
      background: #E8603C;
    }
  }
</style>
