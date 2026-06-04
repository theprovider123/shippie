<script lang="ts">
  import { tick } from 'svelte';
  import {
    FEEDBACK_TYPES,
    MAX_FEEDBACK_LEN,
    feedbackAck,
    submitAppFeedback,
    type FeedbackType,
    type ModerationStatus,
  } from '$lib/feedback/submit';

  let {
    open = false,
    appName,
    appSlug,
    onClose,
  }: { open?: boolean; appName: string; appSlug: string; onClose: () => void } = $props();

  type Phase = 'form' | 'sending' | 'done';

  let phase = $state<Phase>('form');
  let type = $state<FeedbackType>('idea');
  let message = $state('');
  let error = $state<string | null>(null);
  let ack = $state('');
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let opened = false;

  // Reset to a clean form each time the sheet opens; focus the message field.
  $effect(() => {
    if (open && !opened) {
      opened = true;
      phase = 'form';
      type = 'idea';
      message = '';
      error = null;
      ack = '';
      void tick().then(() => textarea?.focus());
    } else if (!open) {
      opened = false;
    }
  });

  const canSend = $derived(phase === 'form' && message.trim().length > 0);

  async function send() {
    if (!canSend) return;
    phase = 'sending';
    error = null;
    const result = await submitAppFeedback({ slug: appSlug, type, message });
    if (result.ok) {
      ack = feedbackAck(result.status as ModerationStatus);
      phase = 'done';
    } else {
      error = result.error;
      phase = 'form';
      void tick().then(() => textarea?.focus());
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
    // ⌘/Ctrl+Enter sends from the textarea.
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void send();
    }
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div class="fb-root">
    <button class="fb-overlay" type="button" aria-label="Close feedback" onclick={onClose}></button>
    <div class="fb-sheet" role="dialog" aria-modal="true" aria-label={`Send feedback about ${appName}`}>
      <button class="fb-close" type="button" aria-label="Close" onclick={onClose}>×</button>

      {#if phase === 'done'}
        <div class="fb-done">
          <span class="fb-check" aria-hidden="true">✓</span>
          <p class="fb-ack" role="status">{ack}</p>
          <button class="fb-btn fb-btn-primary" type="button" onclick={onClose}>Done</button>
        </div>
      {:else}
        <header class="fb-head">
          <p class="fb-eyebrow">Feedback</p>
          <h2>How’s {appName}?</h2>
        </header>

        <fieldset class="fb-types">
          <legend class="sr-only">Feedback type</legend>
          {#each FEEDBACK_TYPES as opt}
            <label class="fb-chip" class:active={type === opt.value}>
              <input
                type="radio"
                name="feedback-type"
                value={opt.value}
                checked={type === opt.value}
                onchange={() => (type = opt.value)}
              />
              {opt.label}
            </label>
          {/each}
        </fieldset>

        <textarea
          bind:this={textarea}
          bind:value={message}
          maxlength={MAX_FEEDBACK_LEN}
          rows="4"
          placeholder="What happened, or what would make this better?"
          aria-label="Your feedback"
          disabled={phase === 'sending'}
        ></textarea>

        {#if error}
          <p class="fb-error" role="alert">{error}</p>
        {/if}

        <div class="fb-foot">
          <span class="fb-hint">Goes to the maker. No personal data attached.</span>
          <div class="fb-actions">
            <button class="fb-btn" type="button" onclick={onClose} disabled={phase === 'sending'}>Cancel</button>
            <button class="fb-btn fb-btn-primary" type="button" onclick={send} disabled={!canSend}>
              {phase === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fb-root {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .fb-overlay {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(20, 18, 15, 0.55);
    cursor: pointer;
  }
  .fb-sheet {
    position: relative;
    width: 100%;
    max-width: 380px;
    display: grid;
    gap: 0.85rem;
    padding: 1.4rem 1.25rem 1.2rem;
    background: var(--bg, #faf7ef);
    color: var(--text, #14120f);
    border: 1px solid var(--paper-cream, #e5ddc8);
    box-shadow: 0 24px 60px -28px rgba(20, 18, 15, 0.55);
  }
  .fb-close {
    position: absolute;
    top: 0.3rem;
    right: 0.45rem;
    min-width: 40px;
    min-height: 40px;
    border: 0;
    background: none;
    color: var(--text-muted-warm, #8b847a);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }
  .fb-head {
    display: grid;
    gap: 0.15rem;
  }
  .fb-eyebrow {
    margin: 0;
    color: var(--sunset, #e8603c);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .fb-head h2 {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.3rem;
    line-height: 1.05;
    letter-spacing: 0;
  }
  .fb-types {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .fb-chip {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 0.7rem;
    border: 1px solid var(--paper-cream, #e5ddc8);
    color: var(--text-muted-warm, #8b847a);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }
  .fb-chip.active {
    border-color: var(--sunset, #e8603c);
    background: var(--sunset, #e8603c);
    color: #fff;
  }
  .fb-chip input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .fb-chip:focus-within {
    outline: 2px solid var(--sunset, #e8603c);
    outline-offset: 2px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--paper-cream, #e5ddc8);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 16px;
    line-height: 1.45;
    resize: vertical;
    border-radius: 0;
  }
  textarea:focus {
    outline: none;
    border-color: var(--sunset, #e8603c);
  }
  .fb-error {
    margin: 0;
    color: var(--danger, #b43f2a);
    font-size: 13px;
  }
  .fb-foot {
    display: grid;
    gap: 0.6rem;
  }
  .fb-hint {
    color: var(--text-muted-warm, #8b847a);
    font-size: 11px;
    line-height: 1.3;
  }
  .fb-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .fb-btn {
    min-height: var(--touch-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--paper-cream, #e5ddc8);
    background: var(--bg, #faf7ef);
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    border-radius: 0;
  }
  .fb-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .fb-btn-primary {
    border-color: var(--sunset, #e8603c);
    background: var(--sunset, #e8603c);
    color: #fff;
  }
  .fb-done {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0 0.2rem;
    text-align: center;
  }
  .fb-check {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: rgba(46, 125, 91, 0.15);
    color: var(--success, #2e7d5b);
    font-size: 20px;
  }
  .fb-ack {
    margin: 0;
    font-size: 15px;
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
  @media (prefers-color-scheme: dark) {
    .fb-sheet,
    .fb-chip,
    textarea,
    .fb-btn {
      border-color: var(--ink-warm, #3d352f);
    }
  }
</style>
