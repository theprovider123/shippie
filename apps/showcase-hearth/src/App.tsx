import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_hearth',
  slug: 'hearth',
  eyebrow: 'Hearth',
  title: 'Home logistics, held locally.',
  subtitle: 'Chores, fridge notes, dinner plans, and house reminders shared by pairing code.',
  privacyLine: 'Household data stays on paired devices. No chore emails, no grocery profiling.',
  tone: 'paper',
  tags: ['mesh household', 'shared fridge', 'local calendar'],
  placeholder: 'Olive oil is low, boiler service Tuesday, bins tonight...',
  emptyText: 'Add a chore, fridge note, or dinner plan to start the shared home stream.',
  consumes: ['needs-restocking', 'cooked-meal'],
  workspaceTitle: 'House board',
  workspaceItems: [
    { modeId: 'chore', label: 'Chores', detail: 'Shared tasks with no scorekeeping.' },
    { modeId: 'fridge', label: 'Fridge', detail: 'Groceries, repairs, and small house facts.' },
    { modeId: 'dinner', label: 'Dinner', detail: 'What is happening tonight.' },
  ],
  handoff: {
    title: 'House handoff',
    description: 'Copy a plain-text local summary for whoever is walking in next.',
    empty: 'No house notes to hand off yet.',
  },
  modes: [
    {
      id: 'chore',
      label: 'Chore',
      verb: 'Save chore',
      detail: 'Capture a household task without turning home into a points dashboard.',
      intent: 'chore-done',
      metricLabel: 'people',
      unit: 'person',
      min: 1,
      max: 6,
      defaultValue: 2,
    },
    {
      id: 'fridge',
      label: 'Fridge',
      verb: 'Post note',
      detail: 'Leave the kind of fridge note that usually gets lost in chat.',
      intent: 'household-note',
    },
    {
      id: 'dinner',
      label: 'Dinner',
      verb: 'Plan dinner',
      detail: 'Agree what is for dinner and let Daily see the household plan.',
      intent: 'dinner-planned',
      metricLabel: 'servings',
      unit: 'servings',
      min: 1,
      max: 10,
      defaultValue: 4,
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
