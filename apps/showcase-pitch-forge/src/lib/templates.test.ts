import { describe, expect, test } from 'bun:test';
import {
  BUILTIN_TEMPLATES,
  PITCH_TYPE_LABEL,
  SECTION_KIND_LABEL,
  templateFor,
  type PitchType,
} from './templates.ts';

describe('templates · structure', () => {
  test('every type has a builtin', () => {
    const types: PitchType[] = ['grant', 'rfp', 'proposal', 'sponsorship', 'board-update', 'custom'];
    for (const t of types) {
      const tmpl = BUILTIN_TEMPLATES.find((x) => x.type === t);
      expect(tmpl).toBeDefined();
      expect(tmpl!.sections.length).toBeGreaterThan(0);
    }
  });

  test('templateFor returns a matching template', () => {
    expect(templateFor('grant').type).toBe('grant');
    expect(templateFor('rfp').type).toBe('rfp');
  });

  test('templateFor falls back to custom for unknown type', () => {
    // Cast to dodge the type-narrowing safety net — we want runtime behaviour.
    const t = templateFor('unknown' as unknown as PitchType);
    expect(t.type).toBe('custom');
  });
});

describe('templates · grant', () => {
  test('starts with problem and ends with references', () => {
    const t = templateFor('grant');
    const kinds = t.sections.map((s) => s.kind);
    expect(kinds[0]).toBe('problem');
    expect(kinds[kinds.length - 1]).toBe('references');
  });

  test('contains the expected six sections', () => {
    const t = templateFor('grant');
    const kinds = t.sections.map((s) => s.kind);
    expect(kinds).toEqual(['problem', 'solution', 'budget', 'impact', 'team', 'references']);
  });
});

describe('templates · rfp', () => {
  test('starts with executive summary', () => {
    const t = templateFor('rfp');
    expect(t.sections[0]?.kind).toBe('summary');
    expect(t.sections[0]?.title.toLowerCase()).toContain('summary');
  });

  test('contains pricing + timeline + qualifications', () => {
    const t = templateFor('rfp');
    const kinds = new Set(t.sections.map((s) => s.kind));
    expect(kinds.has('budget')).toBe(true);
    expect(kinds.has('timeline')).toBe(true);
    expect(kinds.has('team')).toBe(true);
  });
});

describe('templates · proposal', () => {
  test('starts with about-you and ends with next-steps', () => {
    const t = templateFor('proposal');
    expect(t.sections[0]?.kind).toBe('team');
    const last = t.sections[t.sections.length - 1];
    expect(last?.title.toLowerCase()).toContain('next');
  });
});

describe('templates · sponsorship', () => {
  test('audience first, commercials last', () => {
    const t = templateFor('sponsorship');
    expect(t.sections[0]?.title.toLowerCase()).toContain('audience');
    const last = t.sections[t.sections.length - 1];
    expect(last?.title.toLowerCase()).toContain('commercials');
  });
});

describe('templates · board-update', () => {
  test('highlights then lowlights then asks then metrics', () => {
    const t = templateFor('board-update');
    const titles = t.sections.map((s) => s.title.toLowerCase());
    expect(titles[0]).toContain('highlights');
    expect(titles[1]).toContain('lowlights');
    expect(titles[2]).toContain('asks');
    expect(titles[3]).toContain('metrics');
  });
});

describe('templates · labels', () => {
  test('PITCH_TYPE_LABEL covers all builtin types', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(PITCH_TYPE_LABEL[t.type]).toBeTruthy();
    }
  });

  test('SECTION_KIND_LABEL has labels for every kind used', () => {
    for (const tmpl of BUILTIN_TEMPLATES) {
      for (const s of tmpl.sections) {
        expect(SECTION_KIND_LABEL[s.kind]).toBeTruthy();
      }
    }
  });
});
