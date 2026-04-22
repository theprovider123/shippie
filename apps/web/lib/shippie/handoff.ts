// apps/web/lib/shippie/handoff.ts
/**
 * Pure renderers for handoff dispatch. Kept framework-agnostic so they
 * can be unit-tested without network or DB stubs.
 */

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

export interface HandoffEmailInput {
  appName: string;
  handoffUrl: string;
}

export interface HandoffEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderHandoffEmail(input: HandoffEmailInput): HandoffEmail {
  const { appName, handoffUrl } = input;
  const safeName = escapeHtml(appName);
  const safeUrl = escapeHtml(handoffUrl);
  return {
    subject: `${appName} — open on your phone`,
    text:
      `Open ${appName} on your phone:\n\n${handoffUrl}\n\n` +
      'This link opens the app in your mobile browser so you can install it to your home screen.',
    html: [
      `<!doctype html>`,
      `<html><body style="font:16px/1.5 system-ui,sans-serif;background:#14120F;color:#EDE4D3;padding:32px">`,
      `<h1 style="font:700 22px/1.3 system-ui,sans-serif;margin:0 0 16px">${safeName}</h1>`,
      `<p style="margin:0 0 20px;color:#B8A88F">Tap the button below on your phone to open the app.</p>`,
      `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#E8603C;color:#14120F;font-weight:700;text-decoration:none;border-radius:8px">Open on phone</a></p>`,
      `<p style="margin:24px 0 0;color:#7A6B58;font-size:12px">Link: <a href="${safeUrl}" style="color:#E8603C">${safeUrl}</a></p>`,
      `</body></html>`,
    ].join(''),
  };
}

export interface PushPayloadInput {
  appName: string;
  handoffUrl: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export function buildPushPayload(input: PushPayloadInput): PushPayload {
  return {
    title: `Continue ${input.appName} on your phone`,
    body: 'Tap to open in your mobile browser.',
    url: input.handoffUrl,
  };
}
