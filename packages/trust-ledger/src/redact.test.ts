import { describe, expect, it } from 'bun:test';
import { assertRowIsRedacted, redactCapabilityCall, redactTelemetryEvent } from './redact.ts';
import type { LedgerRow } from './types.ts';

describe('redactCapabilityCall', () => {
  it('intent.provide → records intent + row count, no body', () => {
    const out = redactCapabilityCall('intent.provide', { intent: 'cooked-meal', rows: [{ a: 1 }, { a: 2 }, { a: 3 }] }, null);
    expect(out.summary).toBe('provide cooked-meal (3 rows)');
    expect(out.bytes_out).toBeGreaterThan(0);
  });

  it('intent.consume → records intent + result row count', () => {
    const out = redactCapabilityCall('intent.consume', { intent: 'sleep-logged' }, { rows: [{}, {}] });
    expect(out.summary).toBe('consume sleep-logged (2 rows)');
  });

  it('network.fetch → records bare hostname, never path/query', () => {
    const out = redactCapabilityCall(
      'network.fetch',
      { url: 'https://palate.app/imports/aisle-map.json?secret=XXX' },
      { status: 200, bytes: 4200 },
    );
    expect(out.summary).toBe('fetch palate.app (200)');
    expect(out.target_host).toBe('palate.app');
    expect(out.summary.includes('secret')).toBe(false);
  });

  it('ai.run → records task + source backend, no input body', () => {
    const out = redactCapabilityCall('ai.run', { task: 'classify', input: 'private content here' }, { source: 'webnn-npu', result: 'positive' });
    expect(out.summary).toBe('ai.classify (webnn-npu)');
    expect(out.summary.includes('private')).toBe(false);
  });

  it('share.send → records kind only, never recipients', () => {
    const out = redactCapabilityCall('share.send', { kind: 'recipe', recipient: 'alice@example.com' }, null);
    expect(out.summary).toBe('share recipe');
    expect(out.summary.includes('alice')).toBe(false);
  });

  it('contacts.read → records requested fields, no contact data', () => {
    const out = redactCapabilityCall('contacts.read', { fields: ['name', 'phone'], contacts: [{ name: 'Bob' }] }, null);
    expect(out.summary).toBe('contacts.read (name,phone)');
    expect(out.summary.includes('Bob')).toBe(false);
  });

  it('calendar.write → records event count only', () => {
    const out = redactCapabilityCall('calendar.write', { events: [{ title: 'Top secret meeting' }, { title: 'Other' }] }, null);
    expect(out.summary).toBe('calendar.write (2 events)');
    expect(out.summary.includes('secret')).toBe(false);
  });

  it('data.transferDrop → records kind + target slug', () => {
    const out = redactCapabilityCall(
      'data.transferDrop',
      { kind: 'recipe', target_slug: 'meal-planner', payload: 'big body' },
      null,
    );
    expect(out.summary).toBe('transferDrop recipe → meal-planner');
  });

  it('system.crossDb.query → records source slug + row count', () => {
    const out = redactCapabilityCall(
      'system.crossDb.query',
      { source_slug: 'pantry-scanner' },
      { rows: [{}, {}, {}, {}] },
    );
    expect(out.summary).toBe('crossDb 4 rows from pantry-scanner');
  });

  it('db.* / storage.getUsage → just capability + table when present', () => {
    expect(redactCapabilityCall('db.insert', { table: 'meals' }, null).summary).toBe('db.insert (meals)');
    expect(redactCapabilityCall('storage.getUsage', null, null).summary).toBe('storage.getUsage');
  });

  it('unknown capability → records capability name, no body leak', () => {
    const out = redactCapabilityCall('exotic.future-cap', { secret: 'leak me' }, null);
    expect(out.summary).toBe('exotic.future-cap');
  });

  it('clamps summaries to 120 chars with ellipsis', () => {
    const longIntent = 'a'.repeat(200);
    const out = redactCapabilityCall('intent.provide', { intent: longIntent, rows: [] }, null);
    expect(out.summary.length).toBe(120);
    expect(out.summary.endsWith('…')).toBe(true);
  });
});

describe('redactTelemetryEvent', () => {
  it('records event name + host + payload size only', () => {
    const out = redactTelemetryEvent({
      channel: 'shell-analytics',
      event_name: 'install_a2hs_accepted',
      target_host: 'shippie.app',
      payload_bytes: 312,
    });
    expect(out.summary).toBe('install_a2hs_accepted');
    expect(out.target_host).toBe('shippie.app');
    expect(out.bytes_out).toBe(312);
  });
});

describe('assertRowIsRedacted', () => {
  function row(over: Partial<LedgerRow> = {}): LedgerRow {
    return {
      id: 'x',
      ts: 1,
      app: 'recipe',
      capability: 'network.fetch',
      category: 'capability',
      summary: 'fetch palate.app',
      target_host: 'palate.app',
      outcome: 'ok',
      ...over,
    };
  }

  it('accepts a properly-redacted row', () => {
    expect(() => assertRowIsRedacted(row())).not.toThrow();
  });

  it('rejects overlong summaries', () => {
    expect(() => assertRowIsRedacted(row({ summary: 'a'.repeat(121) }))).toThrow(/120 chars/);
  });

  it('rejects target_host containing a path', () => {
    expect(() => assertRowIsRedacted(row({ target_host: 'palate.app/imports' }))).toThrow(/hostname/);
  });

  it('rejects target_host containing a query', () => {
    expect(() => assertRowIsRedacted(row({ target_host: 'palate.app?leak=1' }))).toThrow(/query/);
  });
});
