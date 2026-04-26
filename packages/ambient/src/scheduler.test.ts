import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import 'fake-indexeddb/auto';
import {
  _resetSchedulerForTest,
  registerScheduler,
} from './scheduler.ts';

type Listener = () => void | Promise<void>;

interface FakeDocument {
  visibilityState: string;
  addEventListener: (type: 'visibilitychange', l: Listener) => void;
  removeEventListener: (type: 'visibilitychange', l: Listener) => void;
  _fire: () => Promise<void>;
  _listeners: Listener[];
}

function makeFakeDocument(): FakeDocument {
  const listeners: Listener[] = [];
  return {
    visibilityState: 'visible',
    _listeners: listeners,
    addEventListener(type, l) {
      if (type === 'visibilitychange') listeners.push(l);
    },
    removeEventListener(type, l) {
      if (type !== 'visibilitychange') return;
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    async _fire() {
      // Snapshot at fire-time so removals during dispatch don't skip.
      const snap = listeners.slice();
      for (const l of snap) await l();
    },
  };
}

interface PeriodicSyncCall {
  tag: string;
  minInterval: number;
}

function withSelf(periodicSync: {
  register: (tag: string, o: { minInterval: number }) => Promise<void>;
}) {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.self;
  g.self = { registration: { periodicSync } };
  return () => {
    if (prev === undefined) delete g.self;
    else g.self = prev;
  };
}

function withDocument(doc: FakeDocument | null) {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.document;
  if (doc === null) delete g.document;
  else g.document = doc;
  return () => {
    if (prev === undefined) delete g.document;
    else g.document = prev;
  };
}

beforeEach(async () => {
  await _resetSchedulerForTest();
});

afterEach(async () => {
  // Clean up any globals tests may have leaked.
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.self;
  delete g.document;
  await _resetSchedulerForTest();
});

describe('registerScheduler — SW (periodicSync) branch', () => {
  it('calls periodicSync.register with tag + minInterval', async () => {
    const calls: PeriodicSyncCall[] = [];
    const restoreSelf = withSelf({
      register: async (tag, opts) => {
        calls.push({ tag, minInterval: opts.minInterval });
      },
    });
    const restoreDoc = withDocument(null);

    const stop = registerScheduler({
      tag: 'shippie-ambient',
      intervalMs: 24 * 3600 * 1000,
      fallback: () => {},
    });

    // periodicSync.register is fire-and-forget — yield once for the
    // microtask queue.
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.tag).toBe('shippie-ambient');
    expect(calls[0]?.minInterval).toBe(24 * 3600 * 1000);

    stop();
    restoreDoc();
    restoreSelf();
  });

  it('swallows NotAllowedError and does not throw', async () => {
    const restoreSelf = withSelf({
      register: async () => {
        const err = new Error('denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    });
    const restoreDoc = withDocument(null);

    const stop = registerScheduler({
      tag: 'shippie-ambient',
      intervalMs: 1000,
      fallback: () => {},
    });

    // Yield for the rejected promise. Should not throw.
    await Promise.resolve();
    await Promise.resolve();

    stop();
    restoreDoc();
    restoreSelf();
  });
});

describe('registerScheduler — visibilitychange fallback branch', () => {
  it('fires fallback on first visibility (no prior run recorded)', async () => {
    const doc = makeFakeDocument();
    const restoreDoc = withDocument(doc);

    let fired = 0;
    const stop = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => 1_000_000,
    });

    expect(doc._listeners).toHaveLength(1);
    await doc._fire();
    expect(fired).toBe(1);

    stop();
    restoreDoc();
  });

  it('does NOT fire when elapsed < intervalMs since last run', async () => {
    const doc = makeFakeDocument();
    const restoreDoc = withDocument(doc);

    let fired = 0;
    let clock = 1_000_000;
    const stop = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => clock,
    });

    await doc._fire();
    expect(fired).toBe(1);

    // Advance only 30s — below the 60s interval.
    clock += 30_000;
    await doc._fire();
    expect(fired).toBe(1);

    stop();
    restoreDoc();
  });

  it('fires again once elapsed > intervalMs', async () => {
    const doc = makeFakeDocument();
    const restoreDoc = withDocument(doc);

    let fired = 0;
    let clock = 1_000_000;
    const stop = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => clock,
    });

    await doc._fire();
    expect(fired).toBe(1);

    clock += 61_000;
    await doc._fire();
    expect(fired).toBe(2);

    stop();
    restoreDoc();
  });

  it('does NOT fire when document is not visible', async () => {
    const doc = makeFakeDocument();
    doc.visibilityState = 'hidden';
    const restoreDoc = withDocument(doc);

    let fired = 0;
    const stop = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => 1_000_000,
    });

    await doc._fire();
    expect(fired).toBe(0);

    stop();
    restoreDoc();
  });

  it('stop() detaches the visibilitychange listener', async () => {
    const doc = makeFakeDocument();
    const restoreDoc = withDocument(doc);

    let fired = 0;
    const stop = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => 1_000_000,
    });

    expect(doc._listeners).toHaveLength(1);
    stop();
    expect(doc._listeners).toHaveLength(0);

    await doc._fire();
    expect(fired).toBe(0);

    restoreDoc();
  });

  it('persists last-run timestamp across fresh registrations', async () => {
    const doc1 = makeFakeDocument();
    const restoreDoc1 = withDocument(doc1);

    let fired = 0;
    let clock = 1_000_000;
    const stop1 = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => clock,
    });
    await doc1._fire();
    expect(fired).toBe(1);
    stop1();
    restoreDoc1();

    // Fresh registration with a fresh document, only 30s later — should
    // NOT fire because the prior run is still persisted.
    const doc2 = makeFakeDocument();
    const restoreDoc2 = withDocument(doc2);
    clock += 30_000;
    const stop2 = registerScheduler({
      tag: 'ambient-test',
      intervalMs: 60_000,
      fallback: () => {
        fired += 1;
      },
      now: () => clock,
    });
    await doc2._fire();
    expect(fired).toBe(1);
    stop2();
    restoreDoc2();
  });
});
