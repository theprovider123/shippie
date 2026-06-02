import { describe, expect, it } from 'vitest';
import type { RailGroups, RailTool } from './rail-groups';
import { buildToolSwitcherSections } from './tool-switcher';

const tool = (slug: string, category = 'tools'): RailTool => ({
  slug,
  name: slug[0]!.toUpperCase() + slug.slice(1),
  icon: slug.slice(0, 2).toUpperCase(),
  accent: '#E8603C',
  category,
});

const groups: RailGroups = {
  open: [tool('palate', 'cooking')],
  saved: [tool('journal', 'personal')],
  recent: [tool('lift', 'fitness')],
};

describe('buildToolSwitcherSections', () => {
  it('shows only personal switcher context', () => {
    const sections = buildToolSwitcherSections({
      groups,
      allApps: [tool('palate'), tool('journal'), tool('lift'), tool('sleep')],
    });
    expect(sections.map((s) => s.id)).toEqual(['open', 'saved', 'recent']);
    expect(sections[1]?.label).toBe('Saved');
    expect(sections.flatMap((s) => s.tools.map((t) => t.slug))).not.toContain('sleep');
  });

  it('searches running, saved, and recent tools only', () => {
    const sections = buildToolSwitcherSections({
      groups,
      allApps: [tool('palate'), tool('journal'), tool('lift'), tool('coffee', 'cooking')],
      query: 'cook',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe('results');
    expect(sections[0]?.tools.map((t) => t.slug)).toEqual(['palate']);
  });

  it('caps large sections and reports hidden count', () => {
    const many = Array.from({ length: 120 }, (_, i) => tool(`app-${i}`));
    const sections = buildToolSwitcherSections({
      groups: { open: many, saved: [], recent: [] },
      allApps: many,
      maxPerSection: 40,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.tools).toHaveLength(40);
    expect(sections[0]?.hidden).toBe(80);
  });
});
