/**
 * pdf-data.ts — derive print-view data from a date range.
 *
 * Pure. No Yjs, no DOM, no print API. The PrintView component takes
 * the resulting `ReportData` and renders it; `window.print()` lives
 * in the component, not here.
 */
import type {
  HandoverNote,
  MedDose,
  MedItem,
  SymptomEntry,
} from '../sync/care-doc.ts';

export interface ReportData {
  startISO: string;
  endISO: string;
  /** All meds, with dose count over the range; includes inactive if they had doses in range. */
  meds: ReportMedSummary[];
  /** All doses in range, oldest first. */
  doses: MedDose[];
  /** Symptoms in range, oldest first. */
  symptoms: SymptomEntry[];
  /** Handover notes in range that the caller chose to include. */
  handover: HandoverNote[];
}

export interface ReportMedSummary {
  med: MedItem;
  doseCountInRange: number;
  missedCountInRange: number;
}

/**
 * Filter and sort all the report inputs to a date range.
 *
 * Range is inclusive on both ends. The caller passes ISO dates
 * (YYYY-MM-DD); we treat them as local-time day boundaries.
 *
 * Sort order: doses oldest-first, symptoms oldest-first, handover
 * oldest-first. The PDF reads top-down chronologically.
 */
export function buildReportData(args: {
  startISO: string;
  endISO: string;
  meds: readonly MedItem[];
  doses: readonly MedDose[];
  symptoms: readonly SymptomEntry[];
  handover: readonly HandoverNote[];
  /** Subset of handover ids the caregiver chose to include in the PDF. */
  includedHandoverIds: ReadonlySet<string>;
}): ReportData {
  const startMs = startOfDayMs(args.startISO);
  const endMs = endOfDayMs(args.endISO);

  const inRange = (ms: number) => ms >= startMs && ms <= endMs;

  const doses = args.doses
    .filter((d) => inRange(d.given_at))
    .sort((a, b) => a.given_at - b.given_at);

  const symptoms = args.symptoms
    .filter((s) => inRange(s.occurred_at))
    .sort((a, b) => a.occurred_at - b.occurred_at);

  const handover = args.handover
    .filter((h) => inRange(h.written_at) && args.includedHandoverIds.has(h.id))
    .sort((a, b) => a.written_at - b.written_at);

  const dosesByMed = new Map<string, MedDose[]>();
  for (const d of doses) {
    const list = dosesByMed.get(d.med_id) ?? [];
    list.push(d);
    dosesByMed.set(d.med_id, list);
  }

  // Include any med that's active OR had a dose in the range.
  const meds: ReportMedSummary[] = args.meds
    .filter((m) => m.active || dosesByMed.has(m.id))
    .map((m) => {
      const list = dosesByMed.get(m.id) ?? [];
      return {
        med: m,
        doseCountInRange: list.filter((d) => !d.missed).length,
        missedCountInRange: list.filter((d) => d.missed).length,
      };
    })
    .sort((a, b) => a.med.name.localeCompare(b.med.name));

  return {
    startISO: args.startISO,
    endISO: args.endISO,
    meds,
    doses,
    symptoms,
    handover,
  };
}

function startOfDayMs(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  return d.getTime();
}

function endOfDayMs(iso: string): number {
  const d = new Date(`${iso}T23:59:59.999`);
  return d.getTime();
}

/** Convenience: build a default end-of-today / start-of-N-days-ago range. */
export function defaultRange(days = 7, now: Date = new Date()): { startISO: string; endISO: string } {
  const end = isoOf(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  return { startISO: isoOf(startDate), endISO: end };
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
