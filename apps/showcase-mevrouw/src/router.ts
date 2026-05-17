/**
 * Simple state-based router. Bottom tab nav drives the current
 * route. Sub-routes (e.g. compose, gift detail) are local to each
 * page via their own state machine.
 */
export type Route =
  | 'home'
  | 'schedule'
  | 'journal'
  | 'surprises'
  | 'more'
  | 'gifts'
  | 'todos'
  | 'memories'
  | 'glimpses'
  | 'games'
  | 'after-hours'
  | 'settings';

// Bottom-nav rulebook: 4 primary tabs. Memories promoted from the
// More sheet (couples-memory hub is the emotional heart). Journal +
// Surprises demoted into More — important but not daily-IA.
export const TOP_LEVEL_ROUTES: ReadonlyArray<Route> = [
  'home',
  'schedule',
  'memories',
  'more',
];
