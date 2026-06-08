import type { FeltState, PrepState, SafetyFlag, Substance } from './types.ts';

export interface Phase {
  id: string;
  name: string;
  startMin: number;
  endMin: number;
  core: string;
  glow: string;
  voice: string;
  normal: string;
}

interface PhaseTemplate extends Omit<Phase, 'startMin' | 'endMin'> {
  start: number;
  end: number;
}

const COLORS = {
  sage: { core: '#dca05f', glow: '#8d5b2f' },
  olive: { core: '#c9bd7e', glow: '#7a8a5e' },
  amber: { core: '#e0a35c', glow: '#a8702e' },
  ember: { core: '#dd8a6a', glow: '#a8492e' },
  rose: { core: '#d29296', glow: '#9c5560' },
  return: { core: '#9fae8f', glow: '#5e7a52' },
  after: { core: '#c7a98a', glow: '#8a6e4e' },
} as const;

const PSILOCYBIN: readonly PhaseTemplate[] = [
  {
    id: 'settle',
    name: 'Settling in',
    start: 0,
    end: 20,
    ...COLORS.sage,
    voice: 'Start with the room.',
    normal: 'Keep lights, sound, and your phone simple.',
  },
  {
    id: 'onset',
    name: 'Coming up',
    start: 20,
    end: 50,
    ...COLORS.olive,
    voice: 'It may be starting.',
    normal: 'Warmth, butterflies, yawning, or mood shifts can happen.',
  },
  {
    id: 'rising',
    name: 'Rising',
    start: 50,
    end: 90,
    ...COLORS.amber,
    voice: 'It may feel bigger now.',
    normal: 'Let waves rise and fall. You do not need to explain them.',
  },
  {
    id: 'peak',
    name: 'The deep',
    start: 90,
    end: 150,
    ...COLORS.ember,
    voice: 'This is the peak.',
    normal: 'Use fewer words. Breathe out slowly. Stay with the room.',
  },
  {
    id: 'plateau',
    name: 'Plateau',
    start: 150,
    end: 220,
    ...COLORS.rose,
    voice: 'You can rest here.',
    normal: 'Intensity can come in repeats. A familiar song or blanket can help.',
  },
  {
    id: 'return',
    name: 'Returning',
    start: 220,
    end: 300,
    ...COLORS.return,
    voice: 'You are coming back.',
    normal: 'Water, warmth, and quiet are enough.',
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    start: 300,
    end: 420,
    ...COLORS.after,
    voice: 'Move slowly.',
    normal: 'You may feel tender, tired, or clear. No need to explain it yet.',
  },
];

const LSD: readonly PhaseTemplate[] = [
  { ...PSILOCYBIN[0]!, start: 0, end: 45 },
  { ...PSILOCYBIN[1]!, start: 45, end: 110 },
  { ...PSILOCYBIN[2]!, start: 110, end: 190 },
  { ...PSILOCYBIN[3]!, start: 190, end: 330 },
  { ...PSILOCYBIN[4]!, start: 330, end: 480 },
  { ...PSILOCYBIN[5]!, start: 480, end: 660 },
  { ...PSILOCYBIN[6]!, start: 660, end: 840 },
];

const OTHER: readonly PhaseTemplate[] = [
  { ...PSILOCYBIN[0]!, start: 0, end: 30 },
  { ...PSILOCYBIN[1]!, start: 30, end: 70 },
  { ...PSILOCYBIN[2]!, start: 70, end: 120 },
  { ...PSILOCYBIN[3]!, start: 120, end: 190 },
  { ...PSILOCYBIN[4]!, start: 190, end: 270 },
  { ...PSILOCYBIN[5]!, start: 270, end: 360 },
  { ...PSILOCYBIN[6]!, start: 360, end: 480 },
];

export const SUBSTANCE_LABELS: Record<Substance, string> = {
  psilocybin: 'Psilocybin',
  lsd: 'LSD',
  other: 'Other',
};

export function timelineFor(prep: Pick<PrepState, 'substance' | 'amount'>): Phase[] {
  const base = prep.substance === 'lsd' ? LSD : prep.substance === 'other' ? OTHER : PSILOCYBIN;
  const amount = Number.parseFloat(prep.amount);
  const adjustment =
    Number.isFinite(amount) && prep.substance === 'psilocybin'
      ? clamp(Math.round((amount - 2.2) * 8), -10, 24)
      : 0;

  return base.map((phase, index) => ({
    id: phase.id,
    name: phase.name,
    startMin: Math.max(0, phase.start + (index > 1 ? adjustment : 0)),
    endMin: Math.max(phase.start + 1, phase.end + (index > 1 ? adjustment : 0)),
    core: phase.core,
    glow: phase.glow,
    voice: phase.voice,
    normal: phase.normal,
  }));
}

export function phaseAtElapsed(phases: readonly Phase[], elapsedMs: number): Phase {
  if (phases.length === 0) throw new Error('phaseAtElapsed requires at least one phase');
  const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000));
  const match = phases.find((phase) => elapsedMin >= phase.startMin && elapsedMin < phase.endMin);
  if (match) return match;
  const last = phases[phases.length - 1];
  if (!last) throw new Error('phaseAtElapsed requires at least one phase');
  return last;
}

export const FELT_COPY: Record<FeltState, { line: string; normal: string; core: string; glow: string }> = {
  gentle: {
    line: 'Soft and flowing. Stay with it.',
    normal: 'Warmth, gentle visuals, or a quieter mind can be enough. You can simply be here.',
    core: '#8fae93',
    glow: '#5c7a62',
  },
  intense: {
    line: 'Big and moving. Let it pass through.',
    normal: 'Waves that rise and fall are expected. You do not have to hold on to any of it.',
    core: '#e0a35c',
    glow: '#a8702e',
  },
  hard: {
    line: 'This is hard. You do not need to solve it.',
    normal: 'Hard moments change. Breathe out slowly. Support is here.',
    core: '#d98a78',
    glow: '#a8492e',
  },
};

export function displayFor(feel: FeltState | null, phase: Phase): { line: string; normal: string; core: string; glow: string } {
  if (feel) return FELT_COPY[feel];
  return {
    line: phase.voice,
    normal: phase.normal,
    core: phase.core,
    glow: phase.glow,
  };
}

export function afterglowStart(phases: readonly Phase[]): number {
  return phases.find((phase) => phase.id === 'afterglow')?.startMin ?? 300;
}

export function formatClock(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function safetyWarnings(flags: readonly SafetyFlag[]): string[] {
  const set = new Set(flags);
  const warnings: string[] = [];
  if (set.has('lithium')) {
    warnings.push('Lithium has been associated with severe reactions including seizures in psychedelic settings. Pause and speak with a clinician.');
  }
  if (set.has('maoi')) {
    warnings.push('MAOIs can meaningfully change serotonergic drug effects. Do not combine without medical guidance.');
  }
  if (set.has('tramadol')) {
    warnings.push('Tramadol has serotonergic and seizure-risk concerns. Combining substances can be dangerous.');
  }
  if (set.has('ssri-snri')) {
    warnings.push('SSRIs and SNRIs can change or blunt psychedelic effects. Medication changes should only happen with a clinician.');
  }
  if (set.has('heart')) {
    warnings.push('Heart conditions, high blood pressure, fainting, chest pain, or breathing trouble deserve real medical support.');
  }
  if (set.has('psychosis')) {
    warnings.push('A personal or family history of psychosis is a serious caution. Consider professional support before any session.');
  }
  if (set.has('mixed')) {
    warnings.push('Mixed substances make effects less predictable and can raise medical risk. Get sober support involved.');
  }
  return warnings;
}

export function patternInsight(intentions: readonly string[]): string | null {
  const normalized = intentions
    .map((intent) => intent.trim().toLowerCase())
    .filter((intent) => intent.length > 5);
  const counts = new Map<string, number>();
  for (const intent of normalized) counts.set(intent, (counts.get(intent) ?? 0) + 1);
  let best: { intent: string; count: number } | null = null;
  for (const [intent, count] of counts) {
    if (!best || count > best.count) best = { intent, count };
  }
  if (!best || best.count < 2) return null;
  return `You have brought "${best.intent}" into ${best.count} sessions. It may be less a task to finish and more a pattern to keep meeting gently.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
