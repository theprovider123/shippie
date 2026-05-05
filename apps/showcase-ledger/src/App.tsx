import { LaunchShowcaseApp, type LaunchShowcaseConfig } from '@shippie/showcase-kit';

const config = {
  appId: 'app_ledger',
  slug: 'ledger',
  eyebrow: 'Ledger',
  title: 'Money notes without bank access.',
  subtitle: 'Tap-fast expense capture, budgets, and CSV-ready history with no Plaid story.',
  privacyLine: 'Ledger stores what the user types. It never scrapes banks or syncs a finance profile.',
  tone: 'ink',
  tags: ['privacy-essential', 'no aggregator', 'CSV export ready'],
  placeholder: 'Groceries, train ticket, pharmacy receipt...',
  emptyText: 'Log an expense or set a local budget limit.',
  consumes: ['dined-out', 'shopping-list'],
  workspaceTitle: 'Month ledger',
  workspaceItems: [
    { modeId: 'expense', label: 'Expenses', detail: 'Manual capture without bank scraping.' },
    { modeId: 'budget', label: 'Budgets', detail: 'Private limits for the wider graph.' },
  ],
  handoff: {
    title: 'CSV preview',
    description: 'A local export shape for spreadsheet handoff, built from typed entries only.',
    empty: 'No expense rows to preview yet.',
    actionLabel: 'Copy CSV preview',
    format: 'csv',
  },
  modes: [
    {
      id: 'expense',
      label: 'Expense',
      verb: 'Log expense',
      detail: 'Capture an expense locally, with no bank connection.',
      intent: 'expense-logged',
      metricLabel: 'amount',
      unit: 'GBP',
      min: 1,
      max: 250,
      defaultValue: 18,
    },
    {
      id: 'budget',
      label: 'Budget',
      verb: 'Set budget',
      detail: 'Set a private category limit for the cross-app graph.',
      intent: 'budget-limit',
      metricLabel: 'limit',
      unit: 'GBP',
      min: 25,
      max: 1000,
      step: 25,
      defaultValue: 250,
    },
  ],
} satisfies LaunchShowcaseConfig;

export function App() {
  return <LaunchShowcaseApp config={config} />;
}
