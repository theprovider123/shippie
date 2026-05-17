/**
 * Five-minute check-in. Three prompts, optional answers. Phrased so
 * an empty field reads as "no, nothing today" rather than failure.
 */
import type { TemplateField, TemplateValues, WorksheetTemplate } from './types.ts';

const FIELDS: ReadonlyArray<TemplateField> = [
  {
    key: 'loud',
    prompt: 'What\'s loud right now?',
    kind: 'long',
  },
  {
    key: 'quieter',
    prompt: 'What\'s quieter than expected?',
    kind: 'long',
  },
  {
    key: 'next_session',
    prompt: 'What do you want from your next session?',
    kind: 'long',
  },
];

export function serializeFiveMinuteCheckin(values: TemplateValues): string {
  const get = (k: string): string => {
    const v = values[k];
    if (v === undefined || v === null) return '';
    return String(v).trim();
  };
  const sections: string[] = [];
  sections.push('## Five-minute check-in');
  sections.push('');
  const loud = get('loud');
  if (loud) {
    sections.push('**Loud right now**');
    sections.push(loud);
    sections.push('');
  }
  const quieter = get('quieter');
  if (quieter) {
    sections.push('**Quieter than expected**');
    sections.push(quieter);
    sections.push('');
  }
  const next = get('next_session');
  if (next) {
    sections.push('**For next session**');
    sections.push(next);
    sections.push('');
  }
  return sections.join('\n').trimEnd();
}

export const fiveMinuteCheckinTemplate: WorksheetTemplate = {
  id: 'five-minute-checkin',
  kind: 'check-in',
  title: 'Five-minute check-in',
  subtitle: 'Three short prompts. Skip any that don\'t fit.',
  defaultTitle: 'Five-minute check-in',
  fields: FIELDS,
  serialize: serializeFiveMinuteCheckin,
};
