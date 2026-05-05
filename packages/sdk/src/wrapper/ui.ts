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
import type { InstallMethod, Platform } from './detect.ts';
import type { PromptTier } from './install-prompt.ts';
import type { BounceTarget } from './iab-bounce.ts';

export interface BannerProps {
  tier: PromptTier;
  method?: InstallMethod;
  platform?: Platform;
  hasNativePrompt?: boolean;
  appName?: string;
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
  host.setAttribute('data-shippie-tier', props.tier);

  if (props.tier === 'full') {
    mountInstallGuide(host, props);
    return;
  }

  host.setAttribute('style', [
    'position:fixed',
    'left:16px',
    'right:16px',
    'bottom:max(16px,env(safe-area-inset-bottom,0px))',
    'z-index:2147483646',
    'min-height:64px',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:14px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:18px',
    'box-shadow:0 18px 50px rgba(0,0,0,.32)',
    'padding:12px 12px 12px 14px',
    'font:500 13px/1.35 system-ui,sans-serif',
  ].join(';'));

  const copy = document.createElement('div');
  copy.setAttribute('style', 'min-width:0;display:grid;gap:2px');

  const label = document.createElement('strong');
  label.textContent = `Add ${props.appName ?? 'Shippie'} to your phone`;
  label.setAttribute('style', 'font:700 13px/1.2 system-ui,sans-serif;color:#EDE4D3');

  const detail = document.createElement('span');
  detail.textContent = props.hasNativePrompt
    ? 'Open faster from your home screen.'
    : installHintFor(props.method);
  detail.setAttribute('style', 'color:#B8A88F;font-size:12px;line-height:1.35');
  copy.append(label, detail);

  const installBtn = document.createElement('button');
  installBtn.setAttribute('data-shippie-install', '');
  installBtn.textContent = props.hasNativePrompt ? 'Add' : 'Show me';
  installBtn.setAttribute('style', [
    'background:#14120F',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'padding:10px 13px',
    'font:700 12px/1 system-ui,sans-serif',
    'letter-spacing:.02em',
    'border-radius:999px',
    'cursor:pointer',
    'white-space:nowrap',
  ].join(';'));
  installBtn.addEventListener('click', () => props.onInstall());

  const dismissBtn = document.createElement('button');
  dismissBtn.setAttribute('data-shippie-dismiss', '');
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('style', [
    'position:absolute',
    'right:6px',
    'top:6px',
    'background:transparent',
    'border:0',
    'color:#B8A88F',
    'font:15px/1 system-ui,sans-serif',
    'opacity:.7',
    'padding:6px',
    'cursor:pointer',
  ].join(';'));
  dismissBtn.addEventListener('click', () => props.onDismiss());

  host.append(copy, installBtn, dismissBtn);
}

function mountInstallGuide(host: HTMLElement, props: BannerProps): void {
  host.setAttribute('data-shippie-guide', '');
  host.setAttribute('style', [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'display:flex',
    'align-items:flex-end',
    'justify-content:center',
    'padding:20px',
    'padding-bottom:max(20px,env(safe-area-inset-bottom,0px))',
    'background:linear-gradient(180deg,rgba(20,18,15,0),rgba(20,18,15,.82))',
    'font:15px/1.45 system-ui,sans-serif',
    'color:#EDE4D3',
  ].join(';'));

  const card = document.createElement('section');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `Add ${props.appName ?? 'Shippie'} to your phone`);
  card.setAttribute('style', [
    'width:100%',
    'max-width:390px',
    'background:#2A2520',
    'border:1px solid #3D3530',
    'border-radius:24px',
    'box-shadow:0 28px 80px rgba(0,0,0,.42)',
    'padding:22px',
  ].join(';'));

  const head = document.createElement('div');
  head.setAttribute('style', 'display:flex;gap:12px;align-items:center;margin-bottom:14px');
  const mark = document.createElement('img');
  mark.src = '/__shippie-pwa/icon.svg';
  mark.alt = '';
  mark.width = 36;
  mark.height = 36;
  mark.setAttribute('aria-hidden', 'true');
  mark.setAttribute('style', 'border-radius:10px;background:#14120F;padding:6px;flex:0 0 auto');
  const titleWrap = document.createElement('div');
  titleWrap.setAttribute('style', 'min-width:0');
  const title = document.createElement('h2');
  title.textContent = props.hasNativePrompt
    ? `Add ${props.appName ?? 'Shippie'}`
    : `Add ${props.appName ?? 'Shippie'} to Home Screen`;
  title.setAttribute('style', 'font:750 20px/1.12 system-ui,sans-serif;margin:0;color:#EDE4D3');
  const sub = document.createElement('p');
  sub.textContent = 'Open instantly, keep it close, and use saved apps offline.';
  sub.setAttribute('style', 'margin:4px 0 0;color:#B8A88F;font-size:13px;line-height:1.4');
  titleWrap.append(title, sub);
  head.append(mark, titleWrap);

  const steps = document.createElement('ol');
  steps.setAttribute('data-shippie-install-steps', '');
  steps.setAttribute('style', [
    'display:grid',
    'gap:10px',
    'padding:0',
    'margin:16px 0 18px',
    'list-style:none',
    'counter-reset:step',
  ].join(';'));
  for (const step of installStepsFor(props)) {
    const li = document.createElement('li');
    li.setAttribute('style', [
      'counter-increment:step',
      'display:grid',
      'grid-template-columns:28px 1fr',
      'gap:10px',
      'align-items:start',
      'color:#EDE4D3',
    ].join(';'));
    const n = document.createElement('span');
    n.textContent = String(steps.children.length + 1);
    n.setAttribute('style', [
      'width:28px',
      'height:28px',
      'border-radius:999px',
      'display:grid',
      'place-items:center',
      'background:#14120F',
      'color:#E8603C',
      'font:800 12px/1 system-ui,sans-serif',
    ].join(';'));
    const text = document.createElement('span');
    text.textContent = step;
    text.setAttribute('style', 'font-size:14px;color:#EDE4D3');
    li.append(n, text);
    steps.append(li);
  }

  const actions = document.createElement('div');
  actions.setAttribute('style', 'display:flex;gap:10px;align-items:center');

  const installBtn = document.createElement('button');
  installBtn.setAttribute('data-shippie-install', '');
  installBtn.textContent = props.hasNativePrompt ? 'Add now' : 'Got it';
  installBtn.setAttribute('style', [
    'flex:1',
    'background:#E8603C',
    'color:#14120F',
    'border:0',
    'border-radius:999px',
    'padding:13px 16px',
    'font:800 13px/1 system-ui,sans-serif',
    'cursor:pointer',
  ].join(';'));
  installBtn.addEventListener('click', () => {
    if (props.hasNativePrompt) props.onInstall();
    else props.onDismiss();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.setAttribute('data-shippie-dismiss', '');
  dismissBtn.textContent = 'Not now';
  dismissBtn.setAttribute('style', [
    'background:transparent',
    'color:#B8A88F',
    'border:1px solid #3D3530',
    'border-radius:999px',
    'padding:12px 14px',
    'font:700 13px/1 system-ui,sans-serif',
    'cursor:pointer',
  ].join(';'));
  dismissBtn.addEventListener('click', () => props.onDismiss());

  actions.append(installBtn, dismissBtn);
  card.append(head, steps, actions);
  host.append(card);
}

function installHintFor(method: InstallMethod | undefined): string {
  if (method === 'ios-safari') return 'Safari needs a quick Share menu step.';
  if (method === 'ios-chrome') return 'Open in Safari, then add it to Home Screen.';
  if (method === 'ios-other') return 'Use your browser menu or open in Safari to install.';
  return 'We will show the right steps for this browser.';
}

function installStepsFor(props: BannerProps): string[] {
  if (props.hasNativePrompt) {
    return ['Tap Add now.', 'Confirm in your browser.', 'Open from your home screen next time.'];
  }
  if (props.method === 'ios-safari') {
    return ['Tap the Share button in Safari.', 'Choose Add to Home Screen.', 'Tap Add in the top right.'];
  }
  if (props.method === 'ios-chrome') {
    return ['Open this page in Safari.', 'Tap Safari Share.', 'Choose Add to Home Screen.'];
  }
  if (props.method === 'ios-other') {
    return ['Open this link in Safari if the option is missing.', 'Tap Share or the browser menu.', 'Choose Add to Home Screen.'];
  }
  if (props.platform === 'android') {
    return ['Open the browser menu.', 'Tap Install app or Add to Home screen.', 'Confirm the install.'];
  }
  return ['Open your browser install menu.', 'Choose Install app or Add to Home Screen.', 'Confirm the install.'];
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
