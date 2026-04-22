import { describe, expect, test } from 'bun:test';
import { renderHandoffEmail, buildPushPayload } from './handoff.ts';

describe('renderHandoffEmail', () => {
  test('includes the app name and handoff URL in every part', () => {
    const r = renderHandoffEmail({
      appName: 'Zen Notes',
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
    });
    expect(r.subject).toContain('Zen Notes');
    expect(r.html).toContain('Zen Notes');
    expect(r.html).toContain('https://shippie.app/apps/zen?ref=handoff');
    expect(r.text).toContain('Zen Notes');
    expect(r.text).toContain('https://shippie.app/apps/zen?ref=handoff');
  });

  test('HTML escapes the app name', () => {
    const r = renderHandoffEmail({
      appName: '<script>evil</script>',
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
    });
    expect(r.html).not.toContain('<script>evil</script>');
    expect(r.html).toContain('&lt;script&gt;');
  });
});

describe('buildPushPayload', () => {
  test('produces the expected shape', () => {
    const p = buildPushPayload({
      appName: 'Zen Notes',
      handoffUrl: 'https://shippie.app/apps/zen?ref=handoff',
    });
    expect(p.title).toContain('Zen Notes');
    expect(p.url).toBe('https://shippie.app/apps/zen?ref=handoff');
    expect(typeof p.body).toBe('string');
  });
});
