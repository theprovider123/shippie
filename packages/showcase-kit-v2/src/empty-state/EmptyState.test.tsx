import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  test('renders eyebrow, headline, body, cta button', () => {
    const html = renderToString(
      <EmptyState
        eyebrow="No signals yet"
        headline={<>Log one when you <em>notice it</em></>}
        body="Tap any quick-signal pill."
        cta={{ label: 'Log now', onClick: () => {} }}
      />,
    );
    expect(html).toContain('shippie-empty-state__eyebrow');
    expect(html).toContain('No signals yet');
    expect(html).toContain('<em>notice it</em>');
    expect(html).toContain('Tap any quick-signal pill.');
    expect(html).toContain('Log now');
    expect(html).toContain('<button');
  });

  test('omits body and cta when not provided', () => {
    const html = renderToString(<EmptyState eyebrow="X" headline="Y" />);
    expect(html).not.toContain('shippie-empty-state__body');
    expect(html).not.toContain('shippie-empty-state__cta');
  });

  test('href cta renders as anchor', () => {
    const html = renderToString(
      <EmptyState eyebrow="X" headline="Y" cta={{ label: 'Go', href: '/x' }} />,
    );
    expect(html).toContain('href="/x"');
    expect(html).toContain('Go');
  });
});
