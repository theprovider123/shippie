import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TELEMETRY_CHANNELS,
  getChannel,
  mirrorTelemetryToLedgerRow,
} from './egress-registry';
import { assertRowIsRedacted } from '@shippie/trust-ledger';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('TELEMETRY_CHANNELS', () => {
  it('covers every in-tree Shippie-egress source', () => {
    const expected = [
      'cloud-proof',
      'wrapper-analytics',
      'shell-analytics',
      'beacon',
      'install-attribution',
      'handoff',
    ];
    expect(TELEMETRY_CHANNELS.map((c) => c.channel).sort()).toEqual(expected.sort());
  });

  it('names a unique writer_module per channel', () => {
    const writers = TELEMETRY_CHANNELS.map((c) => c.writer_module);
    expect(new Set(writers).size).toBe(writers.length);
  });

  it('points each writer_module at a real file path under apps/ or packages/', () => {
    for (const c of TELEMETRY_CHANNELS) {
      expect(c.writer_module).toMatch(/^(apps|packages)\//);
    }
  });

  it('uses a stable endpoint format (absolute URL or path)', () => {
    for (const c of TELEMETRY_CHANNELS) {
      expect(c.endpoint.startsWith('/') || c.endpoint.startsWith('http')).toBe(true);
    }
  });
});

describe('getChannel', () => {
  it('returns the registered channel', () => {
    expect(getChannel('cloud-proof').endpoint).toContain('/api/v1/proof');
  });

  it('throws on unknown channel id', () => {
    expect(() => getChannel('unknown' as never)).toThrow(/unknown channel/);
  });
});

describe('mirrorTelemetryToLedgerRow', () => {
  it('produces a ledger row that passes redaction guards', () => {
    const row = mirrorTelemetryToLedgerRow({
      channel: 'shell-analytics',
      event_name: 'install_a2hs_accepted',
      payload_bytes: 256,
    });
    expect(() => assertRowIsRedacted(row)).not.toThrow();
    expect(row.category).toBe('telemetry-egress');
    expect(row.source).toBe('shell-analytics');
    expect(row.summary).toBe('install_a2hs_accepted');
    expect(row.bytes_out).toBe(256);
    expect(row.target_host).toBeDefined();
  });

  it('preserves caller-supplied target_host when provided', () => {
    const row = mirrorTelemetryToLedgerRow({
      channel: 'cloud-proof',
      event_name: 'proof.emit',
      payload_bytes: 100,
      target_host: 'shippie.app',
    });
    expect(row.target_host).toBe('shippie.app');
  });

  it('uses __shippie_shell__ when no app slug is given', () => {
    const row = mirrorTelemetryToLedgerRow({
      channel: 'shell-analytics',
      event_name: 'viewport_mode',
      payload_bytes: 32,
    });
    expect(row.app).toBe('__shippie_shell__');
  });

  it('scopes the row to the calling app when one is given', () => {
    const row = mirrorTelemetryToLedgerRow({
      channel: 'wrapper-analytics',
      event_name: 'feature.viewed',
      app: 'recipe',
      payload_bytes: 64,
    });
    expect(row.app).toBe('recipe');
  });

  it('produces a unique id per call', () => {
    const a = mirrorTelemetryToLedgerRow({
      channel: 'beacon',
      event_name: 'event_a',
      payload_bytes: 10,
    });
    const b = mirrorTelemetryToLedgerRow({
      channel: 'beacon',
      event_name: 'event_a',
      payload_bytes: 10,
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe('telemetry ledger-first invariant', () => {
  it('does not allow idb-unavailable to bypass the mirror gate', () => {
    const source = readFileSync(resolve(HERE, 'egress-registry.ts'), 'utf8');
    expect(source).not.toContain("reason !== 'idb-unavailable'");
    expect(source).not.toContain("reason === 'idb-unavailable'");
  });

  it('does not use sendBeacon because unload paths cannot await ledger commits', () => {
    const source = readFileSync(resolve(HERE, '..', 'util', 'track.ts'), 'utf8');
    expect(source).not.toContain('navigator.sendBeacon');
    expect(source).not.toContain('sendBeacon?.(');
  });
});
