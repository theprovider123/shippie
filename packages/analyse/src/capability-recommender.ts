/**
 * Map an inventory + category + framework guess into a RecommendedConfig.
 *
 * Pure logic; no I/O. Test-friendly. The output is a maker-overridable
 * suggestion — never treat it as authoritative beyond the deploy step
 * that emits it.
 */
import type {
  CategoryGuess,
  ElementInventory,
  FrameworkGuess,
  RecommendedConfig,
} from './profile.ts';

export function recommend(
  inv: ElementInventory,
  cat: CategoryGuess,
  framework: FrameworkGuess,
): RecommendedConfig {
  const enhance: Record<string, string[]> = {
    'button, [role="button"], input[type="submit"]': ['textures'],
  };

  if (inv.lists.count > 0) {
    enhance['ul > li, ol > li, [role="listitem"]'] = ['textures'];
  }
  if (inv.videos > 0 || inv.canvases > 0) {
    enhance['video, canvas'] = ['wakelock', 'textures'];
  }
  if (inv.forms > 0) {
    enhance['form'] = ['textures'];
  }
  if (inv.images > 1) {
    enhance['img'] = ['textures'];
  }

  // Category-specific overrides.
  if (cat.primary === 'cooking') {
    // Cooking apps want the screen to stay on through the whole session,
    // not just when a video plays.
    enhance['canvas, [data-shippie-canvas], main'] = ['wakelock'];
  }

  // Framework hint: SPAs benefit from per-route navigation textures.
  if (framework.hasRouter) {
    enhance['a[href]'] = ['textures'];
  }

  return {
    enhance,
    feel: {
      haptics: true,
      transitions: 'spring',
      scrollBounce: true,
      sound: false,
    },
    ambient: {
      wakeLock: cat.primary === 'cooking' ? 'auto' : 'off',
    },
    ai: cat.primary === 'journal' ? ['classify', 'embed', 'sentiment'] : false,
  };
}
