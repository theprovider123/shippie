import type { MicroLoggerConfig } from '@shippie/micro-logger';

export const config: MicroLoggerConfig = {
  appId: 'app_caffeine_log',
  slug: 'caffeine-log',
  name: 'Caffeine Log',
  description: 'Single tap to log a coffee, tea, or energy drink.',
  themeColor: '#8B5A3C',
  intent: 'caffeine-logged',
  buttonLabel: 'Log a coffee',
  chart: 'sparkline',
  rowSchema: {
    drink: 'string',
    mg: 'number',
  },
  defaults: { drink: 'espresso', mg: 64 },
};

export default config;
