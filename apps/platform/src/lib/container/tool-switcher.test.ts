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
  pinned: [tool('journal', 'personal')],
  recent: [tool('lift', 'fitness')],
};

describe('buildToolSwitcherSections', () => {
  it('orders personal context before browse', () => {
    const sections = buildToolSwitcherSections({
      groups,
      allApps: [tool('palate'), tool('journal'), tool('lift'), tool('sleep')],
    });
    expect(sections.map((s) => s.id)).toEqual(['open', 'pinned', 'recent', 'browse']);
    expect(sections.at(-1)?.tools.map((t) => t.slug)).toEqual(['sleep']);
  });

  it('searches all tools with context-first ordering', () => {
    const sections = buildToolSwitcherSections({
      groups,
      allApps: [tool('palate'), tool('journal'), tool('lift'), tool('coffee', 'cooking')],
      query: 'cook',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe('results');
    expect(sections[0]?.tools.map((t) => t.slug)).toEqual(['palate', 'coffee']);
  });

  it('caps large sections and reports hidden count', () => {
    const many = Array.from({ length: 120 }, (_, i) => tool(`app-${i}`));
    const sections = buildToolSwitcherSections({
      groups: { open: [], pinned: [], recent: [] },
      allApps: many,
      maxPerSection: 40,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.tools).toHaveLength(40);
    expect(sections[0]?.hidden).toBe(80);
  });
});
