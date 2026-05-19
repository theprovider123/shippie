import type { IntentMatcher } from '@shippie/showcase-kit-v2';

/**
 * Cross-app intent matchers for Match Room.
 *
 * Currently surfaces `fantasy-team.saved` from World Cup Fantasy as a
 * cheer toast — "Sarah's locked in! 🔒" — using the broadcast manager
 * name when available, falling back to "Your mate" if absent.
 *
 * Mounted via `<IntentToastHost matchers={MATCH_ROOM_INTENT_MATCHERS} ... />`.
 */
export const MATCH_ROOM_INTENT_MATCHERS: IntentMatcher[] = [
  {
    kind: 'fantasy-team.saved',
    throttleMs: 15_000,
    toast: (intent) => {
      const payload = intent.payload ?? {};
      const candidate =
        typeof payload.manager === 'string'
          ? payload.manager
          : typeof payload.managerName === 'string'
            ? payload.managerName
            : typeof payload.manager_name === 'string'
              ? (payload as { manager_name: string }).manager_name
              : null;
      const manager = candidate && candidate.trim().length > 0 ? candidate.trim() : 'Your mate';
      return {
        title: `${manager}'s locked in! 🔒`,
        body: 'World Cup Fantasy squad saved.',
        icon: '⚽',
      };
    },
  },
];
