/**
 * Worst-case launcher fixtures for /dev/launcher-lab.
 *
 * These are pure data, no DB access. The lab page renders the current
 * card and (after PR-B) the v2 card against this set so visual
 * regressions show up before the home page sees them.
 */

import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';
import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';

type LauncherLabApp = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  type: string;
  category: string;
  iconUrl: string | null;
  themeColor: string;
  upvoteCount?: number;
  installCount?: number;
  badges?: PublicCapabilityBadge[];
  kind?: AppKind | null;
  kindStatus?: PublicKindStatus | null;
  firstPartySigned?: boolean;
};

type LabFixture = {
  id: string;
  label: string;
  notes: string;
  app: LauncherLabApp;
  pinned: boolean;
  recentLabel: string;
};

const NOW_LIKE = '2026-05-18T12:00:00Z';

export const LAB_FIXTURES: readonly LabFixture[] = [
  {
    id: 'baseline',
    label: 'Baseline — short title, short blurb',
    notes: 'The happy path. If this looks bad, nothing else will look good.',
    app: {
      slug: 'lift',
      name: 'Lift',
      tagline: 'A private strength tracker for the minute between sets.',
      description: 'A private strength tracker for the minute between sets.',
      type: 'app',
      category: 'health-fitness',
      iconUrl: null,
      themeColor: '#E8603C',
      kind: 'local',
      kindStatus: 'confirmed',
      firstPartySigned: true,
    },
    pinned: true,
    recentLabel: 'Opened 1 day ago',
  },
  {
    id: 'long-title',
    label: 'Long title — 32 chars exactly',
    notes: 'Hard cap from titleCap. Must wrap to 2 lines, never truncate.',
    app: {
      slug: 'strawberry-lemon',
      name: 'Strawberry Lemon Marmalade Make',
      tagline: 'Five-jar batches with the timer baked in.',
      description: 'Five-jar batches with the timer baked in.',
      type: 'app',
      category: 'food-drink',
      iconUrl: null,
      themeColor: '#4FA487',
      kind: 'local',
      kindStatus: 'confirmed',
      firstPartySigned: true,
    },
    pinned: false,
    recentLabel: 'Opened today',
  },
  {
    id: 'overflow-title',
    label: 'Overflow title — beyond cap',
    notes: 'Catastrophic input. titleCap should ellipsise at TITLE_MAX.',
    app: {
      slug: 'too-long',
      name: 'A Tool With An Absurdly Long Name That No Maker Should Ever Ship',
      tagline: null,
      description: null,
      type: 'app',
      category: 'tools',
      iconUrl: null,
      themeColor: '#7A9A6E',
      kind: 'connected',
      kindStatus: 'estimated',
      firstPartySigned: false,
    },
    pinned: false,
    recentLabel: '',
  },
  {
    id: 'long-blurb',
    label: 'Long blurb — clipped by mask-fade',
    notes: 'Description over BLURB_MAX. Card should clip cleanly with no "..." text.',
    app: {
      slug: 'crewtrip',
      name: 'Crewtrip',
      tagline:
        'Friends-trip command center — share itinerary, split expenses, swap photo rolls, and keep the group chat off the family phone bills with a single shared room nobody needs to install.',
      description:
        'Friends-trip command center — share itinerary, split expenses, swap photo rolls, and keep the group chat off the family phone bills with a single shared room nobody needs to install.',
      type: 'app',
      category: 'lifestyle',
      iconUrl: null,
      themeColor: '#E8603C',
      kind: 'connected',
      kindStatus: 'confirmed',
      firstPartySigned: true,
    },
    pinned: true,
    recentLabel: 'Opened 6 days ago',
  },
  {
    id: 'unsaved-unverified',
    label: 'Unsaved, unverified kind',
    notes: 'No corner dots (not signed, not offline). Kind pill omitted; eyebrow shows category only.',
    app: {
      slug: 'mystery-app',
      name: 'Mystery App',
      tagline: 'A third-party tool that has not yet earned proof on real devices.',
      description: 'A third-party tool that has not yet earned proof on real devices.',
      type: 'app',
      category: 'creativity',
      iconUrl: null,
      themeColor: '#5E7B5C',
      kind: null,
      kindStatus: null,
      firstPartySigned: false,
    },
    pinned: false,
    recentLabel: '',
  },
  {
    id: 'cloud-kind',
    label: 'Cloud kind — neutral pill',
    notes: 'Cloud is described, not penalised. Pill reads "cloud" in neutral colour.',
    app: {
      slug: 'cloud-thing',
      name: 'Cloud Thing',
      tagline: 'A connected service that needs the network to work — and says so.',
      description: 'A connected service that needs the network to work — and says so.',
      type: 'app',
      category: 'productivity',
      iconUrl: null,
      themeColor: '#3A4D35',
      kind: 'cloud',
      kindStatus: 'confirmed',
      firstPartySigned: true,
    },
    pinned: false,
    recentLabel: 'Opened 3 days ago',
  },
  {
    id: 'real-icon',
    label: 'Real uploaded icon',
    notes: 'iconUrl present — IconOrMonogram switches to <img>.',
    app: {
      slug: 'recipe',
      name: 'Recipe Saver',
      tagline: 'Bookmark recipes by URL, cook offline, share to your house room.',
      description: 'Bookmark recipes by URL, cook offline, share to your house room.',
      type: 'app',
      category: 'food-drink',
      iconUrl: '/__shippie-pwa/icon.svg',
      themeColor: '#E8603C',
      kind: 'local',
      kindStatus: 'confirmed',
      firstPartySigned: true,
    },
    pinned: true,
    recentLabel: 'Opened today',
  },
  {
    id: 'tiny-blurb',
    label: 'Short blurb — below BLURB_MIN',
    notes: 'Under-length description. Card should not feel empty even if maker copy is sparse.',
    app: {
      slug: 'snake',
      name: 'Snake',
      tagline: 'Classic Snake. Eat apples. Grow.',
      description: 'Classic Snake. Eat apples. Grow.',
      type: 'app',
      category: 'games',
      iconUrl: null,
      themeColor: '#4FA487',
      kind: 'local',
      kindStatus: 'confirmed',
      firstPartySigned: true,
    },
    pinned: false,
    recentLabel: 'Opened today',
  },
];

export type { LabFixture, LauncherLabApp };
export { NOW_LIKE };
