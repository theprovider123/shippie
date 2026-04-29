<script lang="ts">
  /**
   * PricingTier — port of apps/web/app/components/marketing/pricing-tier.tsx.
   * Marketing-grade card with optional `featured` highlight.
   */
  interface Props {
    name: string;
    price: string;
    audience: string;
    features: readonly string[];
    featured?: boolean;
  }

  let { name, price, audience, features, featured = false }: Props = $props();
</script>

<article class="tier" class:featured>
  <header>
    <h3>{name}</h3>
    <p class="price">{price}</p>
    <p class="audience">{audience}</p>
  </header>
  <ul>
    {#each features as feature (feature)}
      <li>{feature}</li>
    {/each}
  </ul>
</article>

<style>
  .tier {
    border: 1px solid var(--border-light);
    border-radius: 0;
    padding: 24px 22px;
    background: var(--surface);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .tier.featured {
    border: 2px solid var(--sunset);
    background: var(--surface-elevated);
    box-shadow: 0 12px 40px var(--sunset-glow);
  }

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .price {
    margin: 6px 0 2px;
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--text);
  }
  .featured .price { color: var(--sunset); }
  .audience {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-secondary);
    letter-spacing: 0.05em;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  ul li {
    font-size: var(--small-size);
    line-height: 1.5;
    color: var(--text-secondary);
  }
</style>
