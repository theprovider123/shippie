import { describe, expect, test } from 'vitest';
import {
  createEventEmitter,
  serializeEventsNdjson,
  deployEventsKey,
  type DeployEvent,
} from './deploy-events';

describe('createEventEmitter', () => {
  test('events get ISO timestamp and elapsedMs', () => {
    const start = Date.now();
    const em = createEventEmitter(start);
    em.emit({ type: 'deploy_received', slug: 'x', version: 1, bytes: 100, files: 3 });
    const all = em.events();
    expect(all.length).toBe(1);
    expect(all[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(all[0].elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test('preserves event order', () => {
    const em = createEventEmitter(Date.now());
    em.emit({ type: 'deploy_received', slug: 'x', version: 1, bytes: 1, files: 1 });
    em.emit({
      type: 'security_scan_started',
      filesToScan: 5,
    });
    em.emit({
      type: 'security_scan_finished',
      blocks: 0,
      warns: 0,
      infos: 0,
    });
    expect(em.events().map((e) => e.type)).toEqual([
      'deploy_received',
      'security_scan_started',
      'security_scan_finished',
    ]);
  });
});

describe('serializeEventsNdjson', () => {
  test('one event per line, trailing newline', () => {
    const events: DeployEvent[] = [
      {
        type: 'deploy_received',
        slug: 'x',
        version: 1,
        bytes: 1,
        files: 1,
        ts: '2026-04-27T00:00:00Z',
        elapsedMs: 0,
      },
      {
        type: 'deploy_live',
        liveUrl: 'https://x.shippie.app/',
        durationMs: 12000,
        ts: '2026-04-27T00:00:12Z',
        elapsedMs: 12000,
      },
    ];
    const out = serializeEventsNdjson(events);
    const lines = out.split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed.type).toBe('string');
    }
  });

  test('round-trips cleanly', () => {
    const events: DeployEvent[] = [
      {
        type: 'kind_classified',
        detected: 'local',
        publicKind: 'local',
        publicStatus: 'estimated',
        confidence: 0.8,
        reasons: ['no external fetch', 'shippie sdk present'],
        ts: '2026-04-27T00:00:00Z',
        elapsedMs: 100,
      },
    ];
    const ndjson = serializeEventsNdjson(events);
    const replayed = ndjson
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l)) as DeployEvent[];
    expect(replayed).toEqual(events);
  });
});

describe('deployEventsKey', () => {
  test('formats consistently under the _shippie reserved prefix', () => {
    expect(deployEventsKey('palate', 7)).toBe('apps/palate/v7/_shippie/events.ndjson');
  });
});
