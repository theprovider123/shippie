// packages/sdk/src/wrapper/ui.ts
/**
 * Framework-agnostic DOM rendering for the wrapper.
 *
 * Every element is tagged with `data-shippie-*` so CSS authors can style
 * and tests can select reliably. Inline styles keep the runtime self-
 * contained — wrapper.js works on any page, even one without its own CSS.
 *
 * All mounts are idempotent: calling `mountInstallBanner` twice leaves
 * exactly one banner in the DOM. `unmountAll` tears down every wrapper
 * element; callers that want to re-render should call `unmountAll` first.
 */
import type { IabBrand } from './detect.ts';
import type { PromptTier } from './install-prompt.ts';
import type { BounceTarget } from './iab-bounce.ts';

export interface BannerProps {
  tier: PromptTier;
  onInstall: () => void;
  onDismiss: () => void;
}

export interface BounceSheetProps {
  brand: IabBrand;
  target: BounceTarget;
  onBounce: () => void;
  onCopyLink: () => void;
}

const BANNER_ATTR = 'data-shippie-banner';
const BOUNCE_ATTR = 'data-shippie-bounce';

function ensureHost(attr: string): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`[${attr}]`);
  if (existing) return existing;
  const el = document.createElement('div');
  el.setAttribute(attr, '');
  document.body.appendChild(el);
  return el;
}

function removeBy(attr: string): void {
  const el = document.querySelector(`[${attr}]`);
  if (el) el.remove();
}

export function mountInstallBanner(props: BannerProps): void {
  removeBy(BANNER_ATTR);
  if (props.tier === 'none') return;

  const host = ensureHost(BANNER_ATTR);
  host.setAttribute('style', [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:2147483646',
    'height:40px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'gap:10px',
    'background:#E8603C',
    'color:#14120F',
    'font:600 13px/1 system-ui,sans-serif',
  ].join(';'));
  host.setAttribute('data-shippie-tier', props.tier);

  const label = document.createElement('span');
  label.textContent = 'Install this app';

  const installBtn = document.createElement('button');
  installBtn.setAttribute('data-shippie-install', '');
  installBtn.textContent = 'INSTALL';
  installBtn.setAttribute('style', [
    'background:#14120F',
    'color:#EDE4D3',
    'border:0',
    'padding:3px 12px',
    'font:700 11px/1 system-ui,sans-serif',
    'letter-spacing:.02em',
    'border-radius:3px',
    'cursor:pointer',
  ].join(';'));
  installBtn.addEventListener('click', () => props.onInstall());

  const dismissBtn = document.createElement('button');
  dismissBtn.setAttribute('data-shippie-dismiss', '');
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('style', [
    'position:absolute',
    'right:12px',
    'top:50%',
    'transform:translateY(-50%)',
    'background:transparent',
    'border:0',
    'color:#14120F',
    'font:15px/1 system-ui,sans-serif',
    'opacity:.5',
    'padding:4px',
    'cursor:pointer',
  ].join(';'));
  dismissBtn.addEventListener('click', () => props.onDismiss());

  host.append(label, installBtn, dismissBtn);
}

const BRAND_LABEL: Record<IabBrand, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  pinterest: 'Pinterest',
  whatsapp: 'WhatsApp',
  wechat: 'WeChat',
  line: 'LINE',
};

export function mountBounceSheet(props: BounceSheetProps): void {
  removeBy(BOUNCE_ATTR);
  const host = ensureHost(BOUNCE_ATTR);
  host.setAttribute('style', [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(0,0,0,.75)',
    'display:flex',
    'align-items:flex-end',
    'justify-content:center',
    'padding:20px',
    'font:16px/1.4 system-ui,sans-serif',
  ].join(';'));

  const card = document.createElement('div');
  card.setAttribute('style', [
    'width:100%',
    'max-width:360px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:20px',
    'padding:28px',
    'text-align:center',
  ].join(';'));

  const title = document.createElement('h2');
  title.textContent = `Open in browser`;
  title.setAttribute('style', 'font:700 20px/1.2 system-ui,sans-serif;margin:0 0 8px');

  const reason = document.createElement('p');
  reason.textContent = `This app lives on your home screen — ${BRAND_LABEL[props.brand]} can't install it. Tap to open in your browser.`;
  reason.setAttribute('style', 'color:#B8A88F;font-size:13px;line-height:1.5;margin:0 0 20px');

  const cta = document.createElement('a');
  cta.setAttribute('data-shippie-bounce-cta', '');
  cta.setAttribute('href', props.target.url);
  cta.textContent = 'Open in browser';
  cta.setAttribute('style', [
    'display:block',
    'padding:14px',
    'background:#E8603C',
    'color:#14120F',
    'font-weight:700',
    'border-radius:10px',
    'text-decoration:none',
  ].join(';'));
  cta.addEventListener('click', () => props.onBounce());

  const copyBtn = document.createElement('button');
  copyBtn.setAttribute('data-shippie-bounce-copy', '');
  copyBtn.textContent = 'Copy link instead';
  copyBtn.setAttribute('style', [
    'display:block',
    'width:100%',
    'margin-top:12px',
    'padding:12px',
    'background:transparent',
    'border:1px solid #3D3530',
    'color:#EDE4D3',
    'border-radius:10px',
    'cursor:pointer',
    'font-size:13px',
  ].join(';'));
  copyBtn.addEventListener('click', () => props.onCopyLink());

  card.append(title, reason, cta, copyBtn);
  host.append(card);
}

export function unmountAll(): void {
  removeBy(BANNER_ATTR);
  removeBy(BOUNCE_ATTR);
}
