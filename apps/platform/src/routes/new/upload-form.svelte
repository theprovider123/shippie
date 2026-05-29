<script lang="ts" module>
  function formatBytes(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  }
</script>

<script lang="ts">
  import { qrSvg } from '@shippie/qr';

  type Result =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | {
        kind: 'success';
        slug: string;
        liveUrl: string;
        claimUrl?: string;
        expiresAt?: string;
        deployId?: string;
        reportUrl?: string;
        reportJsonUrl?: string;
        version?: number;
        files?: number;
        totalBytes?: number;
        preflightMs?: number;
      }
    | { kind: 'error'; reason: string; blockers?: Array<{ rule: string; title: string; detail?: string }> };

  interface Props {
    trialMode?: boolean;
    initialSlug?: string;
    remixFrom?: string | null;
  }

  let { trialMode = false, initialSlug = 'recipes', remixFrom = null }: Props = $props();
  // svelte-ignore state_referenced_locally -- the slug field should seed once, then stay user-editable.
  const startingSlug = initialSlug;
  let slug = $state(startingSlug);
  let file = $state<File | null>(null);
  let result = $state<Result>({ kind: 'idle' });
  let visibility = $state<'public' | 'unlisted' | 'private'>('public');
  // Surface picker. **Default is "auto"** — never "featured" — so a
  // redeploy that doesn't touch surface preserves an existing arcade
  // app's row instead of silently demoting it. The submit handler
  // appends the form field only when the user picks a non-auto
  // option, leaving the resolver to apply manifest > existing.
  let surfaceChoice = $state<'auto' | 'featured' | 'arcade' | 'labs'>('auto');
  let copied = $state(false);
  let liveQrMarkup = $state<string | null>(null);

  const shareUrl = $derived(
    result.kind === 'success'
      ? visibility === 'private'
        ? `(generating private invite — open the dashboard)`
        : `${typeof window !== 'undefined' ? window.location.origin : ''}/apps/${result.slug}`
      : '',
  );

  async function handleSubmit(ev: SubmitEvent) {
    ev.preventDefault();
    if (!file || (!trialMode && !slug)) return;
    result = { kind: 'submitting' };

    const fd = new FormData();
    if (!trialMode) fd.append('slug', slug);
    if (remixFrom) fd.append('remix_from', remixFrom);
    fd.append('zip', file);
    // Only send surface when the user explicitly picked one. The
    // server-side resolver order is: manifest > form > existing >
    // 'featured'; sending nothing here lets manifest + existing-row
    // win first.
    if (surfaceChoice !== 'auto') fd.append('surface', surfaceChoice);

    try {
      const res = await fetch(trialMode ? '/api/deploy/trial' : '/api/deploy', {
        method: 'POST',
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && j.success) {
        result = {
          kind: 'success',
          slug: String(j.slug),
          liveUrl: String(j.live_url),
          claimUrl: typeof j.claim_url === 'string' ? j.claim_url : undefined,
          expiresAt: typeof j.expires_at === 'string' ? j.expires_at : undefined,
          deployId: typeof j.deploy_id === 'string' ? j.deploy_id : undefined,
          reportUrl: typeof j.report_url === 'string' ? j.report_url : undefined,
          reportJsonUrl: typeof j.report_json_url === 'string' ? j.report_json_url : undefined,
          version: typeof j.version === 'number' ? j.version : undefined,
          files: typeof j.files === 'number' ? j.files : undefined,
          totalBytes: typeof j.total_bytes === 'number' ? j.total_bytes : undefined,
          preflightMs:
            typeof (j.preflight as { duration_ms?: number })?.duration_ms === 'number'
              ? (j.preflight as { duration_ms: number }).duration_ms
              : undefined,
        };
      } else {
        result = {
          kind: 'error',
          reason: String(j.reason ?? j.error ?? 'Deploy failed.'),
          blockers: (
            j.preflight as { blockers?: Array<{ rule: string; title: string; detail?: string }> } | undefined
          )?.blockers,
        };
      }
    } catch (err) {
      result = { kind: 'error', reason: err instanceof Error ? err.message : String(err) };
    }
  }

  function handleFile(e: Event) {
    const t = e.target as HTMLInputElement;
    file = t.files?.[0] ?? null;
  }

  async function patchVisibility(next: 'public' | 'unlisted' | 'private') {
    if (result.kind !== 'success') return;
    const res = await fetch(`/api/apps/${encodeURIComponent(result.slug)}/visibility`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility_scope: next }),
    });
    if (res.ok) visibility = next;
  }

  async function onCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard unavailable — silent
    }
  }

  function absoluteUrl(pathOrUrl: string | undefined): string {
    if (!pathOrUrl) return '';
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  $effect(() => {
    if (result.kind !== 'success') {
      liveQrMarkup = null;
      return;
    }
    let cancelled = false;
    void qrSvg(result.liveUrl, { ecc: 'M', size: 176 })
      .then((svg) => {
        if (!cancelled) liveQrMarkup = svg;
      })
      .catch(() => {
        if (!cancelled) liveQrMarkup = null;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<form onsubmit={handleSubmit} class="form">
  {#if !trialMode}
    <label>
      <span class="label">Slug</span>
      <div class="slug-row">
        <input id="ship-slug" name="slug" bind:value={slug} pattern="[a-z0-9][a-z0-9\-]*" required class="slug-input" />
        <span class="suffix">.shippie.app</span>
      </div>
    </label>
  {:else}
    <div class="trial-note">
      <span class="label">Trial URL</span>
      <p>
        Shippie will choose a temporary <code>trial-*</code> slug and publish it unlisted.
      </p>
    </div>
  {/if}

  <label>
    <span class="label">Zip (built output)</span>
    <input id="ship-zip" name="zip" type="file" accept=".zip,application/zip" onchange={handleFile} required class="file-input" />
  </label>

  <label>
    <span class="label">Where it lives</span>
    <select id="ship-surface" name="surface" bind:value={surfaceChoice} class="surface-select">
      <option value="auto">Auto (use shippie.json or existing setting)</option>
      <option value="featured">App — appears on /apps</option>
      <option value="arcade">Game — appears on /arcade (no ads / tracking / IAP)</option>
      <option value="labs">Experiment — appears on /labs</option>
    </select>
    <span class="hint">
      Auto is best: your shippie.json's <code>curation.surface</code> wins, falling back to the existing app row's surface, then "featured".
    </span>
  </label>

  <button
    type="submit"
    disabled={result.kind === 'submitting' || !file || (!trialMode && !slug)}
    class="btn btn--primary"
  >
    {result.kind === 'submitting' ? 'Shipping…' : trialMode ? 'Ship trial →' : 'Ship it →'}
  </button>

  {#if result.kind === 'success'}
    <div class="success">
      <div class="success-grid">
        <div>
          <p class="success-head">
            ✓ {trialMode ? 'Trial shipped' : 'Shipped'}{result.version ? ` — v${result.version}` : ''}
          </p>
          <p class="live-line">
            Live at
            <a href={result.liveUrl} target="_blank" rel="noreferrer">{result.liveUrl}</a>
          </p>
          <div class="action-row" aria-label="Next actions">
            <a href={result.liveUrl} target="_blank" rel="noreferrer">Open app</a>
            {#if !trialMode}
              <a href={`/dashboard/apps/${result.slug}`}>Launchpad</a>
            {/if}
            {#if result.reportUrl || result.deployId}
              <a href={absoluteUrl(result.reportUrl ?? `/dashboard/apps/${result.slug}/deploys/${result.deployId}`)}>
                Flight Recorder
              </a>
            {/if}
            {#if result.reportJsonUrl}
              <a href={absoluteUrl(result.reportJsonUrl)} target="_blank" rel="noreferrer">Export JSON</a>
            {/if}
          </div>
        </div>
        <div class="qr-panel" aria-label="Install on phone">
          {#if liveQrMarkup}
            <div class="qr">{@html liveQrMarkup}</div>
          {:else}
            <div class="qr-placeholder">QR</div>
          {/if}
          <span>Scan to open on phone</span>
        </div>
      </div>
      {#if result.expiresAt}
        <p>This trial stays live until {new Date(result.expiresAt).toLocaleString()}.</p>
      {/if}
      {#if result.deployId}
        <p>
          Review the App Flight Recorder for policy, package, privacy, security, and proof evidence.
        </p>
      {/if}

      <div class="share-card">
        <div class="share-head">
          <p>{trialMode ? 'Keep this app' : 'Share this app'}</p>
          {#if !trialMode}
            <div class="vis-toggle" role="radiogroup" aria-label="Visibility">
              {#each ['public', 'unlisted', 'private'] as v (v)}
                <button
                  type="button"
                  class:active={visibility === v}
                  onclick={() => patchVisibility(v as 'public' | 'unlisted' | 'private')}>{v}</button>
              {/each}
            </div>
          {/if}
        </div>
        {#if trialMode && result.claimUrl}
          <a class="claim-link" href={result.claimUrl}>Sign in to claim it</a>
        {:else}
          <div class="share-row">
            <input id="ship-share-url" name="share_url" type="text" readonly value={shareUrl} class="share-input" />
            <button type="button" onclick={onCopy} class="copy-btn">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        {/if}
      </div>

      {#if result.files != null || result.totalBytes != null || result.preflightMs != null}
        <p class="meta">
          {#if result.files != null}{result.files} files · {/if}
          {#if result.totalBytes != null}{formatBytes(result.totalBytes)} · {/if}
          {#if result.preflightMs != null}preflight {result.preflightMs}ms{/if}
        </p>
      {/if}
    </div>
  {:else if result.kind === 'error'}
    <div class="error">
      <p class="error-head">✗ {result.reason}</p>
      {#if result.blockers && result.blockers.length > 0}
        <ul>
          {#each result.blockers as b (b.rule + b.title)}
            <li>
              <strong>{b.title}</strong>
              {#if b.detail}
                <span>{b.detail}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</form>

<style>
  .form { display: flex; min-width: 0; max-width: 100%; flex-direction: column; gap: 1rem; }
  label { min-width: 0; }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
  }
  .slug-row { display: flex; min-width: 0; max-width: 100%; align-items: stretch; margin-top: 0.25rem; }
  .slug-input {
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
    height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--border-paper-mid);
    background: transparent;
    font-family: ui-monospace, monospace;
    font-size: var(--type-body-mobile);
    color: inherit;
    border-radius: 0;
    box-sizing: border-box;
  }
  .slug-input:focus { border-color: var(--sunset); outline: none; }
  .suffix {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    height: 44px;
    line-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--border-paper-mid);
    border-left: none;
    background: rgba(0,0,0,0.02);
    font-family: ui-monospace, monospace;
    font-size: 14px;
    color: var(--text-muted-warm);
    border-radius: 0 8px 8px 0;
    overflow-wrap: anywhere;
  }
  .file-input {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin-top: 0.25rem;
    box-sizing: border-box;
  }
  .surface-select {
    margin-top: 0.25rem;
    height: 44px;
    width: 100%;
    padding: 0 0.75rem;
    border: 1px solid var(--border-paper-mid);
    background: transparent;
    font-family: ui-monospace, monospace;
    font-size: var(--type-body-mobile);
    color: inherit;
    border-radius: 0;
    box-sizing: border-box;
  }
  .surface-select:focus { border-color: var(--sunset); outline: none; }
  .hint {
    display: block;
    margin-top: 0.4rem;
    font-size: 12px;
    color: var(--ink-muted-warm);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .hint code { font-family: ui-monospace, monospace; font-size: 11px; }
  .trial-note {
    min-width: 0;
    border-left: 2px solid var(--sunset);
    padding-left: 0.75rem;
  }
  .trial-note p {
    margin: 0.25rem 0 0;
    color: var(--ink-muted-warm);
    font-size: 13px;
    line-height: 1.45;
  }
  /* Submit uses .btn .btn--primary from tokens.css; only the
     left-align override stays local for the form layout. */
  form > .btn { align-self: flex-start; padding: 0 2rem; }
  .success {
    min-width: 0;
    max-width: 100%;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(46,125,91,0.4);
    background: rgba(46,125,91,0.05);
    border-radius: 0;
    color: var(--success);
  }
  .success-head { font-weight: 700; margin: 0; }
  .success-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: start;
    min-width: 0;
  }
  .success-grid > * { min-width: 0; }
  .live-line { margin-bottom: 0.75rem; overflow-wrap: anywhere; }
  .success a { color: inherit; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .action-row a {
    display: inline-flex;
    min-height: var(--touch-min);
    align-items: center;
    padding: 0 0.75rem;
    border: 1px solid rgba(46,125,91,0.35);
    background: rgba(255,255,255,0.52);
    text-decoration: none;
    font-size: var(--type-body-mobile);
    font-weight: 700;
  }
  .qr-panel {
    width: min(176px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    color: var(--ink-muted-warm);
    font-family: ui-monospace, monospace;
    font-size: 10px;
    text-align: center;
  }
  .qr,
  .qr-placeholder {
    width: 176px;
    height: 176px;
    background: var(--paper-warm);
    padding: 8px;
    border: 1px solid rgba(46,125,91,0.25);
    box-sizing: border-box;
  }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .qr-placeholder {
    display: grid;
    place-items: center;
    color: var(--text-muted-warm);
  }
  .meta { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted-warm); margin: 0.5rem 0 0 0; }
  .share-card { min-width: 0; max-width: 100%; margin-top: 0.75rem; padding: 0.75rem; background: rgba(255,255,255,0.5); border-radius: 0; }
  .share-head { display: flex; min-width: 0; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
  .share-head p { font-size: 12px; color: var(--bg); margin: 0; font-weight: 600; }
  .vis-toggle { display: inline-flex; flex: 0 1 auto; flex-wrap: wrap; min-width: 0; gap: 2px; padding: 2px; background: rgba(0,0,0,0.05); border-radius: 0; }
  .vis-toggle button {
    background: transparent;
    border: none;
    padding: 4px 10px;
    border-radius: 0;
    font-size: 11px;
    font-family: ui-monospace, monospace;
    cursor: pointer;
    color: var(--text-muted-warm);
  }
  .vis-toggle button.active { background: var(--success); color: white; }
  .share-row { display: flex; min-width: 0; max-width: 100%; gap: 6px; }
  .share-input {
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
    height: 36px;
    padding: 0 0.625rem;
    font-family: ui-monospace, monospace;
    font-size: var(--type-body-mobile);
    background: white;
    border: 1px solid var(--border-paper-mid);
    border-radius: 0;
    box-sizing: border-box;
    color: inherit;
  }
  .copy-btn {
    height: 36px;
    padding: 0 0.875rem;
    background: transparent;
    border: 1px solid var(--border-paper-mid);
    border-radius: 0;
    font-size: 12px;
    cursor: pointer;
    color: inherit;
  }
  .claim-link {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    padding: 0 0.75rem;
    background: var(--success);
    color: white !important;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .error {
    min-width: 0;
    max-width: 100%;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(180,63,42,0.4);
    background: rgba(180,63,42,0.05);
    border-radius: 0;
    color: var(--danger);
  }
  .error-head { font-weight: 700; margin: 0; }
  .error ul { margin: 0.5rem 0 0 1.25rem; padding: 0; font-family: ui-monospace, monospace; font-size: 12px; }
  .error li + li { margin-top: 0.375rem; }
  .error li span { display: block; margin-top: 0.125rem; color: rgba(180,63,42,0.78); }
  @media (prefers-color-scheme: dark) {
    .slug-input, .suffix, .share-input, .copy-btn { border-color: var(--ink-warm-mid); }
    .suffix { background: rgba(255,255,255,0.03); }
    .share-card { background: rgba(255,255,255,0.04); }
    .share-head p { color: var(--text); }
    .vis-toggle { background: rgba(255,255,255,0.05); }
    .share-input { background: var(--surface); }
    .trial-note p { color: var(--border-cream-soft); }
    .action-row a { background: rgba(255,255,255,0.04); }
    .qr, .qr-placeholder { background: var(--paper-warm); }
  }
  @media (max-width: 640px) {
    form > .btn,
    .copy-btn,
    .claim-link {
      width: 100%;
      justify-content: center;
      box-sizing: border-box;
    }
    .slug-row,
    .share-head,
    .share-row {
      flex-direction: column;
      align-items: stretch;
    }
    .suffix {
      border-left: 1px solid var(--border-paper-mid);
      border-top: 0;
      border-radius: 0;
    }
    .success-grid { grid-template-columns: 1fr; }
    .qr-panel { width: min(176px, 100%); align-items: flex-start; }
  }
</style>
