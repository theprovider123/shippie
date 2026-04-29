<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';
  import type {
    AppKind,
    AppKindProfile,
    PublicKindStatus,
  } from '$lib/types/app-kind';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const profile = $derived(data.kindProfile as AppKindProfile | null);
  const detected = $derived<AppKind | null>(profile?.detectedKind ?? null);
  const declared = $derived<AppKind | null>(profile?.declaredKind ?? null);
  const status = $derived<PublicKindStatus | null>(profile?.publicKindStatus ?? null);
  const conflict = $derived(
    profile && declared && declared !== detected ? { declared, detected } : null,
  );
  const probesText = $derived((data.workflowProbes ?? []).join('\n'));
</script>

<svelte:head><title>{data.app.name} · Dashboard</title></svelte:head>

<section class="grid">
  <div class="card">
    <h2>App Kind</h2>
    {#if profile && detected}
      <div class="kind-row">
        <KindBadge kind={detected} {status} />
      </div>
      {#if conflict}
        <p class="conflict">
          You declared this as <strong>{conflict.declared}</strong>, but Shippie
          detected <strong>{conflict.detected}</strong>. The marketplace shows
          the detected kind.
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
          <a href={`/dashboard/apps/${data.app.slug}/localize`}>Run Localize →</a>
        </p>
      {:else if profile.localization?.blockers?.length}
        <p class="muted">
          Localize blockers: {profile.localization.blockers.join(', ')}.
          <a href={`/dashboard/apps/${data.app.slug}/remix`}>Try Remix →</a>
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
    <h2>Visibility</h2>
    <p><span class="vis vis-{data.app.visibilityScope}">{data.app.visibilityScope}</span></p>
    <a href={`/dashboard/apps/${data.app.slug}/access`}>Manage access →</a>
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
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .card { padding: 1.5rem; border: 1px solid #E5DDC8; border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 0 0 0.5rem 0; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: grid; grid-template-columns: auto auto auto 1fr; gap: 0.5rem; align-items: center; font-size: 13px; }
  .ver { font-family: ui-monospace, monospace; font-weight: 700; }
  .status { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .status-success { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .status-failed { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .status-building { background: rgba(232,96,60,0.15); color: #B44820; }
  .src { font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; }
  .time { text-align: right; font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; }
  .vis { font-family: ui-monospace, monospace; font-size: 12px; padding: 4px 12px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .vis-public { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .vis-private { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .muted { color: #8B847A; }
  a { color: #E8603C; text-decoration: none; font-weight: 600; font-size: 14px; }
  a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    .card { border-color: #2A251E; }
    .status, .vis { background: rgba(255,255,255,0.05); }
  }
  .kind-row { margin: 0.25rem 0 0.75rem 0; }
  .conflict {
    background: rgba(232,197,71,0.12);
    border-left: 3px solid #E8C547;
    padding: 0.5rem 0.75rem;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    margin: 0.5rem 0;
  }
  .localize {
    background: rgba(46,125,91,0.1);
    border-left: 3px solid #2E7D5B;
    padding: 0.5rem 0.75rem;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    margin: 0.5rem 0;
  }
  details { font-size: 13px; margin-top: 0.5rem; }
  summary { cursor: pointer; color: #E8603C; font-weight: 600; }
  .reasons { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
  .reasons li { display: list-item; font-size: 12px; color: #6E665B; }
  .actions { margin-top: 0.5rem; }
  .actions textarea {
    width: 100%;
    margin: 0.5rem 0;
    padding: 0.5rem;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    border: 1px solid #E5DDC8;
    border-radius: 0;
    box-sizing: border-box;
  }
  .actions button {
    background: #E8603C;
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 0;
    font-size: 13px;
    cursor: pointer;
  }
  .actions button:hover { background: #B44820; }
  .hint { font-size: 12px; color: #8B847A; margin: 0.25rem 0; }
  .success { color: #2E7D5B; font-size: 12px; margin-left: 0.5rem; }
  .error { color: #B43F2A; font-size: 12px; margin-left: 0.5rem; }
</style>
