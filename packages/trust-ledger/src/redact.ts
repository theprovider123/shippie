/**
 * Capability redactor — turns (capability, payload, result) into the
 * safe summary fields that go on a ledger row. The raw payload never
 * propagates further than this function.
 *
 * Adding a new capability to the bridge requires extending this map.
 */

import type { LedgerRow, TelemetrySource } from './types.ts';

export interface RedactedFields {
  summary: string;
  target_host?: string;
  bytes_in?: number;
  bytes_out?: number;
}

const SUMMARY_MAX_CHARS = 120;

function clamp(input: string, max: number = SUMMARY_MAX_CHARS): string {
  if (input.length <= max) return input;
  return input.slice(0, max - 1) + '…';
}

function safeJsonLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
  } catch {
    return 0;
  }
}

function pick<T = unknown>(obj: unknown, key: string): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  return (obj as Record<string, unknown>)[key] as T | undefined;
}

function pickString(obj: unknown, key: string): string | undefined {
  const v = pick(obj, key);
  return typeof v === 'string' ? v : undefined;
}

function pickArrayLength(obj: unknown, key: string): number {
  const v = pick(obj, key);
  return Array.isArray(v) ? v.length : 0;
}

function pickHostname(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length === 0) return undefined;
  try {
    if (/^https?:\/\//i.test(input)) {
      return new URL(input).hostname;
    }
    if (input.includes('/')) {
      return undefined;
    }
    return input;
  } catch {
    return undefined;
  }
}

/**
 * Redact a bridge capability call into safe summary fields.
 *
 * The redactor never reads payload values that could carry user
 * content. It looks only at structural fields (`intent`, `task`,
 * `domain`, etc.) and aggregates lengths.
 */
export function redactCapabilityCall(
  capability: string,
  payload: unknown,
  result: unknown,
): RedactedFields {
  switch (capability) {
    case 'intent.provide': {
      const intent = pickString(payload, 'intent') ?? 'unknown';
      const rows = pickArrayLength(payload, 'rows');
      return {
        summary: clamp(`provide ${intent} (${rows} rows)`),
        bytes_out: safeJsonLength(payload),
      };
    }
    case 'intent.consume': {
      const intent = pickString(payload, 'intent') ?? 'unknown';
      const resultRows = pickArrayLength(result, 'rows');
      return {
        summary: clamp(`consume ${intent} (${resultRows} rows)`),
        bytes_in: safeJsonLength(result),
      };
    }
    case 'network.fetch': {
      const url = pickString(payload, 'url') ?? pickString(payload, 'domain');
      const host = pickHostname(url);
      const status = pick<number>(result, 'status');
      return {
        summary: clamp(`fetch ${host ?? 'unknown'}${status ? ` (${status})` : ''}`),
        target_host: host,
        bytes_in: pick<number>(result, 'bytes') ?? safeJsonLength(result),
        bytes_out: pick<number>(payload, 'body_bytes') ?? safeJsonLength(payload),
      };
    }
    case 'ai.run': {
      const task = pickString(payload, 'task') ?? 'task';
      const source = pickString(result, 'source') ?? 'local';
      return {
        summary: clamp(`ai.${task} (${source})`),
        bytes_in: safeJsonLength(result),
        bytes_out: safeJsonLength(payload),
      };
    }
    case 'share.send': {
      const kind = pickString(payload, 'kind') ?? 'unknown';
      return {
        summary: clamp(`share ${kind}`),
        bytes_out: safeJsonLength(payload),
      };
    }
    case 'contacts.read': {
      const fields = pick<unknown[]>(payload, 'fields');
      const fieldList = Array.isArray(fields)
        ? fields.filter((f): f is string => typeof f === 'string').join(',')
        : '';
      return {
        summary: clamp(`contacts.read${fieldList ? ` (${fieldList})` : ''}`),
      };
    }
    case 'calendar.write': {
      const events = pickArrayLength(payload, 'events');
      return {
        summary: clamp(`calendar.write (${events} event${events === 1 ? '' : 's'})`),
        bytes_out: safeJsonLength(payload),
      };
    }
    case 'data.transferDrop': {
      const kind = pickString(payload, 'kind') ?? 'unknown';
      const target = pickString(payload, 'target_slug') ?? pickString(result, 'target_slug') ?? '?';
      return {
        summary: clamp(`transferDrop ${kind} → ${target}`),
        bytes_out: safeJsonLength(payload),
      };
    }
    case 'system.crossDb.query': {
      const source = pickString(payload, 'source_slug') ?? '?';
      const rows = pickArrayLength(result, 'rows');
      return {
        summary: clamp(`crossDb ${rows} rows from ${source}`),
        bytes_in: safeJsonLength(result),
      };
    }
    case 'db.insert':
    case 'db.query':
    case 'db.update':
    case 'db.delete':
    case 'db.create':
    case 'storage.getUsage': {
      const table = pickString(payload, 'table');
      return {
        summary: clamp(`${capability}${table ? ` (${table})` : ''}`),
      };
    }
    case 'feedback.open':
    case 'data.openPanel':
    case 'apps.list':
    case 'agent.insights':
    case 'feel.texture': {
      return { summary: clamp(capability) };
    }
    default:
      // Unknown capability — record the name only. This is honest:
      // adding a new capability without extending the redactor still
      // produces a row but without summary detail. The lint test in
      // §8.3 will surface unregistered capabilities.
      return { summary: clamp(capability) };
  }
}

export interface TelemetryRedactionInput {
  channel: TelemetrySource;
  event_name: string;
  target_host: string;
  payload_bytes: number;
}

/**
 * Redact a telemetry-egress event for the mirror invariant. Only the
 * event name + endpoint host + payload size cross into a ledger row.
 */
export function redactTelemetryEvent(input: TelemetryRedactionInput): RedactedFields {
  return {
    summary: clamp(input.event_name),
    target_host: input.target_host,
    bytes_out: input.payload_bytes,
  };
}

/**
 * Validate that a ledger row contains no obvious payload smuggling.
 * Used as the last guard before commit and in tests.
 */
export function assertRowIsRedacted(row: LedgerRow): void {
  if (row.summary.length > SUMMARY_MAX_CHARS) {
    throw new Error(`trust-ledger: summary exceeds ${SUMMARY_MAX_CHARS} chars`);
  }
  if (row.target_host && row.target_host.includes('/')) {
    throw new Error('trust-ledger: target_host must be a bare hostname, not a path');
  }
  if (row.target_host && row.target_host.includes('?')) {
    throw new Error('trust-ledger: target_host must not contain query string');
  }
}
