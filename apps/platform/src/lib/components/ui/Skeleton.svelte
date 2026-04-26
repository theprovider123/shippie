<script lang="ts">
  interface Props {
    height?: string;
    width?: string;
  }

  let { height = '48px', width = '100%' }: Props = $props();
</script>

<div class="skeleton" style="height: {height}; width: {width};"></div>

<style>
  .skeleton {
    background: var(--surface);
    border-radius: 8px;
    animation: shimmer 1.5s ease-in-out infinite;
  }
  @keyframes shimmer {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 0.85; }
  }
</style>
