/**
 * Group chat preset signals — six one-tap phrases that cover the parade-day
 * traffic. Keep this list short: every addition costs cognitive surface on
 * the Group Hub. Optional short text (≤ 80 chars) lands in v1.1 behind a
 * `text` toggle in the chat input row.
 */

export type ChatPreset =
  | 'on_my_way'
  | 'at_meeting_point'
  | 'see_bus'
  | 'lost_signal'
  | 'hold_tight'
  | 'im_okay';

export const CHAT_PRESETS: readonly ChatPreset[] = [
  'on_my_way',
  'at_meeting_point',
  'see_bus',
  'lost_signal',
  'hold_tight',
  'im_okay',
] as const;

export const CHAT_PRESET_LABEL: Record<ChatPreset, string> = {
  on_my_way: 'on my way',
  at_meeting_point: 'at meeting point',
  see_bus: 'see the bus',
  lost_signal: 'lost signal',
  hold_tight: 'hold tight',
  im_okay: "I'm okay",
};
