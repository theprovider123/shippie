<script lang="ts">
  import { qrSvg } from '@shippie/qr';

  let {
    open = false,
    url,
    title,
    onClose,
  }: { open?: boolean; url: string; title: string; onClose: () => void } = $props();

  let qrMarkup = $state<string | null>(null);
  let copied = $state(false);
  let renderedUrl = '';

  $effect(() => {
    if (open && url && url !== renderedUrl) {
      renderedUrl = url;
      qrMarkup = null;
      void qrSvg(url, { ecc: 'M', size: 220 })
        .then((markup) => (qrMarkup = markup))
        .catch(() => (qrMarkup = null));
    }
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      window.setTimeout(() => (copied = false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function nativeShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    await copyLink();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div class="share-root">
    <button class="overlay" type="button" aria-label="Close share" onclick={onClose}></button>
    <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button class="close" type="button" aria-label="Close" onclick={onClose}>×</button>
      <h2>{title}</h2>
      <div class="qr" aria-hidden="true">
        {#if qrMarkup}
          {@html qrMarkup}
        {:else}
          <span>QR</span>
        {/if}
      </div>
      <p class="url">{url}</p>
      <div class="actions">
        <button type="button" class="primary" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
        <button type="button" onclick={nativeShare}>Share…</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .share-root {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .overlay {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(20, 18, 15, 0.55);
    cursor: pointer;
  }
  .sheet {
    position: relative;
    width: 100%;
    max-width: 340px;
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 1.5rem 1.25rem 1.25rem;
    background: var(--bg, #faf7ef);
    color: var(--text, #14120f);
    border: 1px solid var(--paper-cream);
  }
  .close {
    position: absolute;
    top: 0.35rem;
    right: 0.5rem;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--text-muted-warm);
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }
  h2 {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.2rem;
    text-align: center;
  }
  .qr {
    width: 220px;
    height: 220px;
    display: grid;
    place-items: center;
    padding: 10px;
    background: #fff;
    border: 1px solid var(--paper-cream);
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .url {
    margin: 0;
    color: var(--text-muted-warm);
    font-family: ui-monospace, monospace;
    font-size: 12px;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }
  .actions button {
    flex: 1;
    min-height: var(--touch-min, 44px);
    border: 1px solid var(--paper-cream);
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    border-radius: 0;
  }
  .actions button.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: white;
  }
  @media (prefers-color-scheme: dark) {
    .sheet,
    .qr,
    .actions button {
      border-color: var(--ink-warm);
    }
  }
</style>
