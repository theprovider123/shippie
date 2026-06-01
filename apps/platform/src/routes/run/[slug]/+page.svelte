<script lang="ts">
  import ContainerPage from '../../workspace/+page.svelte';
  import type { PageData as ContainerPageData } from '../../workspace/$types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const containerData = $derived(data as unknown as ContainerPageData);
</script>

<ContainerPage data={containerData} />
