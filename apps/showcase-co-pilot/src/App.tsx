import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_co_pilot',
  slug: 'co-pilot',
  eyebrow: 'Co-Pilot',
  title: 'Handover without a middleman.',
  subtitle: 'Schedule, meds, and notes for separated co-parents. Paired devices, not surveillance.',
  privacyLine: 'Nothing is brokered by a company. The shared history lives on the parents paired devices.',
  tone: 'sea',
  tags: ['mesh co-parenting', 'handover notes', 'local meds log'],
  placeholder: 'PE kit packed, inhaler in front pocket, pickup at 5...',
  emptyText: 'Add a handover, custody schedule note, or medication entry.',
  workspaceTitle: 'Care lanes',
  workspaceItems: [
    { modeId: 'handover', label: 'Handover', detail: 'The notes that need to survive the doorway.' },
    { modeId: 'meds', label: 'Meds', detail: 'Dose history held by the paired parents.' },
    { modeId: 'schedule', label: 'Schedule', detail: 'Pickup, school, and custody changes.' },
  ],
  handoff: {
    title: 'Pickup summary',
    description: 'A local handoff note for the next exchange. No chat monitoring, no account export.',
    empty: 'No pickup notes yet.',
  },
  modes: [
    {
      id: 'handover',
      label: 'Handover',
      verb: 'Save handover',
      detail: 'Capture the practical notes that should survive pickup and dropoff.',
      intent: 'handover-note',
    },
    {
      id: 'meds',
      label: 'Meds',
      verb: 'Log meds',
      detail: 'Record a dose without sending medical context to a third party.',
      intent: 'meds-logged',
      metricLabel: 'doses',
      unit: 'dose',
      min: 1,
      max: 4,
      defaultValue: 1,
    },
    {
      id: 'schedule',
      label: 'Schedule',
      verb: 'Add schedule',
      detail: 'Mark a custody or pickup change in the shared local stream.',
      intent: 'custody-event',
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
