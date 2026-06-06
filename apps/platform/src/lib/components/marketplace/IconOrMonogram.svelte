<script lang="ts">
  /**
   * IconOrMonogram — kept as a stable name for ~10 existing call sites.
   * Now a thin wrapper over ToolGlyph (the real icon atom). Do not add
   * visual logic here; change ToolGlyph instead.
   */
  import ToolGlyph from '$lib/components/tool-surface/ToolGlyph.svelte';

  interface Props {
    name: string;
    slug: string;
    iconUrl: string | null | undefined;
    themeColor: string;
    size?: number;
    /** Retained for call-site compatibility; ToolGlyph derives its own scale. */
    fontScale?: number;
    glyph?: string | null;
    running?: boolean;
    float?: boolean;
  }

  let {
    name,
    slug,
    iconUrl,
    themeColor,
    size = 64,
    glyph = null,
    running = false,
    float = false,
  }: Props = $props();
</script>

<ToolGlyph {name} {slug} {iconUrl} {themeColor} {glyph} {size} {running} {float} />
