#!/usr/bin/env bun

import {
  createAccessTransferRelayClient,
  createMemoryDocumentStore,
  createSealedSyncClient,
  generateAccessTransferId,
  generateAccessTransferKeyPair,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  pullEncryptedAttachmentChunked,
  pushEncryptedAttachmentChunked,
  unwrapAccessBundle,
  wrapAccessBundle,
} from '@shippie/doc';

const enc = new TextEncoder();
const opts = parseArgs(process.argv.slice(2));
const failures = [];
const timings = [];

async function main() {
  console.log(`Proving Shippie device handover at ${opts.origin}`);

  for (const profile of opts.profiles) {
    await runProfile(profile);
  }

  const sorted = [...timings].sort((a, b) => a.ms - b.ms);
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]?.ms ?? 0;
  console.log(`\nDevice handover proof p95: ${p95.toFixed(1)}ms across ${timings.length} step(s)`);
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures, timings }, null, 2));
    process.exit(1);
  }
}

async function runProfile(profileName) {
  const runId = `handover_${safePart(profileName)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const documentId = `${runId}_doc`;
  const documentKey = generateDocumentKey();
  const oldSigning = await generateDeviceSigningKeyPair();
  const relay = createAccessTransferRelayClient({ origin: opts.origin });
  const syncOld = syncFor(`${runId}_old`);
  const syncNew = syncFor(`${runId}_new`);
  const reducer = (state, event) => {
    if (event.kind !== 'note') return state;
    return { notes: [...state.notes, event.payload] };
  };

  const oldPhone = await openDocument({
    documentId,
    documentKey,
    signing: oldSigning,
    store: createMemoryDocumentStore(),
    sync: syncOld,
    initialState: { notes: [] },
    reducer,
  });

  await step(`${profileName}: old phone makes sealed copy`, async () => {
    for (let index = 0; index < opts.events; index += 1) {
      await oldPhone.append({
        kind: 'note',
        payload: { text: `${profileName} note ${index + 1}`, at: new Date().toISOString() },
      });
    }
    await oldPhone.createSnapshot();
    const result = await oldPhone.sync();
    assert(result.pushed >= opts.events, 'old phone did not push its local work');
    assert(oldPhone.pendingEventIds().length === 0, 'old phone still has pending events');
  });

  let accessBundle = null;
  await step(`${profileName}: QR handover relays only wrapped access`, async () => {
    const transferId = generateAccessTransferId();
    const recipient = await generateAccessTransferKeyPair();
    await relay.putRequest(transferId, {
      schema: 'shippie.document.access-transfer-request.v1',
      recipientPublicKey: recipient.publicKeySpki,
      createdAt: new Date().toISOString(),
      deviceLabel: `${profileName} new phone`,
    });
    const request = await relay.getRequest(transferId);
    assert(request?.recipientPublicKey === recipient.publicKeySpki, 'receiver request did not round trip');

    const wrapped = await wrapAccessBundle({
      recipientPublicKeySpki: request.recipientPublicKey,
      bundle: {
        schema: 'shippie.document.access-bundle.v1',
        createdAt: new Date().toISOString(),
        deviceLabel: `${profileName} old phone`,
        documents: [
          {
            documentId,
            documentKey,
            cursor: oldPhone.cursor(),
            role: 'app-device-handover',
          },
        ],
      },
    });
    await relay.putBundle(transferId, wrapped);
    const storedWrapped = await relay.getBundle(transferId);
    assert(storedWrapped?.schema === 'shippie.document.wrapped-access-bundle.v1', 'relay did not store a wrapped bundle');
    assert(!JSON.stringify(storedWrapped).includes(documentKey), 'relay response leaked a raw document key');
    accessBundle = await unwrapAccessBundle({ recipientPrivateKey: recipient.privateKey, wrapped: storedWrapped });
  });

  let newPhone = null;
  await step(`${profileName}: new phone restores from sealed copy`, async () => {
    const doc = accessBundle?.documents?.[0];
    assert(doc?.documentId === documentId, 'access bundle missing document pointer');
    newPhone = await openDocument({
      documentId: doc.documentId,
      documentKey: doc.documentKey,
      signing: await generateDeviceSigningKeyPair(),
      store: createMemoryDocumentStore(),
      sync: syncNew,
      initialState: { notes: [] },
      reducer,
    });
    await newPhone.sync();
    assert(newPhone.state().notes.length === opts.events, 'new phone did not restore every note');
  });

  await step(`${profileName}: storage wipe can restore from saved access`, async () => {
    const doc = accessBundle?.documents?.[0];
    const wipedBrowser = await openDocument({
      documentId: doc.documentId,
      documentKey: doc.documentKey,
      signing: await generateDeviceSigningKeyPair(),
      store: createMemoryDocumentStore(),
      sync: syncFor(`${runId}_wiped`),
      initialState: { notes: [] },
      reducer,
    });
    await wipedBrowser.sync();
    assert(wipedBrowser.state().notes.length === opts.events, 'fresh browser did not restore from sealed copy');
  });

  await step(`${profileName}: near-realtime hint avoids blind polling`, async () => {
    await oldPhone.append({ kind: 'note', payload: { text: `${profileName} live`, at: new Date().toISOString() } });
    await oldPhone.sync();
    const hint = await syncNew.getChangeHint?.(documentId, {
      eventCursor: newPhone.cursor(),
      snapshotCursor: newPhone.snapshotCursor(),
      eventCount: newPhone.envelopes().length,
      snapshotCount: newPhone.snapshots().length,
    });
    assert(hint?.changed === true, 'new phone was not told a sealed copy changed');
    await newPhone.sync();
    assert(newPhone.state().notes.length === opts.events + 1, 'new phone did not converge after the hint');
  });

  for (const size of opts.mediaBytes) {
    await step(`${profileName}: ${formatBytes(size)} encrypted media handover`, async () => {
      const attachmentId = `media_${safePart(profileName)}_${size}`;
      const bytes = deterministicBytes(size);
      await pushEncryptedAttachmentChunked(syncOld, {
        documentId,
        documentKey,
        attachmentId,
        bytes,
        contentType: 'application/octet-stream',
      });
      const restored = await pullEncryptedAttachmentChunked(syncNew, { documentId, documentKey, attachmentId });
      assert(restored.bytes.byteLength === bytes.byteLength, 'media length changed during handover');
      assert(restored.bytes[0] === bytes[0] && restored.bytes.at(-1) === bytes.at(-1), 'media bytes changed during handover');
    });
  }

  await step(`${profileName}: health stays simple and opaque`, async () => {
    const response = await fetch(new URL(`/api/documents/${encodeURIComponent(documentId)}/health`, opts.origin));
    assert(response.ok, `health returned ${response.status}`);
    const bodyText = await response.text();
    assert(!bodyText.includes(`${profileName} note`), 'health response leaked encrypted content');
    const body = JSON.parse(bodyText);
    assert(body.budget?.status !== 'limited', 'handover proof hit a sealed copy safety cap');
  });
}

function syncFor(deviceId) {
  return createSealedSyncClient({
    origin: opts.origin,
    headers: { 'x-shippie-device-id': deviceId },
  });
}

async function step(name, fn) {
  const started = performance.now();
  try {
    await fn();
    timings.push({ name, ms: performance.now() - started });
    console.log(`PASS ${name}`);
  } catch (err) {
    timings.push({ name, ms: performance.now() - started });
    failures.push({ name, error: err instanceof Error ? err.message : String(err) });
    console.error(`FAIL ${name}: ${failures.at(-1).error}`);
  }
}

function parseArgs(args) {
  const parsed = {
    origin: process.env.SHIPPIE_SEALED_CLOUD_ORIGIN ?? 'http://127.0.0.1:8788',
    profiles: ['ios-safari', 'android-chrome', 'desktop-browser'],
    events: 3,
    mediaBytes: [],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--origin') parsed.origin = args[++i] ?? parsed.origin;
    else if (arg === '--profiles') {
      parsed.profiles = String(args[++i] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === '--events') {
      const value = Number(args[++i]);
      if (Number.isFinite(value) && value > 0) parsed.events = Math.floor(value);
    } else if (arg === '--media') {
      parsed.mediaBytes = String(args[++i] ?? '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  }
  if (parsed.profiles.length === 0) parsed.profiles = ['ios-safari'];
  return parsed;
}

function deterministicBytes(size) {
  const bytes = new Uint8Array(size);
  const seed = enc.encode(`shippie-handover-${size}`);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = seed[index % seed.length] ^ (index % 251);
  return bytes;
}

function safePart(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 48) || 'device';
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await main();
