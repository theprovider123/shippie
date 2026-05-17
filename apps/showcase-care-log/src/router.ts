export type Route =
  | 'home'
  | 'meds'
  | 'symptoms'
  | 'handover'
  | 'report'
  | 'settings';

export const ROUTES: readonly Route[] = [
  'home', 'meds', 'symptoms', 'handover', 'report', 'settings',
];
