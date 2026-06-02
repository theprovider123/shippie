<script lang="ts">
  type EntryAction = {
    href: string;
    label: string;
  };

  interface Props {
    label?: string;
    actions?: EntryAction[];
  }

  let { label = 'Dock', actions = [] }: Props = $props();
</script>

<nav class="entry-nav" aria-label="Page navigation">
  <a class="launcher" href="/dock" aria-label="Open Shippie Dock">
    <img
      src="/__shippie-pwa/icon.svg"
      alt=""
      width="28"
      height="28"
      aria-hidden="true"
    />
    <span>{label}</span>
  </a>

  {#if actions.length > 0}
    <div class="actions">
      {#each actions as action (action.href)}
        <a href={action.href}>{action.label}</a>
      {/each}
    </div>
  {/if}
</nav>

<style>
  .entry-nav {
    width: 100%;
    min-height: var(--touch-min, 44px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .launcher,
  .actions a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
  }

  .launcher {
    gap: 0.65rem;
    color: var(--text, #14120F);
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .launcher img {
    width: 28px;
    height: 28px;
    display: block;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .actions a {
    padding: 0 0.85rem;
    border: 1px solid var(--border-light, #E5DDC8);
    color: var(--text-secondary, #5C5751);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .actions a:hover,
  .launcher:hover {
    color: var(--sunset, #E8603C);
  }

  @media (max-width: 640px) {
    .entry-nav {
      align-items: flex-start;
    }

    .actions {
      justify-content: flex-end;
    }

    .actions a {
      padding: 0 0.7rem;
      font-size: 0.62rem;
    }
  }
</style>
