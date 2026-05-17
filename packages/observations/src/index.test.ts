import { describe, expect, it } from 'bun:test';
import {
  createObservationClient,
  type Observation,
  type ObservationSdkLike,
} from './index.ts';

function fakeSdk() {
  const broadcasts: Array<{ intent: string; rows: ReadonlyArray<unknown> }> = [];
  const subscribers = new Map<string, Array<(b: { intent: string; rows: ReadonlyArray<unknown> }) => void>>();
  const sdk: ObservationSdkLike = {
    intent: {
      broadcast(intent, rows) {
        broadcasts.push({ intent, rows });
        for (const handler of subscribers.get(intent) ?? []) {
          handler({ intent, rows });
        }
      },
      subscribe(intent, handler) {
        const list = subscribers.get(intent) ?? [];
        list.push(handler);
        subscribers.set(intent, list);
        return () => {
          const next = (subscribers.get(intent) ?? []).filter((h) => h !== handler);
          subscribers.set(intent, next);
        };
      },
    },
  };
  return { sdk, broadcasts, subscribers };
}

describe('observations: emit', () => {
  it('broadcasts the observation under its kind as the intent name', () => {
    const { sdk, broadcasts } = fakeSdk();
    const obs = createObservationClient(sdk);
    obs.emit({
      kind: 'counter.tapped',
      label: 'coffee',
      count: 3,
      at: '2026-05-09T08:00:00.000Z',
    });
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.intent).toBe('counter.tapped');
    expect(broadcasts[0]?.rows).toHaveLength(1);
  });

  it('refuses exact geo by default', () => {
    const { sdk } = fakeSdk();
    const obs = createObservationClient(sdk);
    expect(() =>
      obs.emit({
        kind: 'place.snapped',
        labels: ['cookbook'],
        geo_exact: [51.5, -0.12],
        at: '2026-05-09T12:00:00.000Z',
      }),
    ).toThrow(/geo_exact/);
  });

  it('allows exact geo when explicitly granted', () => {
    const { sdk, broadcasts } = fakeSdk();
    const obs = createObservationClient(sdk);
    obs.emit(
      {
        kind: 'place.snapped',
        labels: ['cookbook'],
        geo_exact: [51.5, -0.12],
        at: '2026-05-09T12:00:00.000Z',
      },
      { exactGeoGranted: true },
    );
    expect(broadcasts).toHaveLength(1);
  });

  it('emits coarse geo without the explicit flag', () => {
    const { sdk, broadcasts } = fakeSdk();
    const obs = createObservationClient(sdk);
    obs.emit({
      kind: 'place.snapped',
      labels: ['cafe'],
      geo_coarse: 'city',
      at: '2026-05-09T12:00:00.000Z',
    });
    expect(broadcasts).toHaveLength(1);
  });
});

describe('observations: subscribe', () => {
  it('delivers matching-kind rows to the handler', () => {
    const { sdk } = fakeSdk();
    const obs = createObservationClient(sdk);
    const seen: ReadonlyArray<unknown>[] = [];
    obs.subscribe('mood.color_picked', (rows) => {
      seen.push(rows);
    });
    obs.emit({
      kind: 'mood.color_picked',
      color: '#F4B860',
      sentiment: 1,
      at: '2026-05-09T09:00:00.000Z',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
  });

  it('filters out rows whose kind does not match (defends against misbehaving providers)', () => {
    const { sdk } = fakeSdk();
    const obs = createObservationClient(sdk);
    let calls = 0;
    const handler = () => {
      calls++;
    };
    obs.subscribe('mood.color_picked', handler);
    // Caller broadcasts the wrong kind under the right intent name.
    sdk.intent.broadcast('mood.color_picked', [
      { kind: 'counter.tapped', label: 'fake', count: 1, at: '2026-05-09T09:00:00.000Z' },
    ]);
    expect(calls).toBe(0);
  });

  it('returns an unsubscribe that detaches the handler', () => {
    const { sdk } = fakeSdk();
    const obs = createObservationClient(sdk);
    let calls = 0;
    const handler = () => {
      calls++;
    };
    const unsub = obs.subscribe('counter.tapped', handler);
    unsub();
    obs.emit({
      kind: 'counter.tapped',
      label: 'coffee',
      count: 1,
      at: '2026-05-09T08:00:00.000Z',
    });
    expect(calls).toBe(0);
  });
});

describe('observations: vocabulary', () => {
  it('all eight kinds are typeable', () => {
    // Pure compile-time check; if these don't exhaust, TS errors here.
    const samples: Observation[] = [
      { kind: 'mood.color_picked', color: '#fff', sentiment: 0, at: 't' },
      { kind: 'photo.labelled', labels: ['a'], at: 't' },
      { kind: 'counter.tapped', label: 'x', count: 1, at: 't' },
      { kind: 'recipe.cooked', title: 'r', at: 't' },
      { kind: 'game.completed', game: 'g', result: 1, at: 't' },
      { kind: 'preference.choice', question_id: 'q', choice: 'a', at: 't' },
      { kind: 'voice.recorded', duration_seconds: 30, at: 't' },
      { kind: 'place.snapped', labels: ['l'], at: 't' },
    ];
    expect(samples).toHaveLength(8);
  });
});
