import { describe, expect, it } from 'bun:test';
import { TEMPLATES, getTemplate, templateChecks } from './templates.ts';

describe('built-in templates', () => {
  it('exposes the five named templates', () => {
    const ids = TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual(['boiler-service', 'electrical', 'fire-safety', 'move-in-survey', 'snag-list']);
  });

  it('every template has at least five checks', () => {
    for (const t of TEMPLATES) {
      expect(t.checks.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('every template has a non-empty name and description', () => {
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('check labels are unique within a template', () => {
    for (const t of TEMPLATES) {
      const set = new Set(t.checks);
      expect(set.size).toBe(t.checks.length);
    }
  });

  it('templateChecks returns the same array as the template definition', () => {
    expect(templateChecks('fire-safety')).toEqual(getTemplate('fire-safety')!.checks);
  });

  it('templateChecks returns empty for unknown ids', () => {
    expect(templateChecks('not-a-real-template')).toEqual([]);
    expect(getTemplate('not-a-real-template')).toBeNull();
  });
});
