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

const origin = process.argv[2] ?? process.env.SHIPPIE_SEALED_CLOUD_ORIGIN ?? 'http://127.0.0.1:8788';

const step = async (label, fn) => {
  process.stdout.write(`- ${label}... `);
  const result = await fn();
  process.stdout.write('ok\n');
  return result;
};

const main = async () => {
  console.log(`Checking Shippie sealed cloud at ${origin}`);

  const sync = createSealedSyncClient({ origin });
  const documentId = `check_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const documentKey = generateDocumentKey();
  const signing = await generateDeviceSigningKeyPair();
  const store = createMemoryDocumentStore();

  const doc = await step('append encrypted document event', async () => {
    const handle = await openDocument({
      documentId,
      documentKey,
      signing,
      store,
      sync,
      initialState: { count: 0 },
      reducer: (state, event) => event.kind === 'sealed-cloud-check' ? { count: state.count + 1 } : state,
    });
    await handle.append({
      kind: 'sealed-cloud-check',
      payload: { message: 'sealed smoke test', createdAt: new Date().toISOString() },
    });
    const result = await handle.sync();
    if (result.pushed !== 1) throw new Error(`expected 1 pushed event, got ${result.pushed}`);
    await handle.createSnapshot();
    await handle.sync();
    return handle;
  });

  await step('pull encrypted event back', async () => {
    const page = await sync.pullEvents(documentId, { limit: 10 });
    if (page.events.length !== 1) throw new Error(`expected 1 event, got ${page.events.length}`);
    if (page.events[0].eventId !== doc.envelopes()[0]?.eventId) throw new Error('pulled event id mismatch');
  });

  await step('read sealed manifest and latest snapshot', async () => {
    const manifest = await sync.getManifest?.(documentId);
    if (!manifest) throw new Error('missing document manifest');
    if (!manifest.latestSnapshotId) throw new Error('manifest missing latest snapshot');
    const snapshot = await sync.pullLatestSnapshot?.(documentId);
    if (!snapshot || snapshot.snapshotId !== manifest.latestSnapshotId) throw new Error('latest snapshot mismatch');
  });

  await step('read sealed change hint', async () => {
    const hint = await sync.getChangeHint?.(documentId, {
      eventCursor: doc.cursor(),
      snapshotCursor: doc.snapshotCursor(),
      eventCount: doc.envelopes().length,
      snapshotCount: doc.snapshots().length,
    });
    if (!hint) throw new Error('missing change hint');
    if (hint.documentId !== documentId) throw new Error('change hint document mismatch');
    if (hint.changed) throw new Error('change hint should be fresh after sync');
  });

  await step('read metadata-only health and budget', async () => {
    const response = await fetch(`${origin}/api/documents/${encodeURIComponent(documentId)}/health`);
    if (!response.ok) throw new Error(`health returned ${response.status}`);
    const health = await response.json();
    if (health.documentId !== documentId) throw new Error('health document mismatch');
    if (!health.budget?.events || health.budget.events.used < 1) throw new Error('health budget missing event usage');
  });

  await step('round-trip sealed attachment', async () => {
    const bytes = new TextEncoder().encode('sealed attachment smoke test');
    await sync.pushAttachment(documentId, 'attachment-check.txt', bytes, { contentType: 'text/plain' });
    const blob = await sync.pullAttachment(documentId, 'attachment-check.txt');
    const text = await blob.text();
    if (text !== 'sealed attachment smoke test') throw new Error('attachment body mismatch');
  });

  await step('round-trip encrypted chunked attachment', async () => {
    const bytes = new TextEncoder().encode('sealed encrypted chunked attachment smoke test');
    await pushEncryptedAttachmentChunked(sync, {
      documentId,
      documentKey,
      attachmentId: 'attachment-check-chunked.txt',
      bytes,
      contentType: 'text/plain',
      chunkSize: 16,
    });
    const restored = await pullEncryptedAttachmentChunked(sync, {
      documentId,
      documentKey,
      attachmentId: 'attachment-check-chunked.txt',
    });
    const text = new TextDecoder().decode(restored.bytes);
    if (text !== 'sealed encrypted chunked attachment smoke test') throw new Error('chunked attachment body mismatch');
  });

  await step('round-trip wrapped access bundle relay', async () => {
    const relay = createAccessTransferRelayClient({ origin });
    const transferId = generateAccessTransferId();
    const receiver = await generateAccessTransferKeyPair();
    await relay.putRequest(transferId, {
      schema: 'shippie.document.access-transfer-request.v1',
      recipientPublicKey: receiver.publicKeySpki,
      createdAt: new Date().toISOString(),
      deviceLabel: 'sealed-cloud-check',
    });
    const request = await relay.getRequest(transferId);
    if (!request) throw new Error('missing transfer request');
    const wrapped = await wrapAccessBundle({
      recipientPublicKeySpki: request.recipientPublicKey,
      bundle: {
        schema: 'shippie.document.access-bundle.v1',
        createdAt: new Date().toISOString(),
        documents: [{ documentId, documentKey, cursor: doc.cursor(), role: 'owner' }],
        deviceLabel: 'sealed-cloud-check',
      },
    });
    await relay.putBundle(transferId, wrapped);
    const stored = await relay.getBundle(transferId);
    if (!stored) throw new Error('missing wrapped bundle');
    const bundle = await unwrapAccessBundle({ recipientPrivateKey: receiver.privateKey, wrapped: stored });
    if (bundle.documents[0]?.documentKey !== documentKey) throw new Error('unwrapped bundle mismatch');
  });

  console.log('Sealed cloud check passed. Server stored opaque events, snapshots, attachments, and wrapped bundles.');
};

main().catch((err) => {
  console.error('\nSealed cloud check failed:');
  console.error(err);
  process.exit(1);
});
