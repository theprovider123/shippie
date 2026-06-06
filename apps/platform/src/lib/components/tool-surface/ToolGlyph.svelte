<script lang="ts">
  /**
   * ToolGlyph — the single icon atom for every Shippie surface.
   * Render priority: iconUrl (img) → glyph (emoji) → smart monogram.
   * Terminal style + hybrid square come from @shippie/design-tokens.
   * The same monogram()/accentColor() run in the build-time SVG
   * generator, so live tiles and baked PWA icons match.
   */
  import { monogram, accentColor } from '@shippie/design-tokens';

  interface Props {
    slug: string;
    name: string;
    iconUrl?: string | null;
    glyph?: string | null;
    themeColor?: string | null;
    size?: number;
    running?: boolean;
    float?: boolean;
  }

  let {
    slug,
    name,
    iconUrl = null,
    glyph = null,
    themeColor = null,
    size = 64,
    running = false,
    float = true,
  }: Props = $props();

  const accent = $derived(accentColor(slug, themeColor));
  const mark = $derived(monogram(name, slug));
  // Hide the rocket badge when the tile is too small to read it.
  const showRocket = $derived(running && size >= 28);
</script>

<div
  class="tool-glyph"
  class:running
  class:float
  style="--c: {accent}; width: {size}px; height: {size}px; font-size: {Math.round(size * 0.32)}px;"
  aria-hidden="true"
>
  {#if running}<span class="pulse"></span>{/if}
  {#if iconUrl}
    <img src={iconUrl} alt="" width={size} height={size} loading="lazy" decoding="async" />
  {:else if glyph}
    <span class="emoji">{glyph}</span>
  {:else}
    <span class="monogram">{mark}</span>
  {/if}
  <span class="dot"></span>
  {#if showRocket}
    <span class="rocket">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--c)" stroke-width="2" aria-hidden="true">
        <path d="M5 19c0-3 1-5 3-7 3-3 8-5 11-5 0 3-2 8-5 11-2 2-4 3-7 3l-2-2z" />
        <circle cx="14" cy="10" r="1.4" fill="var(--c)" />
      </svg>
    </span>
  {/if}
</div>

<style>
  .tool-glyph {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--tool-icon-radius);
    background: var(--tool-icon-tile);
    border: 1px solid color-mix(in srgb, var(--c) var(--tool-icon-hairline), transparent);
    overflow: visible;
  }
  .tool-glyph.float { box-shadow: var(--tool-icon-float); }
  .tool-glyph img { border-radius: inherit; object-fit: cover; }
  .monogram {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--c);
  }
  .emoji { line-height: 1; }
  .dot {
    position: absolute; left: 9px; top: 9px;
    width: 4px; height: 4px; border-radius: 1px;
    background: var(--c); opacity: 0.65;
  }
  .tool-glyph.running {
    box-shadow:
      var(--tool-icon-float),
      0 0 0 1.5px color-mix(in srgb, var(--c) 70%, transparent),
      0 0 16px -3px color-mix(in srgb, var(--c) 55%, transparent);
  }
  .rocket {
    position: absolute; right: -6px; top: -6px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--tool-icon-tile);
    border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .rocket svg { width: 10px; height: 10px; }
  .pulse {
    position: absolute; inset: 0; border-radius: inherit;
    border: 1.5px solid var(--c); opacity: 0;
    animation: glyph-pulse 2.4s ease-out infinite;
  }
  @keyframes glyph-pulse {
    0% { opacity: 0.5; transform: scale(1); }
    70% { opacity: 0; transform: scale(1.25); }
    100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; display: none; }
  }
</style>
