#!/usr/bin/env bun

import {
  createMemoryDocumentStore,
  createSealedSyncClient,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  pullEncryptedAttachmentChunked,
  pushEncryptedAttachmentChunked,
} from '@shippie/doc';

const enc = new TextEncoder();

const opts = parseArgs(process.argv.slice(2));
const failures = [];
const timings = [];

function mark(name, started) {
  timings.push({ name, ms: performance.now() - started });
}

async function step(name, fn) {
  const started = performance.now();
  try {
    await fn();
    mark(name, started);
    console.log(`PASS ${name}`);
  } catch (err) {
    mark(name, started);
    failures.push({ name, error: err instanceof Error ? err.message : String(err) });
    console.error(`FAIL ${name}: ${failures.at(-1).error}`);
  }
}

async function main() {
  console.log(`Torturing Shippie sealed cloud at ${opts.origin}`);
  const sync = createSealedSyncClient({ origin: opts.origin });
  const runId = `torture_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const documentId = `${runId}_doc`;
  const documentKey = generateDocumentKey();
  const signingA = await generateDeviceSigningKeyPair();
  const signingB = await generateDeviceSigningKeyPair();

  const reducer = (state, event) => {
    if (event.kind !== 'note') return state;
    return { notes: [...state.notes, event.payload] };
  };

  const deviceA = await openDocument({
    documentId,
    documentKey,
    signing: signingA,
    store: createMemoryDocumentStore(),
    sync,
    initialState: { notes: [] },
    reducer,
  });
  const deviceB = await openDocument({
    documentId,
    documentKey,
    signing: signingB,
    store: createMemoryDocumentStore(),
    sync,
    initialState: { notes: [] },
    reducer,
  });

  await step('local write renders before cloud', async () => {
    await deviceA.append({ kind: 'note', payload: { text: 'first', at: new Date().toISOString() } });
    assert(deviceA.state().notes.length === 1, 'local reducer did not update immediately');
    assert(deviceA.pendingEventIds().length === 1, 'outbox was not marked pending');
  });

  await step('sealed cloud push and second-device pull', async () => {
    await deviceA.sync();
    assert(deviceA.pendingEventIds().length === 0, 'pending event was not cleared after push');
    await deviceB.sync();
    assert(deviceB.state().notes.length === 1, 'second device did not pull first note');
  });

  await step('change hint says fresh when cursor is current', async () => {
    const hint = await sync.getChangeHint?.(documentId, {
      eventCursor: deviceB.cursor(),
      snapshotCursor: deviceB.snapshotCursor(),
      eventCount: deviceB.envelopes().length,
      snapshotCount: deviceB.snapshots().length,
    });
    assert(hint?.changed === false, 'hint should be unchanged for the current cursor');
  });

  await step('change hint wakes stale device before pull', async () => {
    await deviceA.append({ kind: 'note', payload: { text: 'second', at: new Date().toISOString() } });
    await deviceA.sync();
    const hint = await sync.getChangeHint?.(documentId, {
      eventCursor: deviceB.cursor(),
      snapshotCursor: deviceB.snapshotCursor(),
      eventCount: deviceB.envelopes().length,
      snapshotCount: deviceB.snapshots().length,
    });
    assert(hint?.changed === true, 'hint should change after another device writes');
    await deviceB.sync();
    assert(deviceB.state().notes.length === 2, 'stale device did not converge after hint');
  });

  await step('sealed change stream wakes stale device without full polling', async () => {
    const stream = waitForChangeStream(opts.origin, documentId, {
      eventCount: deviceB.envelopes().length,
      snapshotCount: deviceB.snapshots().length,
    });
    await sleep(100);
    await deviceA.append({ kind: 'note', payload: { text: 'third', at: new Date().toISOString() } });
    await deviceA.sync();
    const event = await stream;
    assert(event.includes('event: change'), 'change stream did not emit change');
    await deviceB.sync();
    assert(deviceB.state().notes.length === 3, 'stream-woken device did not converge');
  });

  await step('snapshot-first restore', async () => {
    await deviceA.createSnapshot();
    await deviceA.sync();
    const restored = await openDocument({
      documentId,
      documentKey,
      signing: await generateDeviceSigningKeyPair(),
      store: createMemoryDocumentStore(),
      sync,
      initialState: { notes: [] },
      reducer,
    });
    await restored.sync();
    assert(restored.state().notes.length === 3, 'fresh restore did not rebuild from sealed copy');
  });

  await step('offline outbox survives failed cloud push', async () => {
    const failing = createSealedSyncClient({
      origin: opts.origin,
      fetchImpl: async () => new Response('simulated offline', { status: 503 }),
    });
    const offline = await openDocument({
      documentId: `${runId}_offline`,
      documentKey,
      signing: await generateDeviceSigningKeyPair(),
      store: createMemoryDocumentStore(),
      sync: failing,
      initialState: { notes: [] },
      reducer,
    });
    await offline.append({ kind: 'note', payload: { text: 'offline', at: new Date().toISOString() } });
    await expectReject(() => offline.sync(), 'offline sync should reject');
    assert(offline.pendingEventIds().length === 1, 'offline outbox was lost after failed push');
  });

  for (const size of opts.mediaBytes) {
    await step(`sealed media ${formatBytes(size)} chunked round trip`, async () => {
      const bytes = deterministicBytes(size);
      const attachmentId = `att_${size}_${Math.random().toString(36).slice(2, 8)}`;
      await pushEncryptedAttachmentChunked(sync, {
        documentId,
        documentKey,
        attachmentId,
        bytes,
        contentType: 'application/octet-stream',
      });
      const restored = await pullEncryptedAttachmentChunked(sync, { documentId, documentKey, attachmentId });
      assert(restored.bytes.byteLength === bytes.byteLength, 'restored media byte length mismatch');
      assert(restored.bytes[0] === bytes[0] && restored.bytes.at(-1) === bytes.at(-1), 'restored media bytes mismatch');
    });
  }

  const sorted = [...timings].sort((a, b) => a.ms - b.ms);
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]?.ms ?? 0;
  console.log(`\nTiming p95: ${p95.toFixed(1)}ms across ${timings.length} step(s)`);
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures, timings }, null, 2));
    process.exit(1);
  }
}

function parseArgs(args) {
  const opts = {
    origin: process.env.SHIPPIE_SEALED_CLOUD_ORIGIN ?? 'http://127.0.0.1:8788',
    mediaBytes: [1024 * 1024],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--origin') opts.origin = args[++i] ?? opts.origin;
    if (arg === '--media') {
      opts.mediaBytes = String(args[++i] ?? '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  }
  return opts;
}

function deterministicBytes(size) {
  const bytes = new Uint8Array(size);
  const seed = enc.encode(`shippie-torture-${size}`);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = seed[i % seed.length] ^ (i % 251);
  return bytes;
}

async function expectReject(fn, message) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

async function waitForChangeStream(origin, documentId, baseline) {
  const url = new URL(`/api/documents/${encodeURIComponent(documentId)}/changes`, origin);
  url.searchParams.set('eventCount', String(baseline.eventCount));
  url.searchParams.set('snapshotCount', String(baseline.snapshotCount));
  url.searchParams.set('timeoutMs', '5000');
  url.searchParams.set('intervalMs', '750');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`change stream returned ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('change stream body missing');
  let text = '';
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (value) text += new TextDecoder().decode(value);
    if (text.includes('event: change') || done) break;
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
