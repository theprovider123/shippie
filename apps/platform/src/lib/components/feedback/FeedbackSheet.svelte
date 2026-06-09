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
      <span class="check" aria-hidden="true">✓</span>
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

    <div class="foot">
      <span class="hint">{hintText}</span>
      <div class="actions">
        <button class="btn" type="button" onclick={onClose} disabled={phase === 'sending'}>Cancel</button>
        <button class="btn btn-primary" type="button" onclick={send} disabled={!canSend}>
          {phase === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .head {
    display: grid;
    gap: 0.15rem;
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
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 0.7rem;
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    font-size: var(--text-small);
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }
  .chip.active {
    border-color: var(--sunset);
    background: var(--sunset);
    color: #fff;
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
    outline-offset: 2px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-body);
    line-height: 1.45;
    resize: vertical;
    border-radius: 0;
  }
  textarea:focus {
    outline: none;
    border-color: var(--sunset);
  }
  .error {
    margin: 0;
    color: var(--danger, #b43f2a);
    font-size: var(--text-small);
  }
  .foot {
    display: grid;
    gap: 0.6rem;
  }
  .hint {
    color: var(--text-secondary);
    font-size: var(--text-caption);
    line-height: 1.3;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .btn {
    min-height: var(--touch-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-small);
    font-weight: 600;
    cursor: pointer;
    border-radius: 0;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: #fff;
  }
  .done {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0 0.25rem;
    text-align: center;
  }
  .check {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: rgba(46, 125, 91, 0.15);
    color: var(--success, #2e7d5b);
    font-size: var(--text-subhead);
  }
  .ack {
    margin: 0;
    font-size: var(--text-body);
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
