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
  const invitePresets = [
    {
      id: 'device',
      label: 'New device',
      description: 'Single-use handoff for one of your own devices.',
      maxUses: '1',
      expiresDays: '7',
      purpose: 'add-device',
    },
    {
      id: 'friend',
      label: 'One friend',
      description: 'A single-use link for one person.',
      maxUses: '1',
      expiresDays: '30',
      purpose: 'join-space',
    },
    {
      id: 'room',
      label: 'Room QR',
      description: 'Reusable during a live room, class, pub table, or match day.',
      maxUses: '20',
      expiresDays: '1',
      purpose: 'join-space',
    },
    {
      id: 'team',
      label: 'Team',
      description: 'A longer-lived link for a trusted group.',
      maxUses: '50',
      expiresDays: '14',
      purpose: 'join-space',
    },
  ] as const;
  let selectedRole = $state('member');
  let spaceId = $state('');
  let spaceName = $state('');
  let maxUses = $state('1');
  let expiresDays = $state('30');
  let selectedPreset = $state<(typeof invitePresets)[number]['id']>('friend');
  let shareUrl = $state<string | null>(null);
  let hostUrl = $state<string | null>(null);
  let qrMarkup = $state<string | null>(null);
  let selectedExistingSpace = $state('__new');
  let status = $state('');
  let capsuleHint = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let initialised = $state(false);
  const roleOptions = $derived(spaces?.enabled && spaces.roles.length > 0 ? spaces.roles : fallbackRoles);
  const selectedRoleDetails = $derived(roleOptions.find((role) => role.id === selectedRole));

  $effect(() => {
    if (!initialised) {
      selectedRole = roleOptions[0]?.id ?? 'member';
      spaceId = generateSpaceId(slug);
      spaceName = `${appName} private space`;
      applyPreset(spaces?.enabled ? 'room' : 'friend');
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
    capsuleHint = null;
    busy = true;
    status = 'Creating private space invite...';

    try {
      const doc = await import('@shippie/doc');
      const transferId = doc.generateAccessTransferId();
      const body: Record<string, unknown> = { kind: 'link' };
      const joinToken = generateJoinToken();
      const activeSpaceId = spaceId || generateSpaceId(slug);
      if (!spaceId) spaceId = activeSpaceId;
      const activeSpaceName =
        existingSpaces.find((space) => space.id === activeSpaceId)?.name ??
        (spaceName.trim() || `${appName} private space`);
      body.transfer_id = transferId;
      body.space_id = activeSpaceId;
      body.space_name = activeSpaceName;
      body.space_role = selectedRole;
      body.space_join = joinToken;
      const uses = readOptionalPositiveInteger(maxUses, 'Uses', 500);
      if (uses != null) body.max_uses = uses;
      const days = readOptionalPositiveInteger(expiresDays, 'Days', 365);
      if (days != null) {
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

      let nextShareUrl = json.short_url ?? json.url;
      try {
        const spacesPkg = await import('@shippie/spaces');
        const capsule = spacesPkg.createPortableSpaceCapsule({
          spaceId: activeSpaceId,
          joinToken,
          role: selectedRole,
          appSlug: slug,
          appName,
          spaceName: activeSpaceName,
          purpose: invitePresets.find((item) => item.id === selectedPreset)?.purpose ?? 'join-space',
          maxClaims: uses ?? undefined,
          expiresAt: typeof body.expires_at === 'string' ? body.expires_at : undefined,
          routes: [{ kind: spaces?.syncMode === 'hub' ? 'hub' : 'cloud', url: window.location.origin }],
        });
        nextShareUrl = spacesPkg.appendSpaceCapsuleToUrl(nextShareUrl, capsule);
        capsuleHint = spacesPkg.describeSpaceCapsule(capsule).body;
      } catch {
        capsuleHint = null;
      }
      const nextHostUrl = buildHostUrl({
        role: roleOptions.find((role) => role.permissions.includes('invite'))?.id ?? roleOptions[0]?.id ?? 'host',
        spaceId: activeSpaceId,
      });
      shareUrl = nextShareUrl;
      hostUrl = nextHostUrl;
      status = existingSpaces.some((space) => space.id === activeSpaceId)
        ? 'Fresh join link ready. Current members stay in the space.'
        : 'Private space ready. Share the link or QR to let people join.';
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
    spaceName = `${appName} private space`;
    shareUrl = null;
    hostUrl = null;
    qrMarkup = null;
    capsuleHint = null;
    status = 'New space ready. Choose who this link is for.';
  }

  function chooseSpace(value: string) {
    selectedExistingSpace = value;
    if (value === '__new') {
      rotateSpace();
    } else {
      spaceId = value;
      spaceName = existingSpaces.find((space) => space.id === value)?.name ?? spaceName;
      shareUrl = null;
      hostUrl = null;
      qrMarkup = null;
      capsuleHint = null;
      status = 'Existing space selected. Create an invite to rotate a fresh join link.';
    }
  }

  function applyPreset(id: (typeof invitePresets)[number]['id']) {
    const preset = invitePresets.find((item) => item.id === id) ?? invitePresets[0];
    selectedPreset = preset.id;
    maxUses = preset.maxUses;
    expiresDays = preset.expiresDays;
  }

  function readOptionalPositiveInteger(value: string, label: string, max: number): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      throw new Error(`${label} must be a whole number between 1 and ${max}.`);
    }
    return parsed;
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
    <p class="lede">Create a private space for this app. People join from a link or QR, get only the role you choose, and Shippie cannot read the room.</p>
    <div class="presets" aria-label="Invite type">
      {#each invitePresets as preset (preset.id)}
        <button
          type="button"
          class:active={selectedPreset === preset.id}
          onclick={() => applyPreset(preset.id)}
        >
          <strong>{preset.label}</strong>
          <span>{preset.description}</span>
        </button>
      {/each}
    </div>
    <div class="fields">
      {#if existingSpaces.some((space) => space.status === 'active')}
        <label class="wide">
          <span>Space</span>
          <select value={selectedExistingSpace} onchange={(event) => chooseSpace(event.currentTarget.value)}>
            <option value="__new">New private space</option>
            {#each existingSpaces.filter((space) => space.status === 'active') as space (space.id)}
              <option value={space.id}>{space.name} · {space.activeTokenCount} active link{space.activeTokenCount === 1 ? '' : 's'}</option>
            {/each}
          </select>
        </label>
      {/if}
      <label class="wide">
        <span>Space name</span>
        <input bind:value={spaceName} placeholder={`${appName} private space`} />
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
        <span>Uses</span>
        <input bind:value={maxUses} inputmode="numeric" placeholder="1" />
      </label>
      <label>
        <span>Days</span>
        <input bind:value={expiresDays} inputmode="numeric" placeholder="30" />
      </label>
      <button type="button" class="primary" onclick={startShare} disabled={busy}>
        {busy ? 'Creating...' : 'Create space link'}
      </button>
    </div>
    {#if selectedRoleDetails}
      <p class="meta">Role <strong>{selectedRoleDetails.id}</strong> grants {selectedRoleDetails.permissions.join(', ')}.</p>
    {/if}
    <details>
      <summary>Advanced space id</summary>
      <div class="advanced-row">
        <div class="inline-field">
          <input bind:value={spaceId} placeholder="space id" />
          <button type="button" class="ghost compact" onclick={rotateSpace}>New</button>
        </div>
      </div>
    </details>
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
        <p class="result-title">Private link ready</p>
        <p class="url">{shareUrl}</p>
        {#if capsuleHint}
          <p class="capsule-hint">{capsuleHint}</p>
        {/if}
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
    border: 1px solid var(--paper-cream);
    border-left: 3px solid var(--sunset);
  }
  .composer-copy {
    display: grid;
    gap: 0.75rem;
  }
  .lede {
    max-width: 68ch;
    color: var(--ink-soft-warm);
    margin: 0;
  }
  .status {
    color: var(--text-muted-warm);
    margin: 0;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.5rem;
  }
  .presets button {
    height: auto;
    min-height: 76px;
    display: grid;
    align-content: start;
    gap: 0.25rem;
    text-align: left;
    padding: 0.75rem;
    border: 1px solid var(--paper-cream);
    background: transparent;
    color: inherit;
  }
  .presets button.active {
    border-color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
  }
  .presets strong {
    font-size: 13px;
  }
  .presets span {
    font-size: 12px;
    line-height: 1.35;
    color: var(--text-muted-warm);
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
    color: var(--text-muted-warm);
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
    border: 1px solid var(--border-paper-mid);
    background: transparent;
    color: inherit;
    font-family: ui-monospace, monospace;
    font-size: var(--type-body-mobile, 16px);
  }
  label.wide input {
    width: 100%;
  }
  details {
    width: fit-content;
  }
  summary {
    cursor: pointer;
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .advanced-row {
    margin-top: 0.5rem;
  }
  .advanced-row input {
    width: min(360px, 70vw);
  }
  .inline-field {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  button {
    min-height: var(--touch-min);
    border-radius: 0;
    cursor: pointer;
    font-weight: 600;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .primary {
    background: var(--bg);
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
  .result-title {
    margin: 0;
    font-weight: 700;
  }
  .url {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: var(--sunset);
    margin: 0;
    word-break: break-all;
  }
  .host-url,
  .capsule-hint,
  .meta {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: var(--text-muted-warm);
    margin: 0;
    word-break: break-all;
  }
  .capsule-hint {
    max-width: 56ch;
    word-break: normal;
    line-height: 1.45;
  }
  .host-url a {
    color: var(--ink-soft-warm);
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
    background: var(--paper-warm);
    padding: 8px;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .error {
    color: var(--danger);
    font-size: 13px;
    margin: 0;
  }
  @media (max-width: 640px) {
    .presets {
      grid-template-columns: 1fr;
    }
    .result {
      flex-direction: column;
    }
  }
  @media (prefers-color-scheme: dark) {
    .composer {
      border-color: var(--ink-warm);
    }
    .lede {
      color: var(--paper-cream-soft);
    }
    .presets button {
      border-color: var(--ink-warm);
    }
    input,
    select {
      border-color: var(--ink-warm-mid);
    }
    .primary {
      background: var(--sunset);
    }
  }
</style>
