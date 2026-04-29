import type { MicroLoggerConfig } from '@shippie/micro-logger';

export const config: MicroLoggerConfig = {
  appId: 'app_symptom_tracker',
  slug: 'symptom-tracker',
  name: 'Symptom Tracker',
  description: 'Aches, allergies, headaches with severity. Heatmap surfaces patterns over weeks.',
  themeColor: '#C97A4B',
  intent: 'symptom-logged',
  buttonLabel: 'Log a symptom',
  chart: 'heatmap',
  heatmapWindowDays: 56,
  rowSchema: {
    symptom: 'string',
    severity: 'number',
  },
  defaults: { symptom: 'headache', severity: 3 },
};

export default config;
