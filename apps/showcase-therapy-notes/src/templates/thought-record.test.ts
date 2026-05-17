import { describe, expect, it } from 'bun:test';
import { serializeThoughtRecord, thoughtRecordTemplate } from './thought-record.ts';

describe('thought-record template', () => {
  it('exposes the canonical CBT fields', () => {
    const keys = thoughtRecordTemplate.fields.map((f) => f.key);
    expect(keys).toEqual([
      'situation',
      'emotion',
      'intensity',
      'automatic_thought',
      'evidence_for',
      'evidence_against',
      'balanced_thought',
    ]);
  });

  it('serialises a fully filled record as readable markdown', () => {
    const md = serializeThoughtRecord({
      situation: 'Tuesday standup. Was asked about a deadline.',
      emotion: 'anxious',
      intensity: 7,
      automatic_thought: 'They\'ll think I can\'t handle it.',
      evidence_for: 'I missed last week\'s deadline.',
      evidence_against: 'I shipped the previous five on time.',
      balanced_thought: 'One miss isn\'t a pattern.',
    });
    expect(md).toContain('## Thought record');
    expect(md).toContain('**Situation**');
    expect(md).toContain('Tuesday standup. Was asked about a deadline.');
    expect(md).toContain('**Emotion**: anxious (7/10)');
    expect(md).toContain('**Automatic thought**');
    expect(md).toContain("They'll think I can't handle it.");
    expect(md).toContain('**Evidence for**');
    expect(md).toContain('**Evidence against**');
    expect(md).toContain('**A more balanced thought**');
  });

  it('omits empty sections so a half-filled record stays readable', () => {
    const md = serializeThoughtRecord({
      situation: 'A small thing.',
      emotion: 'sad',
    });
    expect(md).toContain('## Thought record');
    expect(md).toContain('**Situation**');
    expect(md).toContain('**Emotion**: sad');
    expect(md).not.toContain('Evidence for');
    expect(md).not.toContain('balanced');
  });

  it('includes intensity even when emotion is blank', () => {
    const md = serializeThoughtRecord({ intensity: 4 });
    expect(md).toContain('**Emotion**:  (4/10)');
  });

  it('handles totally empty values without throwing', () => {
    const md = serializeThoughtRecord({});
    expect(md).toBe('## Thought record');
  });

  it('trims whitespace from string fields', () => {
    const md = serializeThoughtRecord({
      situation: '   spaces around   \n',
      automatic_thought: '\n  thought  \n',
    });
    expect(md).toContain('spaces around');
    expect(md).not.toContain('   spaces around   ');
    expect(md).toContain('thought');
  });
});
