// packages/sdk/src/wrapper/update-toast.ts
/**
 * "Update ready" toast shown when the service worker reports a new
 * version. Standalone-mode only; browser users get the fresh bundle on
 * next navigation anyway.
 */

export interface UpdateToastProps {
  onReload: () => void;
}

const ATTR = 'data-shippie-update';

export function mountUpdateToast(props: UpdateToastProps): void {
  unmountUpdateToast();
  const host = document.createElement('div');
  host.setAttribute(ATTR, '');
  host.setAttribute('style', [
    'position:fixed',
    'bottom:calc(16px + env(safe-area-inset-bottom, 0px))',
    'left:16px',
    'right:16px',
    'z-index:2147483645',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:12px',
    'padding:12px 16px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:12px',
    'font:500 13px/1.2 system-ui,sans-serif',
  ].join(';'));

  const label = document.createElement('span');
  label.textContent = 'New version available';

  const btn = document.createElement('button');
  btn.setAttribute('data-shippie-update-reload', '');
  btn.textContent = 'Reload';
  btn.setAttribute('style', [
    'background:#E8603C',
    'color:#14120F',
    'border:0',
    'padding:6px 14px',
    'font:700 12px/1 system-ui,sans-serif',
    'border-radius:6px',
    'cursor:pointer',
  ].join(';'));
  btn.addEventListener('click', () => props.onReload());

  host.append(label, btn);
  document.body.appendChild(host);
}

export function unmountUpdateToast(): void {
  const el = document.querySelector(`[${ATTR}]`);
  if (el) el.remove();
}
