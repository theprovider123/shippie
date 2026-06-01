/**
 * Phase E — maker viewport contract. An app declares a `layout` mode in its
 * manifest; the host renders it on an appropriately-sized STAGE (the stage owns
 * the viewport; the app decides whether to stretch). Responsive-first: the
 * default stretches to the full stage. `mobilePreferred` centers the app in a
 * phone-width column on roomy hosts (fixes "mobile app looks strange on a big
 * screen"); `fixedAspect` letterboxes to a declared ratio. Pure + testable.
 */
export type AppLayout = 'responsive' | 'mobilePreferred' | 'desktopPreferred' | 'fixedAspect' | 'immersive';

/** Phone-stage width for mobilePreferred apps on large hosts. */
export const MOBILE_STAGE_MAX = 480;

/** Inline style for the `.frame-stage` element, by declared layout. */
export function stageStyleFor(layout: AppLayout | undefined | null, aspectRatio?: string | null): string {
  switch (layout) {
    case 'mobilePreferred':
      // max-width caps the column on desktop but is a no-op on phones (the
      // viewport is already narrower), so the app is full-width on mobile and
      // a centered phone stage on desktop.
      return `max-width: ${MOBILE_STAGE_MAX}px; margin-inline: auto;`;
    case 'fixedAspect':
      return aspectRatio
        ? `aspect-ratio: ${aspectRatio}; max-width: 100%; max-height: 100%; margin: auto;`
        : '';
    case 'responsive':
    case 'desktopPreferred':
    case 'immersive':
    default:
      return '';
  }
}
