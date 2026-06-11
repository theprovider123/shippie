<script lang="ts">
  import { tick } from 'svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
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
        error = "You've sent a few reports already — please try again later.";
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
</script>

<Sheet {open} {onClose} label={`Report ${appName}`}>
  {#if phase === 'done'}
    <div class="done">
      <p class="check" aria-hidden="true">✓</p>
      <p class="ack" role="status">Thanks — Shippie's team will review this report.</p>
      <button class="btn btn-primary" type="button" onclick={onClose}>Done</button>
    </div>
  {:else}
    <header class="head">
      <p class="eyebrow">Report</p>
      <h2>Report {appName}</h2>
    </header>

    <fieldset class="types">
      <legend class="sr-only">Reason</legend>
      {#each REPORT_REASONS as opt}
        <label class="chip" class:active={reason === opt.value}>
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

    <div class="field">
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
        <p class="error" role="alert">{error}</p>
      {/if}
    </div>

    <div class="foot">
      <span class="hint">Shippie is open — we only act on genuinely harmful apps.</span>
      <div class="actions">
        <button class="btn" type="button" onclick={onClose} disabled={phase === 'sending'}>Cancel</button>
        <button class="btn btn-primary" type="button" onclick={send} disabled={phase === 'sending'}>
          {phase === 'sending' ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .head {
    display: grid;
    gap: 0.2rem;
  }
  .eyebrow {
    margin: 0;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .head h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
    line-height: 1.05;
  }
  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    background: var(--border-light);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    flex: 1 1 auto;
    justify-content: center;
    min-height: 36px;
    padding: 0 0.65rem;
    border: 0;
    background: var(--surface);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
  }
  .chip.active {
    background: var(--sunset);
    color: #fff;
  }
  .chip:hover:not(.active) {
    color: var(--text);
    background: rgba(255, 255, 255, 0.04);
  }
  .chip input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .chip:focus-within {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }
  .field {
    display: grid;
    gap: 0;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: inherit;
    font: inherit;
    font-size: var(--text-body);
    line-height: 1.5;
    resize: vertical;
    border-radius: 0;
    min-height: 80px;
  }
  textarea:focus {
    outline: none;
    border-color: var(--sunset);
  }
  textarea:disabled {
    opacity: 0.6;
  }
  .error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(180, 63, 42, 0.35);
    border-top: 0;
    background: rgba(180, 63, 42, 0.06);
    color: var(--danger, #b43f2a);
    font-size: var(--text-small);
    line-height: 1.4;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .hint {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.04em;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }
  .btn {
    min-height: var(--touch-min, 44px);
    padding: 0 1.1rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-small);
    cursor: pointer;
    border-radius: 0;
  }
  .btn:hover {
    border-color: var(--text-secondary);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--sunset) 88%, #fff);
    border-color: color-mix(in srgb, var(--sunset) 88%, #fff);
  }
  .done {
    display: grid;
    justify-items: start;
    gap: 0.55rem;
    padding: 0.25rem 0;
  }
  .check {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-title);
    color: var(--success, #2e7d5b);
    line-height: 1;
  }
  .ack {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-lede);
    color: var(--text);
  }
  .done .btn-primary {
    margin-top: 0.25rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
