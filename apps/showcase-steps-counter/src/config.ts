import type { MicroLoggerConfig } from '@shippie/micro-logger';

export const config: MicroLoggerConfig = {
  appId: 'app_steps_counter',
  slug: 'steps-counter',
  name: 'Steps Counter',
  description: 'DeviceMotion-driven step count. Workout-completed subscribes so we don\'t double-count gym sessions.',
  themeColor: '#5EA777',
  intent: 'walked',
  consumes: ['workout-completed'],
  buttonLabel: 'Add steps',
  chart: 'sparkline',
  rowSchema: {
    steps: 'number',
  },
  defaults: { steps: 1000 },
};

export default config;
