import type { MicroLoggerConfig } from '@shippie/micro-logger';

export const config: MicroLoggerConfig = {
  appId: 'app_hydration',
  slug: 'hydration',
  name: 'Hydration',
  description: 'Daily water target. Cooked-meal subscription nudges +1 glass.',
  themeColor: '#4E7C9A',
  intent: 'hydration-logged',
  consumes: ['cooked-meal'],
  buttonLabel: 'Log a glass',
  chart: 'count',
  countTarget: 8,
  rowSchema: {
    ml: 'number',
  },
  defaults: { ml: 250 },
};

export default config;
