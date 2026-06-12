<script lang="ts">
  import ContainerPage from '../dock/+page.svelte';
  import type { PageData as ContainerPageData } from '../dock/$types';
  import type { PageData } from './$types';
  import { pickBaseApps, findRequestedApp } from '$lib/container/app-registry';
  import { appShareImageUrl } from '$lib/showcase-slugs';

  let { data }: { data: PageData } = $props();
  const containerData = $derived(data as unknown as ContainerPageData);
  const sharedApp = $derived(findRequestedApp(pickBaseApps(data.packages), data.requestedAppSlug));
  const shareTitle = $derived(sharedApp ? sharedApp.name : 'Shippie');
  const shareDescription = $derived(
    sharedApp?.description ?? (sharedApp ? `Open ${sharedApp.name}.` : 'Open this Shippie tool.'),
  );
  const sharePath = $derived(
    sharedApp ? `/${encodeURIComponent(sharedApp.slug)}` : `/${encodeURIComponent(data.requestedAppSlug ?? '')}`,
  );
  const shareUrl = $derived(new URL(sharePath, 'https://shippie.app').toString());
  const shareImageUrl = $derived(appShareImageUrl(sharedApp?.slug ?? data.requestedAppSlug ?? 'shippie'));
</script>

<svelte:head>
  <title>{shareTitle}</title>
  <meta name="description" content={shareDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Shippie" />
  <meta property="og:title" content={shareTitle} />
  <meta property="og:description" content={shareDescription} />
  <meta property="og:url" content={shareUrl} />
  <meta property="og:image" content={shareImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={shareTitle} />
  <meta name="twitter:description" content={shareDescription} />
  <meta name="twitter:image" content={shareImageUrl} />
</svelte:head>

<ContainerPage data={containerData} suppressPageMeta />
