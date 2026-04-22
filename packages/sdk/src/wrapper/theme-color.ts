// packages/sdk/src/wrapper/theme-color.ts
/**
 * Idempotent writer for <meta name="theme-color"> — creates the tag
 * if missing, updates in place otherwise. Mobile browsers use this
 * to color the status/address bar in standalone mode.
 */
export function setThemeColor(color: string): void {
  if (typeof document === 'undefined') return;
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'theme-color');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', color);
}
