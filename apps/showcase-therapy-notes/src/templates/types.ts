/**
 * Worksheet template types. Each template defines a list of fields
 * the user fills in; `serialize()` turns the values into a markdown
 * body that's saved into `notes.body_md`. The therapist reading the
 * printed PDF sees plain markdown — no app-specific encoding.
 */
import type { NoteKind } from '../db/schema.ts';

export type FieldKind = 'short' | 'long' | 'rating' | 'checklist';

export interface TemplateField {
  /** Stable key for storing the value in form state. */
  key: string;
  /** Heading the user reads. */
  prompt: string;
  /** Optional helper text below the prompt. Quiet; never coercive. */
  hint?: string;
  kind: FieldKind;
  /** For `rating`: 1..max with this label. */
  ratingMax?: number;
  /** For `rating`: optional unit suffix shown after the number (e.g. "/10"). */
  ratingUnit?: string;
  /** For `checklist`: the items the user can tick. */
  options?: ReadonlyArray<string>;
}

export type TemplateValue = string | number | ReadonlyArray<string>;
export type TemplateValues = Record<string, TemplateValue | undefined>;

export interface WorksheetTemplate {
  /** Stable id, e.g. 'thought-record'. */
  id: string;
  /** Maps to `notes.kind`. */
  kind: NoteKind;
  /** Title shown in the picker. */
  title: string;
  /** Subtitle in the picker. Honest, not breathless. */
  subtitle: string;
  /** What goes into `notes.title` if the user doesn't override. */
  defaultTitle: string;
  fields: ReadonlyArray<TemplateField>;
  /** Render filled-in values as markdown for `notes.body_md`. */
  serialize(values: TemplateValues): string;
}
