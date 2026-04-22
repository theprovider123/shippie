import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountHandoffSheet, unmountHandoffSheet } from './handoff-sheet.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/apps/zen' });
  // @ts-expect-error test
  globalThis.document = win.document;
  // @ts-expect-error test
  globalThis.window = win;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe('mountHandoffSheet', () => {
  test('renders QR placeholder + email form + phone CTA when canPush=false (no push button)', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: false,
    });
    const sheet = win.document.querySelector('[data-shippie-handoff]');
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('[data-shippie-handoff-qr-url]')?.textContent).toContain('shippie.app/apps/zen');
    expect(sheet?.querySelector('input[data-shippie-handoff-email]')).not.toBeNull();
    expect(sheet?.querySelector('button[data-shippie-handoff-email-cta]')).not.toBeNull();
    expect(sheet?.querySelector('button[data-shippie-handoff-push-cta]')).toBeNull();
  });

  test('shows push CTA only when canPush=true', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: true,
    });
    expect(win.document.querySelector('button[data-shippie-handoff-push-cta]')).not.toBeNull();
  });

  test('email CTA invokes onSendEmail with the input value', async () => {
    let got = '';
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async (email: string) => {
        got = email;
      },
      onSendPush: async () => {},
      canPush: false,
    });
    const input = win.document.querySelector('input[data-shippie-handoff-email]') as unknown as HTMLInputElement;
    input.value = 'me@example.com';
    const cta = win.document.querySelector('button[data-shippie-handoff-email-cta]') as unknown as HTMLButtonElement;
    cta.click();
    await Promise.resolve();
    expect(got).toBe('me@example.com');
  });

  test('email CTA does not call onSendEmail when email is invalid', async () => {
    let calls = 0;
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => { calls += 1; },
      onSendPush: async () => {},
      canPush: false,
    });
    const input = win.document.querySelector('input[data-shippie-handoff-email]') as unknown as HTMLInputElement;
    input.value = 'not-an-email';
    const cta = win.document.querySelector('button[data-shippie-handoff-email-cta]') as unknown as HTMLButtonElement;
    cta.click();
    await Promise.resolve();
    expect(calls).toBe(0);
  });

  test('unmountHandoffSheet removes the sheet', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: false,
    });
    unmountHandoffSheet();
    expect(win.document.querySelector('[data-shippie-handoff]')).toBeNull();
  });

  test('renders an SVG QR code inside the sheet', () => {
    mountHandoffSheet({
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
      onSendEmail: async () => {},
      onSendPush: async () => {},
      canPush: false,
    });
    const sheet = win.document.querySelector('[data-shippie-handoff]');
    expect(sheet).not.toBeNull();
    // The real QR renderer outputs an <svg> element.
    const svg = sheet?.querySelector('svg');
    expect(svg).not.toBeNull();
    // The URL-as-text element remains for screen readers + fallback.
    expect(sheet?.querySelector('[data-shippie-handoff-qr-url]')).not.toBeNull();
  });
});
