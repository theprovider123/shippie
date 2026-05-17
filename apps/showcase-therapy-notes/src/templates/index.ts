import { thoughtRecordTemplate } from './thought-record.ts';
import { valuesCheckinTemplate } from './values-checkin.ts';
import { fiveMinuteCheckinTemplate } from './five-minute-checkin.ts';
import type { WorksheetTemplate } from './types.ts';

export const TEMPLATES: ReadonlyArray<WorksheetTemplate> = [
  thoughtRecordTemplate,
  valuesCheckinTemplate,
  fiveMinuteCheckinTemplate,
];

export function getTemplate(id: string): WorksheetTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export type { WorksheetTemplate, TemplateField, TemplateValues } from './types.ts';
export { thoughtRecordTemplate, valuesCheckinTemplate, fiveMinuteCheckinTemplate };
