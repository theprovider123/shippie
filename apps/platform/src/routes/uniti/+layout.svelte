<script lang="ts">
  // Uniti shell — applies the Phase 0 design tokens (teal #1B9B7A /
  // marigold #E8953A, calm soft-shadow cards, Plus Jakarta Sans) to every
  // /uniti/* route. Apps own their colour; this is distinct from Shippie chrome.
  let { children } = $props();
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
  />
</svelte:head>

<div class="uniti-shell">
  {@render children?.()}
</div>

<style>
  .uniti-shell {
    --bg: #f8f7f4;
    --surface: #ffffff;
    --border: #e8e6e3;
    --text: #1a1917;
    --text-muted: #6b6864;
    --text-subtle: #a39f9b;
    --primary: #1b9b7a;
    --primary-dark: #137a60;
    --primary-light: #e4f5f0;
    --accent: #e8953a;
    --accent-light: #fef0dc;
    --got-it: #2ead73;
    --revisit: #d95a57;
    --radius-sm: 8px;
    --radius: 12px;
    --radius-lg: 20px;
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.1);

    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    min-height: 100dvh;
  }
</style>
