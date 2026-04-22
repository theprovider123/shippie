// packages/sdk/src/wrapper/handoff-sheet.ts
/**
 * Desktop → mobile handoff modal.
 *
 * Three paths for the user to pick from:
 *   1. QR code (rendered as SVG).
 *   2. Email-to-self form.
 *   3. "Send to my installed Shippie" push (only when `canPush=true`).
 *
 * Vanilla DOM — safe to render in any host page.
 */
import { validateEmail } from './handoff.ts';
import { renderQrSvg } from './qr.ts';

export interface HandoffSheetProps {
  handoffUrl: string;
  onSendEmail: (email: string) => Promise<void>;
  onSendPush: () => Promise<void>;
  canPush: boolean;
  onClose?: () => void;
}

const ATTR = 'data-shippie-handoff';

export function mountHandoffSheet(props: HandoffSheetProps): void {
  unmountHandoffSheet();
  const host = document.createElement('div');
  host.setAttribute(ATTR, '');
  host.setAttribute('style', [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(0,0,0,.75)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:20px',
    'font:16px/1.4 system-ui,sans-serif',
  ].join(';'));

  const card = document.createElement('div');
  card.setAttribute('style', [
    'width:100%',
    'max-width:380px',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:20px',
    'padding:28px',
    'text-align:center',
  ].join(';'));

  const title = document.createElement('h2');
  title.textContent = 'Open on your phone';
  title.setAttribute('style', 'font:700 20px/1.2 system-ui,sans-serif;margin:0 0 4px');

  const sub = document.createElement('p');
  sub.textContent = 'Three ways to continue on mobile — pick whatever is easiest.';
  sub.setAttribute('style', 'color:#B8A88F;font-size:13px;line-height:1.5;margin:0 0 20px');

  const qrBox = document.createElement('div');
  qrBox.setAttribute('style', [
    'margin:0 auto 16px',
    'width:160px',
    'min-height:160px',
    'background:#14120F',
    'border:1px dashed #3D3530',
    'border-radius:12px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:6px',
    'padding:8px',
  ].join(';'));

  const qrSvgString = renderQrSvg(props.handoffUrl, {
    size: 160,
    margin: 2,
    fg: '#EDE4D3',
    bg: '#14120F',
  });
  const qrSvgWrap = document.createElement('div');
  qrSvgWrap.setAttribute('data-shippie-handoff-qr-svg', '');
  qrSvgWrap.setAttribute('style', 'width:100%;height:100%;display:flex;align-items:center;justify-content:center');
  qrSvgWrap.innerHTML = qrSvgString;
  qrBox.appendChild(qrSvgWrap);

  const qrText = document.createElement('span');
  qrText.setAttribute('data-shippie-handoff-qr-url', '');
  qrText.setAttribute('style', 'font:10px/1.3 ui-monospace,monospace;color:#7A6B58;text-align:center;word-break:break-all;padding:0 4px');
  qrText.textContent = props.handoffUrl.replace(/^https?:\/\//, '');
  qrBox.appendChild(qrText);

  const emailWrap = document.createElement('div');
  emailWrap.setAttribute('style', 'display:flex;gap:8px;margin-bottom:12px');
  const email = document.createElement('input');
  email.setAttribute('data-shippie-handoff-email', '');
  email.setAttribute('type', 'email');
  email.setAttribute('placeholder', 'you@email.com');
  email.setAttribute('style', [
    'flex:1',
    'padding:10px 12px',
    'background:#14120F',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:8px',
    'font:13px system-ui,sans-serif',
  ].join(';'));
  const emailCta = document.createElement('button');
  emailCta.setAttribute('data-shippie-handoff-email-cta', '');
  emailCta.textContent = 'Email me';
  emailCta.setAttribute('style', [
    'padding:10px 14px',
    'background:#E8603C',
    'color:#14120F',
    'border:0',
    'border-radius:8px',
    'font:700 12px system-ui,sans-serif',
    'cursor:pointer',
  ].join(';'));
  emailCta.addEventListener('click', () => {
    if (!validateEmail(email.value)) return;
    void props.onSendEmail(email.value.trim());
  });
  emailWrap.append(email, emailCta);

  card.append(title, sub, qrBox, emailWrap);

  if (props.canPush) {
    const push = document.createElement('button');
    push.setAttribute('data-shippie-handoff-push-cta', '');
    push.textContent = 'Send to my installed Shippie';
    push.setAttribute('style', [
      'display:block',
      'width:100%',
      'padding:10px',
      'background:transparent',
      'border:1px solid #3D3530',
      'color:#EDE4D3',
      'border-radius:8px',
      'cursor:pointer',
      'font-size:12px',
    ].join(';'));
    push.addEventListener('click', () => {
      void props.onSendPush();
    });
    card.append(push);
  }

  if (props.onClose) {
    const close = document.createElement('button');
    close.setAttribute('data-shippie-handoff-close', '');
    close.textContent = 'Close';
    close.setAttribute('style', [
      'display:block',
      'width:100%',
      'margin-top:8px',
      'padding:8px',
      'background:transparent',
      'border:0',
      'color:#7A6B58',
      'cursor:pointer',
      'font-size:11px',
    ].join(';'));
    close.addEventListener('click', () => props.onClose?.());
    card.append(close);
  }

  host.append(card);
  document.body.appendChild(host);
}

export function unmountHandoffSheet(): void {
  const el = document.querySelector(`[${ATTR}]`);
  if (el) el.remove();
}
