import { describe, expect, it } from 'vitest';
import {
  BROWSE_FILTERS,
  CONTROLLED_DISCOVERY_AXES,
  DRAWER_SECTIONS,
  MAX_CONTROLLED_CATEGORIES,
  categoryCountWithinBudget,
  isControlledAxis,
} from './discovery';
import { VALID_CATEGORIES } from '$lib/curation/schema';

describe('discovery contract', () => {
  it('has exactly three controlled navigation axes (no 4th taxonomy)', () => {
    expect([...CONTROLLED_DISCOVERY_AXES]).toEqual(['category', 'kind', 'surface']);
  });

  it('treats tags as search-only — never a controlled axis or browse facet', () => {
    expect(isControlledAxis('tags')).toBe(false);
    expect([...BROWSE_FILTERS]).not.toContain('tags');
  });

  it('exposes browse filters = controlled axes + search + remixable', () => {
    expect([...BROWSE_FILTERS]).toEqual(['category', 'kind', 'surface', 'search', 'remixable']);
  });

  it('orders the drawer personal-context-first (recent leads)', () => {
    expect(DRAWER_SECTIONS[0]).toBe('recent');
    expect([...DRAWER_SECTIONS]).toEqual(['recent', 'pinned', 'installed', 'suggested']);
  });

  it('keeps the category vocab within the chip-sprawl budget', () => {
    expect(categoryCountWithinBudget()).toBe(true);
    expect(VALID_CATEGORIES.length).toBeLessThanOrEqual(MAX_CONTROLLED_CATEGORIES);
  });
});
