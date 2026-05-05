import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_atlas',
  slug: 'atlas',
  eyebrow: 'Atlas',
  title: 'The trip app that expects no signal.',
  subtitle: 'Pins, notes, map packs, and travel memories designed for airplane mode.',
  privacyLine: 'Trip data is useful precisely when the network is not. Atlas keeps it local first.',
  tone: 'sea',
  tags: ['offline by need', 'trip mesh', 'place memory'],
  placeholder: 'Gate changed, museum basement entrance, trailhead photo note...',
  emptyText: 'Pin a place or save a trip note for the offline travel log.',
  consumes: ['dined-out'],
  workspaceTitle: 'Offline pack',
  workspaceItems: [
    { modeId: 'pin', label: 'Pinned places', detail: 'Spots worth keeping before signal drops.' },
    { modeId: 'note', label: 'Trip notes', detail: 'Airport, trail, museum, and hotel context.' },
  ],
  handoff: {
    title: 'Trip pack',
    description: 'A compact local itinerary note for travel companions.',
    empty: 'No offline trip notes yet.',
    actionLabel: 'Copy trip pack',
  },
  modes: [
    {
      id: 'pin',
      label: 'Pin',
      verb: 'Pin place',
      detail: 'Save a place before the map or network disappears.',
      intent: 'place-pinned',
      metricLabel: 'priority',
      unit: '/5',
      min: 1,
      max: 5,
      defaultValue: 3,
    },
    {
      id: 'note',
      label: 'Note',
      verb: 'Save note',
      detail: 'Capture travel context that should work in airplane mode.',
      intent: 'trip-note',
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
