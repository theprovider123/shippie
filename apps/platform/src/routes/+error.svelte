<script lang="ts">
  import { page } from '$app/state';

  function retry() {
    location.reload();
  }
</script>

<svelte:head>
  <title>Something went wrong · Shippie</title>
</svelte:head>

<div class="page">
  <div class="card">
    <svg class="rocket" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" aria-hidden="true">
      <g transform="translate(0,10)">
        <path d="M512 180 L442 250 H582 Z" fill="#EDE4D3"/>
        <path d="M512 180 L512 250 L582 250 Z" fill="#D8C9A5" opacity="0.55"/>
        <rect x="440" y="260" width="64" height="64" fill="#3A4D35"/>
        <rect x="520" y="260" width="64" height="64" fill="#E8603C"/>
        <rect x="440" y="340" width="64" height="64" fill="#5E7B5C"/>
        <rect x="520" y="340" width="64" height="64" fill="#A8C491"/>
        <rect x="440" y="420" width="64" height="64" fill="#5E7B5C"/>
        <rect x="520" y="420" width="64" height="64" fill="#A8C491"/>
        <rect x="440" y="500" width="64" height="64" fill="#3A4D35"/>
        <rect x="520" y="500" width="64" height="64" fill="#7A9A6E"/>
        <rect x="440" y="580" width="64" height="64" fill="#7A9A6E"/>
        <rect x="520" y="580" width="64" height="64" fill="#5E7B5C"/>
        <path d="M356 516 L430 590 L430 676 L356 603 Z" fill="#5E7B5C"/>
        <path d="M356 617 L430 676 L430 708 L356 651 Z" fill="#5E7B5C"/>
        <path d="M668 516 L594 590 L594 676 L668 603 Z" fill="#A8C491"/>
        <path d="M668 617 L594 676 L594 708 L668 651 Z" fill="#A8C491"/>
        <path d="M512 652 C530 690 550 717 552 757 C537 742 522 746 512 780 C502 746 487 742 472 757 C474 717 494 690 512 652 Z" fill="#E8603C"/>
      </g>
    </svg>

    <p class="status">Error {page.status}</p>
    <h1>Something went wrong.</h1>
    <p class="message">{page.error?.message ?? 'The page didn\'t load. Try again, or head back home.'}</p>

    <div class="actions">
      <button class="primary" onclick={retry}>Retry</button>
      <a class="ghost" href="/">Go home</a>
    </div>
  </div>
</div>

<style>
  /* Self-contained — this page may render without the +layout.svelte
     (e.g. when a layout-server-load throws). All styling lives here. */
  .page {
    min-height: 100vh;
    background: #14120F;
    color: #EDE4D3;
    display: grid;
    place-items: center;
    padding: 32px;
    font-family: 'General Sans', system-ui, sans-serif;
  }

  .card {
    max-width: 480px;
    text-align: center;
  }

  .rocket {
    width: 96px;
    height: 96px;
    margin-bottom: 24px;
  }

  .status {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.85rem;
    color: #B8A88F;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 8px;
  }

  h1 {
    font-family: 'Fraunces', serif;
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
    line-height: 1.1;
    margin: 0 0 16px;
    color: #EDE4D3;
  }

  .message {
    font-size: 1rem;
    line-height: 1.5;
    color: #B8A88F;
    margin: 0 0 32px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .primary,
  .ghost {
    font-family: 'General Sans', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 600;
    padding: 12px 24px;
    border: 0;
    cursor: pointer;
    text-decoration: none;
    transition: background 120ms ease;
  }

  .primary {
    background: #E8603C;
    color: #14120F;
  }

  .primary:hover {
    background: #F47552;
  }

  .ghost {
    background: transparent;
    color: #EDE4D3;
    border: 1px solid #3D3530;
  }

  .ghost:hover {
    border-color: #5E7B5C;
    color: #A8C491;
  }
</style>
