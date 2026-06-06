<script lang="ts">
  /**
   * AmbientGrid — ONE shared WebGL layer intended to sit behind the
   * launchpad grid. Never per-tile: browsers cap ~16 GL contexts and the
   * Dock can show 70+ tools, so a single context is the only safe design.
   *
   * Status: scaffold. The shader body is intentionally a stub (a slow
   * living gradient seeded from `accents` is the eventual fill). It is
   * NOT mounted anywhere yet — enable it behind a feature flag once the
   * shader is authored and visually tuned. Until then it renders the
   * static fallback, so it is safe to mount early if desired.
   *
   * Degrades to a static gradient under prefers-reduced-motion or when
   * WebGL2 is unavailable, and pauses its RAF loop when the tab is hidden.
   */
  import { onMount } from 'svelte';

  interface Props {
    accents: string[];
  }

  let { accents }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let reduced = $state(false);
  let webglOk = $state(true);

  onMount(() => {
    reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced || !canvasEl) return;
    const gl = canvasEl.getContext('webgl2');
    if (!gl) {
      webglOk = false;
      return;
    }
    let raf = 0;
    const tick = () => {
      // Pause work when the tab is hidden — no point animating offscreen.
      if (!document.hidden) {
        // TODO(shader): draw a slow living gradient seeded from `accents`.
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const useStatic = $derived(reduced || !webglOk);
  const firstAccent = $derived(accents[0] ?? '#c98a4b');
</script>

{#if useStatic}
  <div class="ambient-static" style="--a: {firstAccent}" aria-hidden="true"></div>
{:else}
  <canvas bind:this={canvasEl} class="ambient" aria-hidden="true"></canvas>
{/if}

<style>
  .ambient,
  .ambient-static {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .ambient-static {
    background: radial-gradient(
      120% 80% at 30% 10%,
      color-mix(in srgb, var(--a) 10%, transparent),
      transparent 60%
    );
  }
</style>
