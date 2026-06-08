<!--
  Phase C1 — insight strip on the container Home page.

  Renders up to 3 cards in a horizontal scroll strip at the top of Home.
  Cards sort high → low by urgency (the runner already does this; the
  component just maps the urgency tier to an accent border).

  Tap a card → onOpen(insight) — the parent routes to the target app
  using the existing openApp(appId) flow (matched by slug).
  Swipe-right or tap × → onDismiss(insight) — parent persists this so
  the card doesn't return for 7 days unless the agent re-detects with
  higher urgency.
-->
<script lang="ts">
  import type { Insight } from '@shippie/agent';

  interface Props {
    insights: readonly Insight[];
    onOpen: (insight: Insight) => void;
    onDismiss: (insight: Insight) => void;
  }

  let { insights, onOpen, onDismiss }: Props = $props();
</script>

{#if insights.length > 0}
  <div class="insight-strip" role="region" aria-label="Insights">
    {#each insights as insight (insight.id)}
      <article
        class="insight-card"
        class:high={insight.urgency === 'high'}
        class:medium={insight.urgency === 'medium'}
        class:low={insight.urgency === 'low'}
      >
        <button
          class="insight-body"
          onclick={() => onOpen(insight)}
          aria-label={`Open ${insight.title}`}
        >
          <h4>{insight.title}</h4>
          <p>{insight.body}</p>
        </button>
        <button
          class="insight-dismiss"
          onclick={() => onDismiss(insight)}
          aria-label="Dismiss"
          title="Dismiss"
        >×</button>
      </article>
    {/each}
  </div>
{/if}

<style>
  .insight-strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 8px 0 16px;
    scrollbar-width: none;
  }
  .insight-strip::-webkit-scrollbar { display: none; }
  .insight-card {
    flex: 0 0 280px;
    min-width: 280px;
    border-radius: 0;
    background: var(--surface);
    border: 1px solid var(--border-light);
    padding: 14px 14px 12px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .insight-card.high {
    border-color: var(--sunset);
    background: color-mix(in srgb, var(--sunset) 8%, var(--surface));
  }
  .insight-card.medium {
    border-color: color-mix(in srgb, var(--sunset) 40%, var(--border-light));
  }
  .insight-card.low {
    background: var(--surface);
  }
  .insight-body {
    flex: 1;
    text-align: left;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    color: inherit;
  }
  .insight-body h4 {
    margin: 0 0 4px;
    font-family: var(--font-heading);
    font-size: var(--text-small);
    font-weight: 600;
    color: var(--text);
  }
  .insight-body p {
    margin: 0;
    font-size: var(--text-small);
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .insight-dismiss {
    background: transparent;
    border: 0;
    width: 24px;
    height: 24px;
    border-radius: 0;
    font-size: var(--text-body);
    line-height: 1;
    color: var(--text-light);
    cursor: pointer;
  }
  .insight-dismiss:hover {
    color: var(--text);
  }
</style>
