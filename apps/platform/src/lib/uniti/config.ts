/**
 * Client-safe Uniti UI constants — the 6 feedback states, group badge config,
 * avatar palette and the lucide-style icon path set. Ported verbatim from the
 * prototype (`docs/uniti-design-reference/uniti-ui.jsx` + `uniti-data.js`) so
 * the Svelte primitives render pixel-identical to the design lock.
 */

export interface FeedbackCfg {
  label: string;
  color: string;
  bg: string;
  emoji: string;
}

export const FEEDBACK_CONFIG: Record<string, FeedbackCfg> = {
  got_it: { label: 'Got it', color: '#2EAD73', bg: '#E8F6EF', emoji: '✓' },
  nearly_there: { label: 'Nearly there', color: '#E8953A', bg: '#FEF0DC', emoji: '◑' },
  needs_revisit: { label: 'Needs revisit', color: '#D95A57', bg: '#FDECEB', emoji: '↩' },
  absent: { label: 'Absent', color: '#8B93A1', bg: '#F1F3F6', emoji: '–' },
  support_worked: { label: 'Support worked', color: '#3A8FCC', bg: '#E3F2FB', emoji: '+' },
  support_not_worked: { label: "Didn't work", color: '#8B6BD6', bg: '#F0ECFD', emoji: '!' },
};

/** Order shown in the one-tap feedback grid. */
export const FEEDBACK_ORDER = [
  'got_it',
  'nearly_there',
  'needs_revisit',
  'absent',
  'support_worked',
  'support_not_worked',
] as const;

export const GROUP_CFG: Record<string, { bg: string; color: string }> = {
  SEND: { bg: '#FEE2E2', color: '#B91C1C' },
  EAL: { bg: '#DBEAFE', color: '#1D4ED8' },
  FSM: { bg: '#FEF9C3', color: '#854D0E' },
};

export const AVATAR_COLORS = [
  '#2EAD73',
  '#3A8FCC',
  '#E8953A',
  '#8B6BD6',
  '#D95A57',
  '#0891B2',
  '#CA8A04',
  '#16A34A',
];

export function avatarColor(initials: string): string {
  const code = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

/** lucide-style 24px stroke-2 icon paths (subset used by the teacher app). */
export const ICONS: Record<string, string[]> = {
  home: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  lessons: ['M4 19.5A2.5 2.5 0 016.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z'],
  pupils: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8'],
  progress: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  leadership: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  admin: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  check: ['M20 6L9 17l-5-5'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  chevron_r: ['M9 18l6-6-6-6'],
  chevron_l: ['M15 18l-6-6 6-6'],
  chevron_d: ['M6 9l6 6 6-6'],
  mic: ['M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z', 'M19 10v2a7 7 0 01-14 0v-2', 'M12 19v4', 'M8 23h8'],
  sparkle: ['M12 3l2.2 5.6L20 12l-5.8 3.4L12 21l-2.2-5.6L4 12l5.8-3.4z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  edit: ['M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7', 'M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z'],
  cloud: ['M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z'],
  bell: ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
  sync_icon: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0114.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0020.49 15'],
  clock: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 6v6l4 2'],
  zap: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
};

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline';
