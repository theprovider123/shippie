<script lang="ts">
  import ContainerPage from '../../dock/+page.svelte';
  import type { PageData as ContainerPageData } from '../../dock/$types';
  import type { PageData } from './$types';
  import { pickBaseApps, findRequestedApp } from '$lib/container/app-registry';

  let { data }: { data: PageData } = $props();
  const containerData = $derived(data as unknown as ContainerPageData);
  const sharedApp = $derived(findRequestedApp(pickBaseApps(data.packages), data.requestedAppSlug));
  const shareTitle = $derived(sharedApp ? `${sharedApp.name} · Shippie` : 'Shippie');
  const shareDescription = $derived(
    sharedApp?.description ?? (sharedApp ? `Open ${sharedApp.name} in Shippie.` : 'Open this Shippie tool.'),
  );
  const sharePath = $derived(
    sharedApp ? `/run/${encodeURIComponent(sharedApp.slug)}` : `/run/${encodeURIComponent(data.requestedAppSlug ?? '')}`,
  );
  const shareUrl = $derived(new URL(sharePath, data.origin).toString());
</script>

<svelte:head>
  <title>{shareTitle}</title>
  <meta name="description" content={shareDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={shareTitle} />
  <meta property="og:description" content={shareDescription} />
  <meta property="og:url" content={shareUrl} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={shareTitle} />
  <meta name="twitter:description" content={shareDescription} />
</svelte:head>

<ContainerPage data={containerData} />
