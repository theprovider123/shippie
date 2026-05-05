import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_symptom_diary',
  slug: 'symptom-diary',
  eyebrow: 'Symptom Diary',
  title: 'Doctor handoff, without data capture.',
  subtitle: 'Symptoms, triggers, medication, and export-ready history for chronic conditions.',
  privacyLine: 'Medical history stays local and export is user-controlled.',
  tone: 'paper',
  tags: ['privacy-essential', 'export-ready', 'chronic illness'],
  placeholder: 'Pain flare after lunch, medication at 14:00, trigger suspect...',
  emptyText: 'Log a symptom, trigger, or medication note.',
  consumes: ['sleep-logged', 'mood-logged', 'cooked-meal', 'body-metrics-logged'],
  workspaceTitle: 'Clinic prep',
  workspaceItems: [
    { modeId: 'symptom', label: 'Symptoms', detail: 'Severity and trigger context.' },
    { modeId: 'medication', label: 'Medication', detail: 'What changed before the visit.' },
  ],
  handoff: {
    title: 'Doctor handoff',
    description: 'A local appointment summary you can copy or later export as a PDF.',
    empty: 'No symptom history ready for handoff.',
  },
  modes: [
    {
      id: 'symptom',
      label: 'Symptom',
      verb: 'Log symptom',
      detail: 'Record severity and context for a future appointment.',
      intent: 'symptom-logged',
      metricLabel: 'severity',
      unit: '/10',
      min: 1,
      max: 10,
      defaultValue: 5,
    },
    {
      id: 'medication',
      label: 'Medication',
      verb: 'Log medication',
      detail: 'Keep a medication note beside the symptom timeline.',
      intent: 'symptom-logged',
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
