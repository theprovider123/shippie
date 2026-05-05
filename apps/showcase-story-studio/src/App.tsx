import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_story_studio',
  slug: 'story-studio',
  eyebrow: 'Story Studio',
  title: 'Stories for family, not feeds.',
  subtitle: 'Kids make little books and share them to grandparents over a paired family mesh.',
  privacyLine: 'Family stories stay in the family graph. No algorithmic feed, no public profile.',
  tone: 'paper',
  tags: ['mesh family', 'kids creativity', 'grandparent sharing'],
  placeholder: 'A dragon found the bus ticket under the moon...',
  emptyText: 'Draft a page, record a dictated line, or share a finished story.',
  workspaceTitle: 'Story table',
  workspaceItems: [
    { modeId: 'page', label: 'Draft pages', detail: 'Small pieces the child is still shaping.' },
    { modeId: 'story', label: 'Shared books', detail: 'Finished stories ready for family devices.' },
  ],
  handoff: {
    title: 'Family shelf',
    description: 'The local family shelf shows what can be sent to paired grandparents.',
    empty: 'No story pages yet.',
    actionLabel: 'Copy story shelf',
  },
  modes: [
    {
      id: 'page',
      label: 'Page',
      verb: 'Save page',
      detail: 'Capture one illustrated page or dictated line.',
      intent: 'story-draft',
      metricLabel: 'pages',
      unit: 'page',
      min: 1,
      max: 12,
      defaultValue: 1,
    },
    {
      id: 'story',
      label: 'Story',
      verb: 'Share story',
      detail: 'Mark a story ready for the paired family devices.',
      intent: 'story-shared',
      metricLabel: 'pages',
      unit: 'pages',
      min: 1,
      max: 24,
      defaultValue: 6,
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
