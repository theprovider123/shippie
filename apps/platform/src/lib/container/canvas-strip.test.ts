import { describe, expect, it } from 'vitest';
import { selectCanvasStripItem } from './canvas-strip';

const insight = (id: string, urgency: 'high' | 'medium' | 'low', app: string, generatedAt = 1000) => ({
  id,
  strategy: 's',
  urgency,
  title: id,
  body: 'b',
  target: { app },
  generatedAt,
  provenance: [] as string[],
});
const catalog = [
  { slug: 'palate', name: 'Palate' },
  { slug: 'lift', name: 'Lift' },
  { slug: 'chiwit', name: 'Chiwit' },
];

describe('selectCanvasStripItem', () => {
  it('returns null when nothing is actionable', () => {
    expect(
      selectCanvasStripItem({
        insights: [],
        recents: [],
        catalog,
        activeSlug: null,
        openSlugs: [],
        dismissedIds: new Set(),
        now: 0,
      }),
    ).toBeNull();
  });

  it('picks the highest-urgency insight and counts the rest as remaining', () => {
    const item = selectCanvasStripItem({
      insights: [insight('a', 'low', 'lift'), insight('b', 'high', 'palate'), insight('c', 'medium', 'chiwit')],
      recents: [],
      catalog,
      activeSlug: null,
      openSlugs: [],
      dismissedIds: new Set(),
      now: 0,
    });
    expect(item).toMatchObject({ id: 'b', kind: 'insight', targetSlug: 'palate', remaining: 2 });
  });

  it('drops expired and dismissed insights', () => {
    const item = selectCanvasStripItem({
      insights: [{ ...insight('old', 'high', 'lift'), expiresAt: 50 }, insight('seen', 'high', 'palate')],
      recents: [],
      catalog,
      activeSlug: null,
      openSlugs: [],
      dismissedIds: new Set(['seen']),
      now: 100,
    });
    expect(item).toBeNull();
  });

  it('falls back to a resume hint for the newest non-active, non-open recent', () => {
    const item = selectCanvasStripItem({
      insights: [],
      catalog,
      recents: [
        { slug: 'palate', lastOpened: '2026-06-01T08:00:00Z' },
        { slug: 'lift', lastOpened: '2026-06-01T09:00:00Z' },
      ],
      activeSlug: 'lift',
      openSlugs: ['lift'],
      dismissedIds: new Set(),
      now: 0,
    });
    expect(item).toMatchObject({ id: 'resume:palate', kind: 'resume', title: 'Resume Palate', targetSlug: 'palate' });
  });

  it('hides a dismissed resume hint', () => {
    const item = selectCanvasStripItem({
      insights: [],
      catalog,
      recents: [{ slug: 'palate', lastOpened: '2026-06-01T08:00:00Z' }],
      activeSlug: null,
      openSlugs: [],
      dismissedIds: new Set(['resume:palate']),
      now: 0,
    });
    expect(item).toBeNull();
  });
});
