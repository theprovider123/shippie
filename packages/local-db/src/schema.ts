import type { LocalDbColumnType, LocalDbSchema } from '@shippie/local-runtime-contract';

const VALID_BASE_TYPES = new Set(['text', 'integer', 'real', 'blob', 'json', 'datetime']);

export interface NormalizedColumn {
  name: string;
  type: LocalDbColumnType;
  baseType: string;
  constraints: string;
}

export function normalizeTableName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}

export function normalizeLocalDbSchema(schema: LocalDbSchema): NormalizedColumn[] {
  const columns = Object.entries(schema).map(([name, type]) => normalizeColumn(name, type));
  if (columns.length === 0) throw new Error('Schema must contain at least one column');
  return columns;
}

function normalizeColumn(name: string, type: LocalDbColumnType): NormalizedColumn {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid column name: ${name}`);
  }
  const [base = '', ...rest] = String(type).trim().split(/\s+/);
  const lowerBase = base.toLowerCase();
  if (!VALID_BASE_TYPES.has(lowerBase)) {
    throw new Error(`Invalid column type for ${name}: ${type}`);
  }
  return {
    name,
    type,
    baseType: lowerBase,
    constraints: rest.join(' '),
  };
}
