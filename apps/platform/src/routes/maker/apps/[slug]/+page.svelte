<script lang="ts">
  import { onMount } from 'svelte';
  import { qrSvg } from '@shippie/qr';
  import type { PageData, ActionData } from './$types';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';
  import type {
    AppKind,
    AppKindProfile,
    PublicKindStatus,
  } from '$lib/types/app-kind';
  import { pwaChecklist, pwaSurfaceLabel } from '$lib/types/pwa-readiness';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const profile = $derived(data.kindProfile as AppKindProfile | null);
  const detected = $derived<AppKind | null>(profile?.detectedKind ?? null);
  const declared = $derived<AppKind | null>(profile?.declaredKind ?? null);
  const status = $derived<PublicKindStatus | null>(profile?.publicKindStatus ?? null);
  const conflict = $derived(
    profile && declared && declared !== detected ? { declared, detected } : null,
  );
  const probesText = $derived((data.workflowProbes ?? []).join('\n'));
  const pwaReasons = $derived(data.app.currentPwaReadinessReasons ?? []);
  const pwaLabel = $derived(pwaSurfaceLabel(data.app.currentPwaReadiness, pwaReasons));
  const pwaItems = $derived(pwaChecklist(pwaReasons));
  const publicUrl = $derived(`https://${data.app.slug}.shippie.app/`);
  const launchpad = $derived(
    data.launchpad ?? {
      analyticsTotal: 0,
      latestEvent: null,
      lineage: null,
    },
  );
  const hasSource = $derived(Boolean(launchpad.lineage?.sourceRepo || data.app.githubRepo));
  const isRemixable = $derived(
    Boolean(launchpad.lineage?.remixAllowed && launchpad.lineage?.license && hasSource),
  );
  const checklist = $derived([
    {
      label: 'App is live',
      done: Boolean(data.app.activeDeployId || data.deploys.length > 0),
      href: publicUrl,
      action: 'Open',
    },
    {
      label: 'Feedback is ready',
      done: (data.app.feedbackOpenCount ?? 0) > 0,
      href: `/maker/apps/${data.app.slug}/feedback`,
      action: 'Inbox',
    },
    {
      label: 'Analytics has received an event',
      done: launchpad.analyticsTotal > 0,
      href: `/maker/apps/${data.app.slug}/analytics`,
      action: launchpad.analyticsTotal > 0 ? 'View events' : 'Watch first event',
    },
    {
      label: 'Source and remix terms are published',
      done: isRemixable,
      href: `/maker/apps/${data.app.slug}/profile`,
      action: isRemixable ? 'Review' : 'Add source',
    },
    {
      label: 'GitHub is connected',
      done: Boolean(data.app.githubVerified || data.app.githubInstallationId),
      href: data.app.githubVerified ? `/maker/apps/${data.app.slug}/profile` : '/new#github',
      action: data.app.githubVerified ? 'Connected' : 'Connect',
    },
  ]);
  let qrMarkup = $state<string | null>(null);
  let copied = $state(false);

  onMount(() => {
    void qrSvg(publicUrl, { ecc: 'M', size: 148 })
      .then((markup) => (qrMarkup = markup))
      .catch(() => (qrMarkup = null));
  });

  async function shareApp() {
    const payload = {
      title: `${data.app.name} on Shippie`,
      text: data.app.tagline ?? `${data.app.name} on Shippie`,
      url: publicUrl,
    };
    if ('share' in navigator) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // Copy fallback below.
      }
    }
    await navigator.clipboard.writeText(publicUrl);
    copied = true;
    window.setTimeout(() => (copied = false), 1400);
  }
</script>

<script lang="ts" module>
  function buildSdkSnippet(slug: string): string {
    return `import { shippie } from '@shippie/sdk';

shippie.feedback.submit({
  type: 'idea',
  body: 'I would love…',
});`;
  }
  function buildHtmlSnippet(slug: string): string {
    return `<button id="shippie-feedback">Share feedback</button>
<script type="module">
  import { shippie } from 'https://cdn.shippie.app/sdk/v1.latest.js';
  document.getElementById('shippie-feedback')?.addEventListener('click', () => {
    shippie.feedback.open('idea');
  });
</` + `script>`;
  }
</script>

<svelte:head><title>{data.app.name} · Maker</title></svelte:head>

<section class="launchpad">
  <div class="launchpad-stripe" aria-label="Status at a glance">
    <span class="vis vis-{data.app.visibilityScope}">{data.app.visibilityScope}</span>
    <span class="stat">{data.app.installCount ?? 0} opens</span>
    <span class="stat">{data.app.upvoteCount ?? 0} favorites</span>
    <span class="stat">{data.app.feedbackOpenCount ?? 0} feedback</span>
  </div>

  <div class="launchpad-quick">
    <a class="quick" href={`/maker/apps/${data.app.slug}/analytics`}>
      <strong>Analytics</strong>
      <span>Opens, favorites, latest event</span>
    </a>
    <a class="quick" href={`/maker/apps/${data.app.slug}/feedback`}>
      <strong>Feedback</strong>
      <span>Bugs, ideas, ratings</span>
    </a>
    <a class="quick" href={`/maker/apps/${data.app.slug}/profile`}>
      <strong>Profile</strong>
      <span>Source, license, remix</span>
    </a>
    <a class="quick" href={`/apps/${data.app.slug}`}>
      <strong>Trust card</strong>
      <span>What users see before install</span>
    </a>
  </div>

  <div class="ship-panel">
    <div class="qr-card">
      <div class="qr-box" aria-label={`QR code for ${data.app.name}`}>
        {#if qrMarkup}
          {@html qrMarkup}
        {:else}
          <span>QR</span>
        {/if}
      </div>
      <div>
        <strong>Open on phone</strong>
        <p>{publicUrl}</p>
        <button type="button" onclick={shareApp}>{copied ? 'Copied' : 'Share / copy link'}</button>
      </div>
    </div>
    <div class="analytics-card">
      <span>First analytics event</span>
      {#if launchpad.analyticsTotal > 0}
        <strong>{launchpad.analyticsTotal} total events</strong>
        <p>
          Latest: {launchpad.latestEvent?.eventName ?? 'event'}
          {#if launchpad.latestEvent?.createdAt} · {launchpad.latestEvent.createdAt}{/if}
        </p>
      {:else}
        <strong>Waiting for first event</strong>
        <p>Open the live app once after adding the SDK; accepted aggregate events appear here.</p>
      {/if}
      <a href={`/maker/apps/${data.app.slug}/analytics`}>Open analytics →</a>
    </div>
  </div>

  <section class="checklist-card" aria-labelledby="launch-checklist-title">
    <div>
      <p class="eyebrow">Launch checklist</p>
      <h2 id="launch-checklist-title">Make this app easier to trust, improve, and remix.</h2>
    </div>
    <ol>
      {#each checklist as item (item.label)}
        <li class:done={item.done}>
          <span>{item.done ? '✓' : '○'}</span>
          <strong>{item.label}</strong>
          <a href={item.href}>{item.action}</a>
        </li>
      {/each}
    </ol>
  </section>

  <details class="snippet-card">
    <summary>Turn on feedback in your app</summary>
    <p class="hint">
      Drop one of these into your app. Submissions land in your inbox at
      <a href={`/maker/apps/${data.app.slug}/feedback`}>Feedback</a>. Private by
      default — only you see them unless you choose to publish.
    </p>
    <div class="snippet-tabs">
      <details open>
        <summary>SDK (npm)</summary>
        <pre>{buildSdkSnippet(data.app.slug)}</pre>
      </details>
      <details>
        <summary>Plain HTML</summary>
        <pre>{buildHtmlSnippet(data.app.slug)}</pre>
      </details>
    </div>
  </details>

  <details class="snippet-card">
    <summary>Turn on basic analytics</summary>
    <p class="hint">
      Aggregate events help you see whether people can open and use the app. No raw app data or
      cross-app identity is recorded.
    </p>
    <pre>{`import { shippie } from '@shippie/sdk';

shippie.analytics.track('opened');`}</pre>
  </details>
</section>

<section class="grid">
  <div class="card">
    <h2>Connection Status</h2>
    {#if profile && detected}
      {#if detected === 'local'}
        <p class="hint">No external connections detected in the latest app profile.</p>
      {:else}
        <div class="kind-row">
          <KindBadge kind={detected} {status} />
        </div>
      {/if}
      {#if conflict}
        <p class="conflict">
          You declared this as <strong>{conflict.declared}</strong>, but Shippie
          detected <strong>{conflict.detected}</strong>. Public surfaces stay quiet
          unless an external or hosted service is detected.
        </p>
      {/if}
      {#if profile.reasons?.length}
        <details>
          <summary>Why this label?</summary>
          <ul class="reasons">
            {#each profile.reasons as r}<li>{r}</li>{/each}
          </ul>
        </details>
      {/if}
      {#if profile.localization?.candidate}
        <p class="localize">
          <strong>Eligible to localize:</strong>
          {profile.localization.supportedTransforms.join(', ')}.
          <a href={`/maker/apps/${data.app.slug}/localize`}>Run Localize →</a>
        </p>
      {:else if profile.localization?.blockers?.length}
        <p class="muted">
          Localize blockers: {profile.localization.blockers.join(', ')}.
          <a href={`/maker/apps/${data.app.slug}/remix`}>Try Remix →</a>
        </p>
      {/if}

      <details class="actions">
        <summary>Workflow probes</summary>
        <p class="hint">
          One path per line — the wrapper observes whether each probe completes
          while the user is offline, upgrading the kind status from
          "verifying" to "confirmed".
        </p>
        <form method="POST" action="?/saveWorkflowProbes">
          <textarea
            name="probes"
            rows="4"
            placeholder="/recipes/new
/journal"
            value={probesText}
          ></textarea>
          <button type="submit">Save probes</button>
          {#if form?.probesOk}
            <span class="success">Saved {form.probesSaved} probe{form.probesSaved === 1 ? '' : 's'}.</span>
          {/if}
        </form>
      </details>

      {#if status !== 'disputed'}
        <details class="actions">
          <summary>Dispute detection</summary>
          <p class="hint">
            If you believe the detected kind is wrong, tell us why. Reviewed
            within 48 hours.
          </p>
          <form method="POST" action="?/disputeKind">
            <textarea
              name="reason"
              rows="3"
              placeholder="Explain why this label is wrong (≥ 10 chars)"
            ></textarea>
            <button type="submit">Submit dispute</button>
            {#if form?.disputeError}
              <span class="error">{form.disputeError}</span>
            {/if}
            {#if form?.disputeOk}
              <span class="success">Dispute filed.</span>
            {/if}
          </form>
        </details>
      {:else}
        <form method="POST" action="?/clearDispute" class="actions">
          <button type="submit">Clear dispute</button>
          {#if form?.clearOk}
            <span class="success">Status reset.</span>
          {/if}
        </form>
      {/if}
    {:else}
      <p class="muted">No kind profile yet — deploy a version to classify.</p>
    {/if}
  </div>

  <div class="card">
    <h2>PWA Readiness</h2>
    <p><span class="vis">{pwaLabel}</span></p>
    <ul class="checklist">
      {#each pwaItems as item (item.id)}
        <li class:itemOk={item.ok}>
          <span>{item.ok ? '✓' : '×'}</span>
          <div>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </div>
        </li>
      {/each}
    </ul>
    {#if data.app.currentPwaReadiness !== 'confirmed'}
      <details class="actions">
        <summary>Upgrade checklist snippets</summary>
        <p class="hint">Add a manifest link, app icons, theme color, and a service worker. Redeploy, then open on a real device to confirm runtime proof.</p>
        <pre>{`<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#14120F">
navigator.serviceWorker?.register('/sw.js')`}</pre>
      </details>
    {/if}
  </div>

  <div class="card">
    <h2>Visibility</h2>
    <p><span class="vis vis-{data.app.visibilityScope}">{data.app.visibilityScope}</span></p>
    <a href={`/maker/apps/${data.app.slug}/profile`}>Edit profile →</a>
    <a href={`/maker/apps/${data.app.slug}/access`}>Manage access →</a>
  </div>

  <div class="card">
    <h2>Deploys</h2>
    {#if data.deploys.length === 0}
      <p class="muted">No deploys yet.</p>
    {:else}
      <ul>
        {#each data.deploys as d (d.id)}
          <li>
            <span class="ver">v{d.version}</span>
            <span class="status status-{d.status}">{d.status}</span>
            <span class="src">{d.sourceType}</span>
            <span class="time">{d.completedAt ?? d.createdAt}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .launchpad { display: grid; gap: 0.9rem; margin-bottom: 1.25rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sunset); margin: 0; }
  .lede { color: var(--text-muted-warm); margin: 0; }
  .launchpad-stripe { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .launchpad-stripe .stat { font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft-warm); padding: 4px 10px; border: 1px solid var(--paper-cream); }
  .launchpad-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .quick {
    display: grid; gap: 0.2rem; padding: 0.9rem 1rem;
    background: rgba(232, 96, 60, 0.04); border: 1px solid rgba(232, 96, 60, 0.18);
    color: inherit; text-decoration: none;
    min-height: var(--touch-min, 44px);
  }
  .quick:hover { background: rgba(232, 96, 60, 0.08); border-color: var(--sunset); }
  .quick strong { font-size: 14px; }
  .quick span { font-size: 12px; color: var(--text-muted-warm); }
  .ship-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
    gap: 0.75rem;
  }
  .qr-card,
  .analytics-card,
  .checklist-card {
    border: 1px solid var(--paper-cream);
    padding: 1rem;
  }
  .qr-card {
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 1rem;
    align-items: center;
  }
  .qr-box {
    width: 148px;
    height: 148px;
    padding: 8px;
    background: var(--paper-warm);
    border: 1px solid var(--paper-cream);
    display: grid;
    place-items: center;
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .qr-box :global(svg) { width: 100%; height: 100%; display: block; }
  .qr-card p,
  .analytics-card p {
    margin: 0.3rem 0 0.6rem;
    color: var(--text-muted-warm);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .qr-card button,
  .analytics-card a,
  .checklist-card a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    border: 1px solid currentColor;
    background: transparent;
    color: var(--sunset);
    padding: 0 0.75rem;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    text-decoration: none;
    cursor: pointer;
  }
  .analytics-card {
    display: grid;
    align-content: start;
    gap: 0.25rem;
  }
  .analytics-card span {
    font-family: ui-monospace, monospace;
    color: var(--text-muted-warm);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .checklist-card {
    display: grid;
    grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.1fr);
    gap: 1rem;
  }
  .checklist-card h2 {
    margin: 0.2rem 0 0;
    font-size: 1.1rem;
  }
  .checklist-card ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }
  .checklist-card li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
    font-size: 13px;
    border-top: 1px solid var(--paper-cream);
    padding-top: 0.45rem;
  }
  .checklist-card li:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .checklist-card li > span {
    font-family: ui-monospace, monospace;
    color: var(--sunset-dim);
  }
  .checklist-card li.done > span {
    color: var(--success);
  }
  .snippet-card { padding: 1rem 1.25rem; border: 1px dashed var(--border-paper-mid); }
  .snippet-card > summary { cursor: pointer; font-weight: 600; color: var(--sunset); min-height: var(--touch-min, 44px); display: flex; align-items: center; }
  .snippet-tabs { display: grid; gap: 0.6rem; margin-top: 0.6rem; }
  .snippet-tabs > details { padding: 0; }
  .snippet-tabs > details > summary { cursor: pointer; font-family: ui-monospace, monospace; font-size: 12px; text-transform: uppercase; padding: 0.3rem 0; }
  @media (prefers-color-scheme: dark) {
    .launchpad-stripe .stat, .snippet-card, .qr-card, .analytics-card, .checklist-card, .checklist-card li { border-color: var(--ink-warm); }
    .quick { background: rgba(232, 96, 60, 0.06); border-color: rgba(232, 96, 60, 0.22); }
    .lede, .quick span { color: var(--text-secondary); }
    .qr-box { background: var(--paper-warm); border-color: var(--ink-warm); }
  }
  @media (max-width: 640px) {
    .ship-panel,
    .checklist-card {
      grid-template-columns: 1fr;
    }
    .qr-card {
      grid-template-columns: 112px minmax(0, 1fr);
    }
    .qr-box {
      width: 112px;
      height: 112px;
    }
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .card { padding: 1.5rem; border: 1px solid var(--paper-cream); border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 0 0 0.5rem 0; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: grid; grid-template-columns: auto auto auto 1fr; gap: 0.5rem; align-items: center; font-size: 13px; }
  .ver { font-family: ui-monospace, monospace; font-weight: 700; }
  .status { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .status-success { background: rgba(46,125,91,0.15); color: var(--success); }
  .status-failed { background: rgba(180,63,42,0.15); color: var(--danger); }
  .status-building { background: rgba(232,96,60,0.15); color: var(--danger-hover); }
  .src { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted-warm); }
  .time { text-align: right; font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted-warm); }
  .vis { font-family: ui-monospace, monospace; font-size: 12px; padding: 4px 12px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .vis-public { background: rgba(46,125,91,0.15); color: var(--success); }
  .vis-private { background: rgba(180,63,42,0.15); color: var(--danger); }
  .muted { color: var(--text-muted-warm); }
  a { color: var(--sunset); text-decoration: none; font-weight: 600; font-size: 14px; }
  a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    .card { border-color: var(--ink-warm); }
    .status, .vis { background: rgba(255,255,255,0.05); }
  }
  .kind-row { margin: 0.25rem 0 0.75rem 0; }
  .conflict {
    background: rgba(232,197,71,0.12);
    border-left: 3px solid var(--marigold);
    padding: 0.5rem 0.75rem;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    margin: 0.5rem 0;
  }
  .localize {
    background: rgba(46,125,91,0.1);
    border-left: 3px solid var(--success);
    padding: 0.5rem 0.75rem;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    margin: 0.5rem 0;
  }
  details { font-size: 13px; margin-top: 0.5rem; }
  summary { cursor: pointer; color: var(--sunset); font-weight: 600; }
  .reasons { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
  .reasons li { display: list-item; font-size: 12px; color: var(--ink-muted-warm); }
  .actions { margin-top: 0.5rem; }
  .actions textarea {
    width: 100%;
    margin: 0.5rem 0;
    padding: 0.5rem;
    font-family: ui-monospace, monospace;
    font-size: var(--type-body-mobile, 16px);
    border: 1px solid var(--paper-cream);
    border-radius: 0;
    box-sizing: border-box;
  }
  .actions button {
    background: var(--sunset);
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 0;
    font-size: 13px;
    cursor: pointer;
  }
  .actions button:hover { background: var(--danger-hover); }
  .hint { font-size: 12px; color: var(--text-muted-warm); margin: 0.25rem 0; }
  .success { color: var(--success); font-size: 12px; margin-left: 0.5rem; }
  .error { color: var(--danger); font-size: 12px; margin-left: 0.5rem; }
  .checklist { gap: 0.65rem; margin-top: 0.75rem; }
  .checklist li {
    grid-template-columns: auto 1fr;
    align-items: start;
    border-top: 1px solid var(--paper-cream);
    padding-top: 0.65rem;
  }
  .checklist span {
    font-family: ui-monospace, monospace;
    color: var(--danger);
  }
  .checklist .itemOk span { color: var(--success); }
  .checklist strong { display: block; font-size: 13px; }
  .checklist p { margin: 0.15rem 0 0; color: var(--text-muted-warm); font-size: 12px; }
  pre {
    white-space: pre-wrap;
    background: rgba(0,0,0,0.05);
    padding: 0.75rem;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
</style>
