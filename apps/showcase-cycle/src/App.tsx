import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_cycle',
  slug: 'cycle',
  eyebrow: 'Cycle',
  title: 'Cycle data with no exit path.',
  subtitle: 'Period, fertility, and symptom context stored locally, with optional partner mesh.',
  privacyLine: 'Cycle entries are local by default. Sharing is explicit and device-to-device.',
  tone: 'rose',
  tags: ['privacy-essential', 'optional partner mesh', 'local health log'],
  placeholder: 'Day one, cramps, cervical fluid, temperature note...',
  emptyText: 'Log a cycle day, fertility note, or symptom context.',
  consumes: ['body-metrics-logged', 'mood-logged'],
  workspaceTitle: 'Cycle context',
  workspaceItems: [
    { modeId: 'period', label: 'Period days', detail: 'Flow and symptoms, local first.' },
    { modeId: 'fertility', label: 'Fertility signs', detail: 'Optional context, optional sharing.' },
  ],
  handoff: {
    title: 'Cycle summary',
    description: 'Local cycle context for personal review or a clinician visit.',
    empty: 'No cycle context logged yet.',
  },
  modes: [
    {
      id: 'period',
      label: 'Period',
      verb: 'Log period',
      detail: 'Track flow without sending reproductive health data to a backend.',
      intent: 'cycle-logged',
      metricLabel: 'flow',
      unit: '/5',
      min: 1,
      max: 5,
      defaultValue: 2,
    },
    {
      id: 'fertility',
      label: 'Fertility',
      verb: 'Save note',
      detail: 'Record fertility signs locally and keep partner sharing optional.',
      intent: 'cycle-logged',
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
