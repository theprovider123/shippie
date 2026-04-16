/**
 * Optional "Deployed on Shippie" footer helper.
 *
 * Opt-in — importing does nothing until `shippieFooter.mount()` is called.
 * Off by default so SDK consumers don't get surprise branding.
 *
 * Usage:
 *   import { shippieFooter } from '@shippie/sdk/footer';
 *   shippieFooter.mount();  // appends a <a class="shippie-footer"> to <body>
 *
 * Or render the HTML string yourself:
 *   document.body.insertAdjacentHTML('beforeend', shippieFooter.html());
 *
 * Spec: differentiation plan Pillar B5.
 */

interface MountOptions {
  /** Container to append into. Default: document.body. */
  target?: HTMLElement;
  /** Override the default "Deployed on Shippie" label. */
  label?: string;
  /** Query param to append to the outbound link for attribution. */
  utmSource?: string;
  /** Whether to skip mounting when the app is running in a Capacitor shell. */
  skipInCapacitor?: boolean;
}

const DEFAULT_LABEL = 'Deployed on Shippie';
const HOMEPAGE = 'https://shippie.app';

function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: unknown };
  return typeof w.Capacitor !== 'undefined';
}

function linkHref(utmSource?: string): string {
  if (!utmSource) return HOMEPAGE;
  const qs = new URLSearchParams({ utm_source: utmSource, utm_medium: 'sdk_footer' });
  return `${HOMEPAGE}?${qs.toString()}`;
}

function renderHtml(options: MountOptions = {}): string {
  const label = escapeHtml(options.label ?? DEFAULT_LABEL);
  const href = escapeAttribute(linkHref(options.utmSource));
  return (
    `<a class="shippie-footer" href="${href}" target="_blank" rel="noopener" ` +
    `style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;` +
    `font:500 12px/1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,` +
    `'Segoe UI',sans-serif;color:#7A6B58;text-decoration:none;">` +
    `<span style="display:inline-block;width:8px;height:8px;` +
    `background:#E8603C;border-radius:50%;"></span>${label}</a>`
  );
}

function mount(options: MountOptions = {}): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (options.skipInCapacitor && isCapacitor()) return null;

  const target = options.target ?? document.body;
  if (!target) return null;

  const existing = target.querySelector<HTMLElement>('.shippie-footer');
  if (existing) return existing;

  target.insertAdjacentHTML('beforeend', renderHtml(options));
  return target.querySelector<HTMLElement>('.shippie-footer');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(s: string): string {
  return escapeHtml(s);
}

export const shippieFooter = {
  mount,
  html: renderHtml,
};

export type { MountOptions as ShippieFooterOptions };
