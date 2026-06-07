import { test, expect } from 'bun:test';
import {
  scanForSafeguarding,
  excludeSafeguarding,
  buildPseudonymMap,
  pseudonymise,
  expandPseudonym,
  contentHashKey,
  type AdaptationCard,
} from './index';

// ── Safeguarding guard ──────────────────────────────────────────────────────

test('safeguarding guard flags welfare/abuse/care/health/family signal', () => {
  for (const s of [
    'There is a safeguarding concern about this child',
    'made a disclosure to the TA',
    'pupil is self-harming',
    'a looked-after child in foster care',
    'family is homeless and using the food bank',
    'on medication, CAMHS referral pending',
    'parent in prison, recently bereaved',
  ]) {
    expect(scanForSafeguarding(s).flagged).toBe(true);
  }
});

test('safeguarding guard does NOT flag ordinary pedagogical notes', () => {
  for (const s of [
    'struggled with equivalent fractions',
    'needs pre-teaching of numerator and denominator',
    'confident with number bonds, ready to extend',
    'quiet in group work, paired with a peer',
  ]) {
    expect(scanForSafeguarding(s).flagged).toBe(false);
  }
});

test('excludeSafeguarding removes (not masks-in-place) flagged strings and reports paths', () => {
  const ctx = {
    objective: 'add fractions',
    pupils: [
      { id: 'p1', note: 'needs pre-teaching of denominator' },
      { id: 'p2', note: 'safeguarding disclosure last week' },
    ],
  };
  const { clean, report } = excludeSafeguarding(ctx);
  expect(clean.pupils[0]?.note).toBe('needs pre-teaching of denominator');
  expect(clean.pupils[1]?.note).toBe('[excluded: safeguarding]');
  // The sensitive text is gone — not present anywhere in the cleaned context.
  expect(JSON.stringify(clean)).not.toContain('disclosure');
  expect(report.excluded).toHaveLength(1);
  expect(report.excluded[0]?.path).toBe('pupils[1].note');
});

// ── Pseudonymiser ───────────────────────────────────────────────────────────

test('pseudonymise replaces ids AND display names with stable labels', () => {
  const map = buildPseudonymMap({ pupilIds: ['p12', 'p3'] });
  expect(map.forward.p12).toBe('Pupil A');
  expect(map.forward.p3).toBe('Pupil B');
  const ctx = {
    note: 'p12 (Aisha J.) needs support; p3 is ready',
    target: ['p12'],
  };
  const out = pseudonymise(ctx, map, { p12: 'Aisha J.', p3: 'Ben C.' });
  expect(out.note).toBe('Pupil A (Pupil A) needs support; Pupil B is ready');
  expect(out.target).toEqual(['Pupil A']);
  // No real identifier survives.
  expect(JSON.stringify(out)).not.toContain('Aisha');
  expect(JSON.stringify(out)).not.toContain('p12');
});

test('expandPseudonym round-trips a label back to its real id', () => {
  const map = buildPseudonymMap({ pupilIds: ['p9'] });
  expect(expandPseudonym('Pupil A', map)).toBe('p9');
  expect(expandPseudonym('Pupil Z', map)).toBe('Pupil Z'); // unknown passthrough
});

// ── Content-hash cache key ──────────────────────────────────────────────────

test('contentHashKey is stable across key order and changes with content', () => {
  const a = contentHashKey({
    appId: 'uniti',
    purpose: 'adaptation.generate',
    tier: 'standard',
    cleanContext: { objective: 'x', pupils: [{ id: 'A', n: 1 }] },
  });
  const b = contentHashKey({
    appId: 'uniti',
    purpose: 'adaptation.generate',
    tier: 'standard',
    cleanContext: { pupils: [{ n: 1, id: 'A' }], objective: 'x' }, // reordered
  });
  const c = contentHashKey({
    appId: 'uniti',
    purpose: 'adaptation.generate',
    tier: 'standard',
    cleanContext: { objective: 'y', pupils: [{ id: 'A', n: 1 }] },
  });
  expect(a).toBe(b);
  expect(a).not.toBe(c);
  expect(a.startsWith('ai:')).toBe(true);
});

// ── Card shape ──────────────────────────────────────────────────────────────

test('AdaptationCard carries provenance + teacher-owned review state', () => {
  const card = {
    id: 'card-1',
    instanceId: 'i1',
    target: { kind: 'group', ids: ['p1', 'p2'], label: '2 pupils' },
    objective: 'add fractions',
    need: 'finding equivalent fractions hard',
    strategy: 'pre-teach key vocabulary',
    teacherAction: 'Pre-teach: numerator, denominator, equivalent',
    whyThis: 'these pupils needed revisiting last lesson',
    evidence: [{ lessonId: 'l1', date: '2026-06-07', note: 'needs revisit' }],
    confidence: 'emerging',
    reviewState: 'suggested',
    source: 'rules',
    schemaVersion: 1,
  } satisfies AdaptationCard;
  expect(card.reviewState).toBe('suggested'); // teacher owns acceptance
  expect(card.source).toBe('rules');
});
