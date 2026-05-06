/**
 * Values check-in. Twelve plain words. The user ticks the ones they
 * felt they lived this week. There's no score, no streak, no badge —
 * the list itself is the artefact.
 */
import type { TemplateField, TemplateValues, WorksheetTemplate } from './types.ts';

export const VALUES = [
  'kindness',
  'curiosity',
  'honesty',
  'patience',
  'courage',
  'rest',
  'connection',
  'creativity',
  'fairness',
  'discipline',
  'humour',
  'care',
] as const;

const FIELDS: ReadonlyArray<TemplateField> = [
  {
    key: 'lived',
    prompt: 'What did this week have in it?',
    hint: 'Tick anything that fits. Skip anything that doesn\'t. There\'s no score.',
    kind: 'checklist',
    options: VALUES,
  },
  {
    key: 'note',
    prompt: 'Anything to add',
    hint: 'Optional.',
    kind: 'long',
  },
];

export function serializeValuesCheckin(values: TemplateValues): string {
  const lived = Array.isArray(values.lived) ? values.lived : [];
  const note = typeof values.note === 'string' ? values.note.trim() : '';
  const sections: string[] = [];
  sections.push('## Values check-in');
  sections.push('');
  if (lived.length > 0) {
    sections.push('**This week had:**');
    for (const v of lived) sections.push(`- ${v}`);
    sections.push('');
  } else {
    sections.push('_Nothing ticked._');
    sections.push('');
  }
  if (note) {
    sections.push(note);
  }
  return sections.join('\n').trimEnd();
}

export const valuesCheckinTemplate: WorksheetTemplate = {
  id: 'values-checkin',
  kind: 'values',
  title: 'Values check-in',
  subtitle: 'Tick the ones the week had in it. Skip the ones it didn\'t.',
  defaultTitle: 'Values check-in',
  fields: FIELDS,
  serialize: serializeValuesCheckin,
};
