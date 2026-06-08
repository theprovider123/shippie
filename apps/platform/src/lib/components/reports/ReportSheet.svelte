<script lang="ts">
  import { tick } from 'svelte';
  import { REPORT_REASONS, REPORT_DETAIL_MAX, type ReportReason } from '$lib/reports/reasons';

  let {
    open = false,
    appName,
    appSlug,
    onClose,
  }: { open?: boolean; appName: string; appSlug: string; onClose: () => void } = $props();

  type Phase = 'form' | 'sending' | 'done';

  let phase = $state<Phase>('form');
  let reason = $state<ReportReason>('malware');
  let detail = $state('');
  let error = $state<string | null>(null);
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let opened = false;

  $effect(() => {
    if (open && !opened) {
      opened = true;
      phase = 'form';
      reason = 'malware';
      detail = '';
      error = null;
      void tick().then(() => textarea?.focus());
    } else if (!open) {
      opened = false;
    }
  });

  async function send() {
    if (phase === 'sending') return;
    phase = 'sending';
    error = null;
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(appSlug)}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, detail: detail.trim() || undefined }),
      });
      if (res.ok) {
        phase = 'done';
      } else if (res.status === 429) {
        error = 'You’ve sent a few reports already — please try again later.';
        phase = 'form';
      } else {
        error = 'Could not send the report. Please try again.';
        phase = 'form';
      }
    } catch {
      error = 'Network error — please try again.';
      phase = 'form';
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void send();
    }
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div class="rp-root">
    <button class="rp-overlay" type="button" aria-label="Close report" onclick={onClose}></button>
    <div class="rp-sheet" role="dialog" aria-modal="true" aria-label={`Report ${appName}`}>
      <button class="rp-close" type="button" aria-label="Close" onclick={onClose}>×</button>

      {#if phase === 'done'}
        <div class="rp-done">
          <span class="rp-check" aria-hidden="true">✓</span>
          <p class="rp-ack" role="status">Thanks — Shippie’s team will review this report.</p>
          <button class="rp-btn rp-btn-primary" type="button" onclick={onClose}>Done</button>
        </div>
      {:else}
        <header class="rp-head">
          <p class="rp-eyebrow">Report</p>
          <h2>Report {appName}</h2>
        </header>

        <fieldset class="rp-reasons">
          <legend class="sr-only">Reason</legend>
          {#each REPORT_REASONS as opt}
            <label class="rp-chip" class:active={reason === opt.value}>
              <input
                type="radio"
                name="report-reason"
                value={opt.value}
                checked={reason === opt.value}
                onchange={() => (reason = opt.value)}
              />
              {opt.label}
            </label>
          {/each}
        </fieldset>

        <textarea
          bind:this={textarea}
          bind:value={detail}
          maxlength={REPORT_DETAIL_MAX}
          rows="3"
          placeholder="Anything that helps us review (optional)."
          aria-label="Report detail"
          disabled={phase === 'sending'}
        ></textarea>

        {#if error}
          <p class="rp-error" role="alert">{error}</p>
        {/if}

        <div class="rp-foot">
          <span class="rp-hint">Shippie is open — we only act on genuinely harmful apps.</span>
          <div class="rp-actions">
            <button class="rp-btn" type="button" onclick={onClose} disabled={phase === 'sending'}>Cancel</button>
            <button class="rp-btn rp-btn-primary" type="button" onclick={send} disabled={phase === 'sending'}>
              {phase === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .rp-root { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 1rem; }
  .rp-overlay { position: absolute; inset: 0; border: 0; padding: 0; background: rgba(20, 18, 15, 0.55); cursor: pointer; }
  .rp-sheet {
    position: relative; width: 100%; max-width: 380px; display: grid; gap: 0.85rem;
    padding: 1.4rem 1.25rem 1.2rem; background: var(--surface, #1e1a15); color: var(--text, #ede4d3);
    border: 1px solid var(--border-light, #2e2822); box-shadow: 0 24px 60px -28px rgba(0, 0, 0, 0.55);
  }
  .rp-close {
    position: absolute; top: 0.3rem; right: 0.45rem; min-width: 40px; min-height: 40px;
    border: 0; background: none; color: var(--text-secondary, #b8a88f); font-size: var(--text-subhead); line-height: 1; cursor: pointer;
  }
  .rp-head { display: grid; gap: 0.15rem; }
  .rp-eyebrow {
    margin: 0; color: var(--sunset, #e8603c); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--text-caption); letter-spacing: 0.14em; text-transform: uppercase;
  }
  .rp-head h2 { margin: 0; font-family: 'Fraunces', Georgia, serif; font-size: var(--text-subhead); line-height: 1.05; }
  .rp-reasons { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; border: 0; }
  .rp-chip {
    display: inline-flex; align-items: center; min-height: 36px; padding: 0 0.7rem;
    border: 1px solid var(--border-light, #2e2822); color: var(--text-secondary, #b8a88f);
    font-size: var(--text-small); font-weight: 600; cursor: pointer; user-select: none;
  }
  .rp-chip.active { border-color: var(--sunset, #e8603c); background: var(--sunset, #e8603c); color: #fff; }
  .rp-chip input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .rp-chip:focus-within { outline: 2px solid var(--sunset, #e8603c); outline-offset: 2px; }
  textarea {
    width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border: 1px solid var(--border-light, #2e2822);
    background: transparent; color: inherit; font: inherit; font-size: var(--text-body); line-height: 1.45; resize: vertical; border-radius: 0;
  }
  textarea:focus { outline: none; border-color: var(--sunset, #e8603c); }
  .rp-error { margin: 0; color: var(--danger, #b43f2a); font-size: var(--text-small); }
  .rp-foot { display: grid; gap: 0.6rem; }
  .rp-hint { color: var(--text-secondary, #b8a88f); font-size: var(--text-caption); line-height: 1.3; }
  .rp-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .rp-btn {
    min-height: var(--touch-min, 44px); padding: 0 1rem; border: 1px solid var(--border-light, #2e2822);
    background: var(--surface, #1e1a15); color: inherit; font: inherit; font-weight: 700; cursor: pointer; border-radius: 0;
  }
  .rp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .rp-btn-primary { border-color: var(--sunset, #e8603c); background: var(--sunset, #e8603c); color: #fff; }
  .rp-done { display: grid; justify-items: center; gap: 0.6rem; padding: 0.6rem 0 0.2rem; text-align: center; }
  .rp-check { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: rgba(46, 125, 91, 0.15); color: var(--success, #2e7d5b); font-size: var(--text-subhead); }
  .rp-ack { margin: 0; font-size: var(--text-body); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
