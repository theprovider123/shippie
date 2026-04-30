<script lang="ts">
  import '$lib/styles/tokens.css';
  import Nav from '$lib/components/layout/Nav.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';
  import Toast from '$lib/components/ui/Toast.svelte';
  import type { LayoutData } from './$types';

  interface Props {
    data: LayoutData;
    children: import('svelte').Snippet;
  }

  let { data, children }: Props = $props();
</script>

<svelte:head>
  <title>Shippie — No app store. Just the web, installed.</title>
  <meta
    name="description"
    content="Build it with AI. On your phone. In 60 seconds. Open marketplace for installable web apps."
  />
  <meta name="theme-color" content="#14120F" />
  <link
    rel="preconnect"
    href="https://fonts.googleapis.com"
  />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
  />
</svelte:head>

<Nav user={data.user} />
<main id="main">
  {@render children()}
</main>
<Footer />
<Toast />

<style>
  main {
    min-height: calc(100vh - var(--nav-height) - var(--safe-top));
  }
</style>
