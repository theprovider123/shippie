<script lang="ts">
  import ContainerPage from '../dock/+page.svelte';
  import type { PageData as ContainerPageData } from '../dock/$types';
  import type { PageData } from './$types';
  import { appShareImageUrl } from '$lib/showcase-slugs';

  let { data }: { data: PageData } = $props();
  const containerData = $derived(data as unknown as ContainerPageData);
  const shareUrl = $derived(new URL('/arcade', 'https://shippie.app').toString());
  const shareImageUrl = $derived(appShareImageUrl('arcade'));
</script>

<svelte:head>
  <title>Arcade</title>
  <meta name="description" content="One Shippie cabinet for the small games: daily puzzles, reflex runs, room games, and strategy." />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Shippie" />
  <meta property="og:title" content="Arcade" />
  <meta property="og:description" content="One Shippie cabinet for the small games." />
  <meta property="og:url" content={shareUrl} />
  <meta property="og:image" content={shareImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Arcade" />
  <meta name="twitter:description" content="One Shippie cabinet for the small games." />
  <meta name="twitter:image" content={shareImageUrl} />
</svelte:head>

<ContainerPage data={containerData} suppressPageMeta />
