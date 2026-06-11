<script lang="ts">
  import { tick } from 'svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import {
    FEEDBACK_TYPES,
    MAX_FEEDBACK_LEN,
    feedbackAck,
    submitAppFeedback,
    type FeedbackType,
    type ModerationStatus,
  } from '$lib/feedback/submit';
  import { recordLocalFeedback } from '$lib/feedback/local-store';

  interface Props {
    open?: boolean;
    /** App slug — required for app feedback mode. Omit for platform contact mode. */
    appSlug?: string;
    appName?: string;
    /** Pre-select a feedback type on open. */
    initialType?: FeedbackType;
    onClose: () => void;
  }

  let {
    open = false,
    appSlug,
    appName,
    initialType,
    onClose,
  }: Props = $props();

  const isPlatform = $derived(!appSlug);

  type Phase = 'form' | 'sending' | 'done';
  let phase = $state<Phase>('form');
  let type = $state<FeedbackType>(initialType ?? 'idea');
  let message = $state('');
  let error = $state<string | null>(null);
  let ack = $state('');
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let opened = false;

  $effect(() => {
    if (open && !opened) {
      opened = true;
      phase = 'form';
      type = initialType ?? (isPlatform ? 'help' : 'idea');
      message = '';
      error = null;
      ack = '';
      void tick().then(() => textarea?.focus());
    } else if (!open) {
      opened = false;
    }
  });

  const canSend = $derived(phase === 'form' && message.trim().length > 0);

  const heading = $derived(
    isPlatform
      ? 'Get in touch'
      : `How's ${appName ?? 'this app'}?`
  );

  const hintText = $derived(
    isPlatform
      ? 'Sent to the Shippie team.'
      : 'Sent to the maker. No personal data attached.'
  );

  async function send() {
    if (!canSend) return;
    phase = 'sending';
    error = null;
    const trimmed = message.trim();

    if (isPlatform) {
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, message: trimmed }),
        });
        if (!res.ok) throw new Error('non-ok response');
        ack = 'Thanks — message received.';
        phase = 'done';
      } catch {
        error = "Couldn't send that — check your connection and try again.";
        phase = 'form';
        void tick().then(() => textarea?.focus());
      }
      return;
    }

    const result = await submitAppFeedback({ slug: appSlug!, type, message });
    if (result.ok) {
      recordLocalFeedback({
        id: result.id,
        appSlug: appSlug!,
        type,
        message: trimmed,
        createdAt: new Date().toISOString(),
      });
      ack = feedbackAck(result.status as ModerationStatus);
      phase = 'done';
    } else {
      error = result.error;
      phase = 'form';
      void tick().then(() => textarea?.focus());
    }
  }
</script>

<Sheet {open} {onClose} label={heading}>
  {#if phase === 'done'}
    <div class="done">
      <p class="check" aria-hidden="true">✓</p>
      <p class="ack" role="status">{ack}</p>
      <button class="btn btn-primary" type="button" onclick={onClose}>Done</button>
    </div>
  {:else}
    <header class="head">
      <p class="eyebrow">{isPlatform ? 'Contact' : 'Feedback'}</p>
      <h2>{heading}</h2>
    </header>

    <fieldset class="types">
      <legend class="sr-only">Type</legend>
      {#each FEEDBACK_TYPES as opt}
        <label class="chip" class:active={type === opt.value}>
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

    <div class="field">
      <textarea
        bind:this={textarea}
        bind:value={message}
        maxlength={MAX_FEEDBACK_LEN}
        rows="4"
        placeholder={isPlatform
          ? 'What do you need help with?'
          : 'What happened, or what would make this better?'}
        aria-label="Your message"
        disabled={phase === 'sending'}
      ></textarea>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
    </div>

    <div class="foot">
      <span class="hint">{hintText}</span>
      <div class="actions">
        <button class="btn" type="button" onclick={onClose} disabled={phase === 'sending'}>Cancel</button>
        <button class="btn btn-primary" type="button" onclick={send} disabled={!canSend}>
          {phase === 'sending' ? 'Sending…' : error ? 'Retry' : 'Send'}
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
    background: var(--surface-raised, rgba(255,255,255,0.04));
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
    min-height: 100px;
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
