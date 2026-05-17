import { describe, expect, test } from 'bun:test';
import { createOpeningShareCardSvg, shareCardDataUrl } from './share-card.ts';

describe('share card composer', () => {
  test('renders a safe svg data url', () => {
    const svg = createOpeningShareCardSvg({ roomName: '<Room>', provenance: 'Room confirmation ready' });
    expect(svg).toContain('&lt;Room&gt;');
    expect(shareCardDataUrl(svg)).toStartWith('data:image/svg+xml');
  });
});
