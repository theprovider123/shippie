/**
 * Export router — the ExportButton + tests import everything from here.
 * Single barrel so the call sites don't have to know which preset lives
 * in which file.
 */
export { receiptsToAccountantCsv, CSV_HEADER as ACCOUNTANT_CSV_HEADER } from './csv-accountant.ts';
export {
  receiptsToFreeAgentJson,
  receiptsToFreeAgentExpensesEnvelope,
  type FreeAgentExpense,
  type FreeAgentExpensesEnvelope,
} from './freeagent-expenses-api.ts';
export { receiptsToBankCsv, CSV_HEADER as FREEAGENT_BANK_CSV_HEADER } from './freeagent-bank.ts';
export { buildExportZip, type ZipExportOptions } from './zip.ts';
export {
  attachmentFilename,
  formatCentsAsDecimal,
  formatCentsAsSignedPayment,
  formatRateBp,
  freeAgentTaxStatus,
  sortNewestFirst,
} from './shared.ts';

// Re-export the existing simple CSV (back-compat — current ExportButton).
export { receiptsToCsv, CSV_HEADER as SIMPLE_CSV_HEADER, receiptToCsvRow } from '../csv.ts';

// `effectiveSupplier` lives in the store — re-export here so call sites
// only import from `./exports/`.
export { effectiveSupplier } from '../store.ts';

export type ExportFormat =
  | 'simple-csv'
  | 'accountant-csv'
  | 'freeagent-expenses-json'
  | 'freeagent-bank-csv'
  | 'zip';

export interface ExportFormatMeta {
  id: ExportFormat;
  label: string;
  ext: 'csv' | 'json' | 'zip';
  mime: string;
  description: string;
}

export const EXPORT_FORMATS: readonly ExportFormatMeta[] = [
  {
    id: 'simple-csv',
    label: 'Quick CSV',
    ext: 'csv',
    mime: 'text/csv',
    description: 'Six columns: date, vendor, total, currency, category, note.',
  },
  {
    id: 'accountant-csv',
    label: 'Accountant CSV',
    ext: 'csv',
    mime: 'text/csv',
    description: 'Wide CSV: net, tax, payment, project, client, reimbursable, and more.',
  },
  {
    id: 'freeagent-expenses-json',
    label: 'FreeAgent-ready (Expenses)',
    ext: 'json',
    mime: 'application/json',
    description: 'JSON shaped for FreeAgent\'s Expenses API. Not a one-tap import.',
  },
  {
    id: 'freeagent-bank-csv',
    label: 'FreeAgent bank import',
    ext: 'csv',
    mime: 'text/csv',
    description: 'CSV for FreeAgent\'s bank-transaction import (or generic OFX-style).',
  },
  {
    id: 'zip',
    label: 'ZIP bundle (everything)',
    ext: 'zip',
    mime: 'application/zip',
    description: 'All CSVs + JSON + image attachments in one archive.',
  },
];
