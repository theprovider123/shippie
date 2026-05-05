import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_therapy_notes',
  slug: 'therapy-notes',
  eyebrow: 'Therapy Notes',
  title: 'Between-session work, private by default.',
  subtitle: 'CBT prompts, mood check-ins, and export-ready notes that never phone home.',
  privacyLine: 'Mental health notes stay local until the user exports them for a therapist.',
  tone: 'ink',
  tags: ['privacy-essential', 'local worksheets', 'PDF handoff ready'],
  placeholder: 'Thought, evidence, alternative frame, next step...',
  emptyText: 'Save a worksheet, mood check-in, or between-session note.',
  consumes: ['sleep-logged', 'mindful-session'],
  workspaceTitle: 'Session prep',
  workspaceItems: [
    { modeId: 'worksheet', label: 'Worksheets', detail: 'Thought records and CBT prompts.' },
    { modeId: 'mood', label: 'Mood checks', detail: 'Scores that stay on device.' },
  ],
  handoff: {
    title: 'Therapist handoff',
    description: 'A plain-text local preview for the next appointment.',
    empty: 'No worksheet entries ready for handoff.',
  },
  modes: [
    {
      id: 'worksheet',
      label: 'Worksheet',
      verb: 'Save worksheet',
      detail: 'Capture a CBT worksheet without creating an account trail.',
      intent: 'therapy-checkin',
    },
    {
      id: 'mood',
      label: 'Mood',
      verb: 'Log mood',
      detail: 'Add a quick mood score for trends that stay on device.',
      intent: 'mood-logged',
      metricLabel: 'mood',
      unit: '/10',
      min: 1,
      max: 10,
      defaultValue: 6,
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
