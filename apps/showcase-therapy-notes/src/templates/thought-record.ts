/**
 * Classic CBT thought record. Six fields, plain language. We don't
 * coach the user inside the prompts — the therapist does that. The
 * hints are factual, not encouraging.
 */
import type { TemplateField, TemplateValues, WorksheetTemplate } from './types.ts';

const FIELDS: ReadonlyArray<TemplateField> = [
  {
    key: 'situation',
    prompt: 'Situation',
    hint: 'When and where. What happened.',
    kind: 'long',
  },
  {
    key: 'emotion',
    prompt: 'Emotion',
    hint: 'One or two words. Sad, anxious, angry, embarrassed.',
    kind: 'short',
  },
  {
    key: 'intensity',
    prompt: 'Intensity',
    hint: '0 means absent. 10 means as strong as it gets.',
    kind: 'rating',
    ratingMax: 10,
    ratingUnit: '/10',
  },
  {
    key: 'automatic_thought',
    prompt: 'Automatic thought',
    hint: 'The sentence that ran through your head.',
    kind: 'long',
  },
  {
    key: 'evidence_for',
    prompt: 'Evidence for the thought',
    kind: 'long',
  },
  {
    key: 'evidence_against',
    prompt: 'Evidence against the thought',
    kind: 'long',
  },
  {
    key: 'balanced_thought',
    prompt: 'A more balanced thought',
    hint: 'Optional. Sometimes there isn\'t one yet.',
    kind: 'long',
  },
];

export function serializeThoughtRecord(values: TemplateValues): string {
  const get = (k: string): string => {
    const v = values[k];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v).trim();
  };
  const sections: string[] = [];
  sections.push('## Thought record');
  sections.push('');
  const sit = get('situation');
  if (sit) {
    sections.push('**Situation**');
    sections.push(sit);
    sections.push('');
  }
  const emotion = get('emotion');
  const intensity = get('intensity');
  if (emotion || intensity) {
    const intensityStr = intensity ? ` (${intensity}/10)` : '';
    sections.push(`**Emotion**: ${emotion}${intensityStr}`);
    sections.push('');
  }
  const auto = get('automatic_thought');
  if (auto) {
    sections.push('**Automatic thought**');
    sections.push(auto);
    sections.push('');
  }
  const ef = get('evidence_for');
  if (ef) {
    sections.push('**Evidence for**');
    sections.push(ef);
    sections.push('');
  }
  const ea = get('evidence_against');
  if (ea) {
    sections.push('**Evidence against**');
    sections.push(ea);
    sections.push('');
  }
  const bal = get('balanced_thought');
  if (bal) {
    sections.push('**A more balanced thought**');
    sections.push(bal);
    sections.push('');
  }
  return sections.join('\n').trimEnd();
}

export const thoughtRecordTemplate: WorksheetTemplate = {
  id: 'thought-record',
  kind: 'thought-record',
  title: 'Thought record',
  subtitle: 'Walk through a thought, the evidence, and a more balanced version.',
  defaultTitle: 'Thought record',
  fields: FIELDS,
  serialize: serializeThoughtRecord,
};
