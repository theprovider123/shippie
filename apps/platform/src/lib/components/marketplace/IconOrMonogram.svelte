<script lang="ts">
  /**
   * IconOrMonogram — renders an `<img>` if a maker uploaded an icon,
   * otherwise falls back to a square monogram (first letter of the
   * app name) on the maker-supplied theme color.
   *
   * Square (`shippie-icon` from tokens.css) is the brand hallmark — no
   * rounded corners.
   */
  interface Props {
    name: string;
    slug: string;
    iconUrl: string | null | undefined;
    themeColor: string;
    size?: number;
    fontScale?: number;
  }

  let { name, slug, iconUrl, themeColor, size = 64, fontScale = 0.45 }: Props = $props();

  const letter = $derived(
    (name?.trim()?.[0] ?? slug?.[0] ?? '?').toUpperCase()
  );
</script>

{#if iconUrl}
  <img
    src={iconUrl}
    alt=""
    class="shippie-icon"
    style="width: {size}px; height: {size}px; object-fit: cover;"
    aria-hidden="true"
    loading="lazy"
    decoding="async"
  />
{:else}
  <div
    class="shippie-icon monogram"
    style="
      width: {size}px;
      height: {size}px;
      background: {themeColor};
      font-size: {Math.round(size * fontScale)}px;
    "
    aria-hidden="true"
  >
    {letter}
  </div>
{/if}

<style>
  .monogram {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #EDE4D3;
    font-family: var(--font-heading);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    user-select: none;
  }
</style>
