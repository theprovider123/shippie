import type { MicroLoggerConfig } from '@shippie/micro-logger';

export const config: MicroLoggerConfig = {
  appId: 'app_mood_pulse',
  slug: 'mood-pulse',
  name: 'Mood Pulse',
  description: 'Three-second mood tap. Correlates against caffeine, workouts, and sleep.',
  themeColor: '#B45CB6',
  intent: 'mood-logged',
  consumes: ['caffeine-logged', 'workout-completed', 'sleep-logged'],
  buttonLabel: 'Tap a pulse',
  chart: 'sparkline',
  rowSchema: {
    score: 'number',
  },
  defaults: { score: 5 },
};

export default config;
