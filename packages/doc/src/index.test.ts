import { describe, expect, test } from 'bun:test';
import {
  compareDocumentEvents,
  createAccessTransferRelayClient,
  createSealedSyncClient,
  createLocalStorageDocumentStore,
  createMemoryDocumentStore,
  decryptAttachment,
  decryptDocumentEvent,
  decryptDocumentSnapshot,
  encryptedAttachmentFromBytes,
  encryptAttachment,
  encryptDocumentSnapshot,
  encryptDocumentEvent,
  generateAccessTransferKeyPair,
  generateAccessTransferId,
  generateDeviceSigningKeyPair,
  generateDocumentKey,
  openDocument,
  pullEncryptedAttachmentChunked,
  pushEncryptedAttachmentChunked,
  reduceDocumentEvents,
  SealedSyncError,
  unwrapAccessBundle,
  verifySignedDocumentEvent,
  wrapAccessBundle,
  type EncryptedDocumentEvent,
  type DocumentEvent,
  type DocumentAccessBundle,
  type DocumentSyncStatus,
  type RealtimeSyncCoordinator,
  type RealtimeSyncOptions,
  type RealtimeSyncReason,
  type SealedDocumentChangeHint,
  type SealedSyncClient,
} from './index.ts';

describe('@shippie/doc event envelopes', () => {
  test('encrypts, decrypts, and verifies a signed document event', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();

    const envelope = await encryptDocumentEvent({
      documentId: 'doc_match_room_2026',
      documentKey,
      signing,
      kind: 'draft-pick',
      payload: { playerId: 'ENG-09', pick: 14 },
      parentIds: ['evt_a'],
      createdAt: '2026-05-11T12:00:00.000Z',
      eventId: 'evt_pick_14',
    });

    expect(envelope.documentId).toBe('doc_match_room_2026');
    expect('kind' in envelope).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain('ENG-09');

    const signed = await decryptDocumentEvent<{ playerId: string; pick: number }>({ documentKey, envelope });
    expect(signed.event.kind).toBe('draft-pick');
    expect(signed.event.payload).toEqual({ playerId: 'ENG-09', pick: 14 });
    expect(await verifySignedDocumentEvent(signed)).toBe(true);
  });

  test('rejects ciphertext modified by a hub', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const envelope = await encryptDocumentEvent({
      documentId: 'doc_1',
      documentKey,
      signing,
      kind: 'note-added',
      payload: { text: 'sealed' },
    });

    const tampered = {
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -1)}${envelope.ciphertext.endsWith('A') ? 'B' : 'A'}`,
    };

    await expect(decryptDocumentEvent({ documentKey, envelope: tampered })).rejects.toThrow();
  });

  test('rejects envelope metadata that does not match decrypted event metadata', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const envelope = await encryptDocumentEvent({
      documentId: 'doc_1',
      documentKey,
      signing,
      kind: 'note-added',
      payload: { text: 'sealed' },
    });

    await expect(
      decryptDocumentEvent({ documentKey, envelope: { ...envelope, documentId: 'doc_2' } }),
    ).rejects.toThrow(/document id mismatch/);
  });

  test('rejects the wrong document key', async () => {
    const documentKey = generateDocumentKey();
    const wrongKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const envelope = await encryptDocumentEvent({
      documentId: 'doc_1',
      documentKey,
      signing,
      kind: 'note-added',
      payload: { text: 'sealed' },
    });

    await expect(decryptDocumentEvent({ documentKey: wrongKey, envelope })).rejects.toThrow();
  });
});

describe('@shippie/doc snapshots and sealed media', () => {
  test('encrypts and verifies reducer snapshots without plaintext state in the envelope', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();

    const snapshot = await encryptDocumentSnapshot({
      documentId: 'doc_counter',
      documentKey,
      signing,
      state: { count: 42, privateNote: 'season plan' },
      eventCount: 10,
      lastEventId: 'evt_10',
      lastEventCreatedAt: '2026-05-11T12:00:10.000Z',
      snapshotId: 'snap_10',
      createdAt: '2026-05-11T12:01:00.000Z',
    });

    expect(JSON.stringify(snapshot)).not.toContain('season plan');
    const opened = await decryptDocumentSnapshot<{ count: number; privateNote: string }>({ documentKey, envelope: snapshot });
    expect(opened.snapshot.state).toEqual({ count: 42, privateNote: 'season plan' });
    expect(opened.snapshot.eventCount).toBe(10);
  });

  test('uses a local snapshot as the restore base and only replays the tail', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const first = await openCounterDocument({ documentKey, signing, store });
    await first.append({
      kind: 'counter/add',
      payload: { amount: 10 },
      eventId: 'evt_1',
      createdAt: '2026-05-11T12:00:00.000Z',
    });
    const snapshot = await first.createSnapshot({
      snapshotId: 'snap_after_first',
      createdAt: '2026-05-11T12:00:01.000Z',
    });
    await first.append({
      kind: 'counter/add',
      payload: { amount: 5 },
      eventId: 'evt_2',
      createdAt: '2026-05-11T12:00:02.000Z',
    });

    const reopened = await openCounterDocument({ documentKey, signing, store });
    expect(reopened.latestSnapshot()?.snapshotId).toBe(snapshot.snapshotId);
    expect(reopened.events().map((item) => item.eventId)).toEqual(['evt_2']);
    expect(reopened.state()).toEqual({ count: 15 });
  });

  test('pulls the latest sealed snapshot before event replay on a fresh restore device', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const sealedSnapshot = await encryptDocumentSnapshot({
      documentId: 'doc_counter',
      documentKey,
      signing,
      state: { count: 100 },
      eventCount: 10,
      lastEventId: 'evt_10',
      lastEventCreatedAt: '2026-05-11T12:00:10.000Z',
      snapshotId: 'snap_remote',
      createdAt: '2026-05-11T12:01:00.000Z',
    });
    const tail = await encryptDocumentEvent({
      documentId: 'doc_counter',
      documentKey,
      signing,
      kind: 'counter/add',
      payload: { amount: 5 },
      eventId: 'evt_11',
      createdAt: '2026-05-11T12:00:11.000Z',
    });
    const calls: string[] = [];
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new Error('not used');
      },
      async pullEvents() {
        calls.push('events');
        return { events: [tail], cursor: null, truncated: false };
      },
      async pullLatestSnapshot() {
        calls.push('latest-snapshot');
        return sealedSnapshot;
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };

    const restored = await openCounterDocument({
      documentKey,
      signing,
      store: createMemoryDocumentStore(),
      sync,
    });
    await restored.sync();

    expect(calls).toEqual(['latest-snapshot', 'events']);
    expect(restored.latestSnapshot()?.snapshotId).toBe('snap_remote');
    expect(restored.events().map((item) => item.eventId)).toEqual(['evt_11']);
    expect(restored.state()).toEqual({ count: 105 });
  });

  test('encrypts chunked attachments so raw media never crosses the sealed cloud boundary', async () => {
    const documentKey = generateDocumentKey();
    const stored = new Map<string, Uint8Array>();
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new Error('not used');
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment(_documentId, attachmentId, bytes) {
        const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(await new Blob([bytes]).arrayBuffer());
        stored.set(attachmentId, body);
        return { key: attachmentId, stored: true, byteLength: body.byteLength };
      },
      async pullAttachment(_documentId, attachmentId) {
        const body = stored.get(attachmentId);
        if (!body) throw new Error(`missing ${attachmentId}`);
        return new Blob([body.buffer as ArrayBuffer], { type: 'application/json' });
      },
    };

    const raw = new TextEncoder().encode('private image bytes that should never be uploaded as plaintext');
    await pushEncryptedAttachmentChunked(sync, {
      documentId: 'doc_counter',
      documentKey,
      attachmentId: 'att_photo',
      bytes: raw,
      contentType: 'image/jpeg',
      chunkSize: 16,
    });

    const wire = [...stored.values()].map((bytes) => new TextDecoder().decode(bytes)).join('\n');
    expect(wire).not.toContain('private image bytes');
    expect(encryptedAttachmentFromBytes(stored.get('att_photo.chunk-00000')!).schema).toBe(
      'shippie.document.encrypted-attachment.v1',
    );

    const restored = await pullEncryptedAttachmentChunked(sync, {
      documentId: 'doc_counter',
      documentKey,
      attachmentId: 'att_photo',
    });
    expect(restored.contentType).toBe('image/jpeg');
    expect(restored.bytes).toEqual(raw);
  });

  test('rejects encrypted attachments opened with the wrong document key', async () => {
    const documentKey = generateDocumentKey();
    const wrongKey = generateDocumentKey();
    const payload = await encryptAttachment({
      documentKey,
      bytes: new TextEncoder().encode('private media'),
      contentType: 'image/png',
    });

    await expect(
      decryptAttachment({ documentKey: wrongKey, payload }),
    ).rejects.toThrow();
  });
});

describe('@shippie/doc reducer helpers', () => {
  test('orders events by createdAt then eventId before reducing', () => {
    const events: DocumentEvent<{ n: number }>[] = [
      event('evt_c', '2026-05-11T12:00:01.000Z', 3),
      event('evt_b', '2026-05-11T12:00:00.000Z', 2),
      event('evt_a', '2026-05-11T12:00:00.000Z', 1),
    ];

    expect([...events].sort(compareDocumentEvents).map((item) => item.eventId)).toEqual([
      'evt_a',
      'evt_b',
      'evt_c',
    ]);

    const out = reduceDocumentEvents<number[], { n: number }>([], events, (state, item) => [
      ...state,
      item.payload.n,
    ]);
    expect(out).toEqual([1, 2, 3]);
  });
});

describe('@shippie/doc sealed sync client', () => {
  test('pushes sealed events without plaintext app payloads', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createSealedSyncClient({
      origin: 'https://shippie.test',
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return Response.json({ key: 'r2-key', cursor: 'cursor-1', stored: true }, { status: 201 });
      },
    });

    const result = await client.pushEvent(encryptedEvent({ documentId: 'doc_abc123', eventId: 'evt_1' }));
    expect(result.stored).toBe(true);
    expect(String(calls[0]!.input)).toBe('https://shippie.test/api/documents/doc_abc123/events');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(String(calls[0]!.init?.body)).not.toContain('draft-pick');
  });

  test('pushes sealed event batches without plaintext app payloads', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createSealedSyncClient({
      origin: 'https://shippie.test',
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return Response.json({
          events: [
            { key: 'r2-key-1', cursor: 'cursor-1', stored: true },
            { key: 'r2-key-2', cursor: 'cursor-2', stored: true },
          ],
          stored: 2,
          cursor: 'cursor-2',
        }, { status: 201 });
      },
    });

    const result = await client.pushEvents?.('doc_abc123', [
      encryptedEvent({ documentId: 'doc_abc123', eventId: 'evt_1' }),
      encryptedEvent({ documentId: 'doc_abc123', eventId: 'evt_2' }),
    ]);
    expect(result?.stored).toBe(2);
    expect(String(calls[0]!.input)).toBe('https://shippie.test/api/documents/doc_abc123/events');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(String(calls[0]!.init?.body)).not.toContain('draft-pick');
    expect(JSON.parse(String(calls[0]!.init?.body))).toHaveLength(2);
  });

  test('pulls sealed event pages and keeps cursor state opaque to the client', async () => {
    const client = createSealedSyncClient({
      fetchImpl: async (input) => {
        expect(String(input)).toBe('/api/documents/doc_abc123/events?cursor=abc&limit=10');
        return Response.json({
          events: [encryptedEvent({ documentId: 'doc_abc123', eventId: 'evt_1' })],
          cursor: 'next',
          truncated: true,
        });
      },
    });

    const page = await client.pullEvents('doc_abc123', { cursor: 'abc', limit: 10 });
    expect(page.events.map((item) => item.eventId)).toEqual(['evt_1']);
    expect(page.cursor).toBe('next');
    expect(page.truncated).toBe(true);
  });

  test('reads sealed change hints without pulling encrypted event pages', async () => {
    const client = createSealedSyncClient({
      fetchImpl: async (input) => {
        expect(String(input)).toBe('/api/documents/doc_abc123/hint?eventCursor=cursor-a&snapshotCursor=snap-a&eventCount=1&snapshotCount=1');
        return Response.json({
          schema: 'shippie.document.change-hint.v1',
          documentId: 'doc_abc123',
          eventCount: 2,
          snapshotCount: 1,
          attachmentCount: 0,
          latestEventId: 'evt_2',
          latestEventCursor: 'cursor-b',
          latestSnapshotId: 'snap_1',
          latestSnapshotCursor: 'snap-a',
          updatedAt: '2026-05-11T12:00:00.000Z',
          changed: true,
        });
      },
    });

    await expect(
      client.getChangeHint?.('doc_abc123', {
        eventCursor: 'cursor-a',
        snapshotCursor: 'snap-a',
        eventCount: 1,
        snapshotCount: 1,
      }),
    ).resolves.toMatchObject({
      changed: true,
      eventCount: 2,
      latestEventCursor: 'cursor-b',
    });
  });

  test('opens sealed change streams with local counts and emits parsed hints', () => {
    const previous = (globalThis as { EventSource?: unknown }).EventSource;
    const sources: FakeEventSource[] = [];
    class FakeEventSource {
      readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
      closed = false;
      constructor(readonly url: string) {
        sources.push(this);
      }
      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        const list = this.listeners.get(type) ?? [];
        list.push(listener);
        this.listeners.set(type, list);
      }
      close() {
        this.closed = true;
      }
      emit(type: string, data: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
      }
    }
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    try {
      const changes: SealedDocumentChangeHint[] = [];
      const client = createSealedSyncClient({ origin: 'https://example.test' });
      const handle = client.watchChangeHint?.('doc_abc123', {
        eventCount: 2,
        snapshotCount: 1,
        timeoutMs: 12_000,
        intervalMs: 1_000,
        onChange: (hint) => changes.push(hint),
      });
      expect(handle).not.toBeNull();
      expect(sources[0]?.url).toBe('https://example.test/api/documents/doc_abc123/changes?eventCount=2&snapshotCount=1&timeoutMs=12000&intervalMs=1000');
      sources[0]?.emit('change', {
        schema: 'shippie.document.change-hint.v1',
        documentId: 'doc_abc123',
        eventCount: 3,
        snapshotCount: 1,
        attachmentCount: 0,
        latestEventId: 'evt_3',
        latestEventCursor: 'cursor-3',
        latestSnapshotId: null,
        latestSnapshotCursor: null,
        updatedAt: '2026-05-12T09:00:00.000Z',
        changed: true,
      });
      expect(changes).toHaveLength(1);
      expect(changes[0]?.eventCount).toBe(3);
      expect(sources[0]?.closed).toBe(true);
      handle?.close();
    } finally {
      (globalThis as { EventSource?: unknown }).EventSource = previous;
    }
  });

  test('pushes and pulls sealed attachments separately from event sync', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createSealedSyncClient({
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        if (init?.method === 'PUT') {
          return Response.json({ key: 'attachment-key', stored: true, byteLength: 3 }, { status: 201 });
        }
        return new Response(new Uint8Array([7, 8, 9]), {
          headers: { 'content-type': 'application/octet-stream' },
        });
      },
    });

    await expect(
      client.pushAttachment('doc_abc123', 'att_photo_1', new Uint8Array([1, 2, 3]), {
        contentType: 'application/octet-stream',
      }),
    ).resolves.toMatchObject({ stored: true, byteLength: 3 });

    const blob = await client.pullAttachment('doc_abc123', 'att_photo_1');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
    expect(String(calls[0]!.input)).toBe('/api/documents/doc_abc123/attachments/att_photo_1');
    expect(calls[0]!.init?.method).toBe('PUT');
    expect(String(calls[1]!.input)).toBe('/api/documents/doc_abc123/attachments/att_photo_1');
    expect(calls[1]!.init?.method).toBe('GET');
  });

  test('sends form-like attachment types as octet-stream while preserving the intended type', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createSealedSyncClient({
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return Response.json({ key: 'attachment-key', stored: true, byteLength: 3 }, { status: 201 });
      },
    });

    await client.pushAttachment('doc_abc123', 'att_text_1', new Uint8Array([1, 2, 3]), {
      contentType: 'text/plain',
    });

    const headers = calls[0]!.init?.headers as Headers;
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect(headers.get('x-shippie-attachment-content-type')).toBe('text/plain');
  });

  test('surfaces sealed-cloud budget failures as typed errors', async () => {
    const client = createSealedSyncClient({
      fetchImpl: async () => new Response('sealed sync write budget exceeded', { status: 429 }),
    });

    try {
      await client.pushEvent(encryptedEvent({}));
      throw new Error('expected pushEvent to fail');
    } catch (err) {
      expect(err instanceof SealedSyncError).toBe(true);
      expect((err as SealedSyncError).status).toBe(429);
      expect((err as Error).message).toContain('budget');
    }
  });
});

describe('@shippie/doc runtime document', () => {
  test('opens from local cache, appends locally, and reduces state immediately', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const doc = await openCounterDocument({ documentKey, signing, store });

    expect(doc.state()).toEqual({ count: 0 });
    const appended = await doc.append({
      kind: 'counter/add',
      payload: { amount: 2 },
      eventId: 'evt_add_2',
      createdAt: '2026-05-11T12:00:00.000Z',
    });

    expect(appended.eventId).toBe('evt_add_2');
    expect(doc.state()).toEqual({ count: 2 });
    expect(doc.pendingEventIds()).toEqual(['evt_add_2']);
    expect(JSON.stringify(doc.envelopes())).not.toContain('counter/add');
  });

  test('pushes pending sealed events and clears the outbox', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const pushed: EncryptedDocumentEvent[] = [];
    const sync: SealedSyncClient = {
      async pushEvent(event) {
        pushed.push(event);
        return { key: `key:${event.eventId}`, cursor: `cursor:${event.eventId}`, stored: true };
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({ documentKey, signing, store, sync });
    await doc.append({ kind: 'counter/add', payload: { amount: 3 }, eventId: 'evt_add_3' });

    const result = await doc.sync();
    expect(result.pushed).toBe(1);
    expect(pushed.map((item) => item.eventId)).toEqual(['evt_add_3']);
    expect(doc.pendingEventIds()).toEqual([]);
    expect(doc.state()).toEqual({ count: 3 });

    const reopened = await openCounterDocument({ documentKey, signing, store, sync });
    expect(reopened.pendingEventIds()).toEqual([]);
    expect(reopened.state()).toEqual({ count: 3 });
  });

  test('uses batch push when multiple pending events are ready', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const pushed: EncryptedDocumentEvent[][] = [];
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new Error('single push should not be used for batches');
      },
      async pushEvents(_documentId, events) {
        pushed.push([...events]);
        return {
          events: events.map((event) => ({ key: `key:${event.eventId}`, cursor: `cursor:${event.eventId}`, stored: true })),
          stored: events.length,
          cursor: `cursor:${events.at(-1)?.eventId ?? 'none'}`,
        };
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({ documentKey, signing, store, sync });
    await doc.append({ kind: 'counter/add', payload: { amount: 1 }, eventId: 'evt_batch_1' });
    await doc.append({ kind: 'counter/add', payload: { amount: 2 }, eventId: 'evt_batch_2' });

    const result = await doc.sync();
    expect(result.pushed).toBe(2);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.map((event) => event.eventId)).toEqual(['evt_batch_1', 'evt_batch_2']);
    expect(doc.pendingEventIds()).toEqual([]);
    expect(doc.state()).toEqual({ count: 3 });
  });

  test('fast-forwards after pushing when sealed change hints match local state', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const calls: string[] = [];
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new Error('single push should not be used for batches');
      },
      async pushEvents(documentId, events) {
        calls.push('pushEvents');
        return {
          events: events.map((event) => ({ key: `key:${event.eventId}`, cursor: `cursor:${event.eventId}`, stored: true })),
          stored: events.length,
          cursor: `cursor:${events.at(-1)?.eventId ?? 'none'}`,
        };
      },
      async pullEvents() {
        calls.push('pullEvents');
        return { events: [], cursor: null, truncated: false };
      },
      async getChangeHint(documentId, opts) {
        calls.push('getChangeHint');
        expect(opts).toMatchObject({
          eventCursor: 'cursor:evt_fast_2',
          eventCount: 2,
          snapshotCount: 0,
        });
        return {
          schema: 'shippie.document.change-hint.v1',
          documentId,
          eventCount: 2,
          snapshotCount: 0,
          attachmentCount: 0,
          latestEventId: 'evt_fast_2',
          latestEventCursor: 'cursor:evt_fast_2',
          latestSnapshotId: null,
          latestSnapshotCursor: null,
          updatedAt: '2026-05-11T12:00:00.000Z',
          changed: false,
        };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({ documentKey, signing, store, sync });
    await doc.append({ kind: 'counter/add', payload: { amount: 1 }, eventId: 'evt_fast_1' });
    await doc.append({ kind: 'counter/add', payload: { amount: 2 }, eventId: 'evt_fast_2' });

    const result = await doc.sync();
    expect(result).toMatchObject({ pushed: 2, pulled: 0, cursor: 'cursor:evt_fast_2' });
    expect(calls).toEqual(['pushEvents', 'getChangeHint']);
    expect(doc.cursor()).toBe('cursor:evt_fast_2');
    expect(doc.pendingEventIds()).toEqual([]);
  });

  test('fast-forwards snapshot cursors after pushing a fresh sealed snapshot', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const calls: string[] = [];
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new Error('events should not be pushed');
      },
      async pullEvents() {
        calls.push('pullEvents');
        return { events: [], cursor: null, truncated: false };
      },
      async pushSnapshot(snapshot) {
        calls.push('pushSnapshot');
        return { key: `key:${snapshot.snapshotId}`, cursor: `cursor:${snapshot.snapshotId}`, stored: true };
      },
      async getChangeHint(documentId, opts) {
        calls.push('getChangeHint');
        expect(opts).toMatchObject({
          eventCursor: null,
          snapshotCursor: 'cursor:snap_fast',
          eventCount: 0,
          snapshotCount: 1,
        });
        return {
          schema: 'shippie.document.change-hint.v1',
          documentId,
          eventCount: 0,
          snapshotCount: 1,
          attachmentCount: 0,
          latestEventId: null,
          latestEventCursor: null,
          latestSnapshotId: 'snap_fast',
          latestSnapshotCursor: 'cursor:snap_fast',
          updatedAt: '2026-05-11T12:00:00.000Z',
          changed: false,
        };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({ documentKey, signing, store, sync });
    await doc.createSnapshot({ snapshotId: 'snap_fast' });

    const result = await doc.sync();
    expect(result).toMatchObject({ pushed: 0, pulled: 0, cursor: null });
    expect(calls).toEqual(['pushSnapshot', 'getChangeHint']);
    expect(doc.snapshotCursor()).toBe('cursor:snap_fast');
    expect(doc.pendingSnapshotIds()).toEqual([]);
  });

  test('pulls missing sealed events from sync and merges into local state', async () => {
    const documentKey = generateDocumentKey();
    const localSigning = await generateDeviceSigningKeyPair();
    const remoteSigning = await generateDeviceSigningKeyPair();
    const remoteEnvelope = await encryptDocumentEvent({
      documentId: 'doc_counter',
      documentKey,
      signing: remoteSigning,
      kind: 'counter/add',
      payload: { amount: 5 },
      eventId: 'evt_remote_5',
      createdAt: '2026-05-11T12:00:01.000Z',
    });
    const store = createMemoryDocumentStore();
    let pulled = false;
    const sync: SealedSyncClient = {
      async pushEvent(event) {
        return { key: `key:${event.eventId}`, cursor: `cursor:${event.eventId}`, stored: true };
      },
      async pullEvents() {
        if (pulled) return { events: [], cursor: null, truncated: false };
        pulled = true;
        return { events: [remoteEnvelope], cursor: 'cursor_remote', truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({ documentKey, signing: localSigning, store, sync });

    const result = await doc.sync();
    expect(result.pulled).toBe(1);
    expect(doc.state()).toEqual({ count: 5 });
    expect(doc.cursor()).toBe('cursor_remote');
    expect(doc.events().map((event) => event.eventId)).toEqual(['evt_remote_5']);
  });

  test('persists unsynced outbox when sealed cloud returns a budget error', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new SealedSyncError(429, 'sealed sync write budget exceeded');
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({ documentKey, signing, store, sync });
    await doc.append({ kind: 'counter/add', payload: { amount: 1 }, eventId: 'evt_retry' });

    await expect(doc.sync()).rejects.toThrow(/budget/);
    expect(doc.pendingEventIds()).toEqual(['evt_retry']);

    const reopened = await openCounterDocument({ documentKey, signing, store, sync });
    expect(reopened.pendingEventIds()).toEqual(['evt_retry']);
    expect(reopened.state()).toEqual({ count: 1 });
  });

  test('realtime mode commits locally immediately and coalesces cloud pushes', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const clock = manualClock();
    const pushed: EncryptedDocumentEvent[][] = [];
    const statuses: string[] = [];
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new Error('single push should not be used for realtime batches');
      },
      async pushEvents(_documentId, events) {
        pushed.push([...events]);
        return {
          events: events.map((item) => ({ key: `key:${item.eventId}`, cursor: `cursor:${item.eventId}`, stored: true })),
          stored: events.length,
          cursor: `cursor:${events.at(-1)?.eventId ?? 'none'}`,
        };
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };

    const doc = await openCounterDocument({
      documentKey,
      signing,
      store,
      sync,
      realtime: {
        clock: clock.clock,
        startOnOpen: false,
        pushDebounceMs: 80,
        pullIntervalMs: 2_500,
        maxJitterMs: 0,
        onStatus: (status) => statuses.push(status.state),
      },
    });

    await doc.append({ kind: 'counter/add', payload: { amount: 1 }, eventId: 'evt_live_1' });
    await doc.append({ kind: 'counter/add', payload: { amount: 2 }, eventId: 'evt_live_2' });

    expect(doc.state()).toEqual({ count: 3 });
    expect(doc.pendingEventIds()).toEqual(['evt_live_1', 'evt_live_2']);
    expect(doc.syncStatus()).toMatchObject({ state: 'scheduled', pendingEvents: 2, reason: 'append' });
    expect(pushed).toHaveLength(0);

    await clock.runNext();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.map((event) => event.eventId)).toEqual(['evt_live_1', 'evt_live_2']);
    expect(doc.pendingEventIds()).toEqual([]);
    expect(doc.syncStatus()).toMatchObject({ state: 'idle', pendingEvents: 0 });
    expect(statuses).toContain('syncing');
    doc.stopRealtimeSync();
  });

  test('realtime timer uses change hints to avoid full pulls when cursors are fresh', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const clock = manualClock();
    let hints = 0;
    let pulls = 0;
    const sync: SealedSyncClient = {
      async pushEvent(event) {
        return { key: `key:${event.eventId}`, cursor: `cursor:${event.eventId}`, stored: true };
      },
      async pullEvents() {
        pulls += 1;
        return { events: [], cursor: null, truncated: false };
      },
      async getChangeHint(documentId) {
        hints += 1;
        return {
          schema: 'shippie.document.change-hint.v1',
          documentId,
          eventCount: 0,
          snapshotCount: 0,
          attachmentCount: 0,
          latestEventId: null,
          latestEventCursor: null,
          latestSnapshotId: null,
          latestSnapshotCursor: null,
          updatedAt: null,
          changed: false,
        };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({
      documentKey,
      signing,
      store,
      sync,
      realtime: {
        clock: clock.clock,
        startOnOpen: false,
        maxJitterMs: 0,
      },
    });

    doc.requestSync('timer');
    await clock.runNext();

    expect(hints).toBe(1);
    expect(pulls).toBe(0);
    expect(doc.syncStatus()).toMatchObject({ state: 'idle', lastError: null });
    doc.stopRealtimeSync();
  });

  test('realtime followers delegate scheduled sync to the tab leader', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const clock = manualClock();
    let pushes = 0;
    const coordinator = fakeCoordinator(false);
    const sync: SealedSyncClient = {
      async pushEvent(event) {
        pushes += 1;
        return { key: `key:${event.eventId}`, cursor: `cursor:${event.eventId}`, stored: true };
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({
      documentKey,
      signing,
      store,
      sync,
      realtime: {
        clock: clock.clock,
        startOnOpen: false,
        maxJitterMs: 0,
        tabCoordination: coordinator,
      },
    });

    await doc.append({ kind: 'counter/add', payload: { amount: 1 }, eventId: 'evt_followed' });
    await clock.runNext();

    expect(pushes).toBe(0);
    expect(coordinator.requests).toEqual(['append']);
    expect(doc.pendingEventIds()).toEqual(['evt_followed']);
    doc.stopRealtimeSync();
  });

  test('realtime mode keeps sealed outbox and backs off after cloud budget errors', async () => {
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const store = createMemoryDocumentStore();
    const clock = manualClock();
    const sync: SealedSyncClient = {
      async pushEvent() {
        throw new SealedSyncError(429, 'sealed sync write budget exceeded');
      },
      async pullEvents() {
        return { events: [], cursor: null, truncated: false };
      },
      async pushAttachment() {
        return { key: 'attachment', stored: true, byteLength: 0 };
      },
      async pullAttachment() {
        return new Blob();
      },
    };
    const doc = await openCounterDocument({
      documentKey,
      signing,
      store,
      sync,
      realtime: {
        clock: clock.clock,
        startOnOpen: false,
        pushDebounceMs: 80,
        maxBackoffMs: 30_000,
        maxJitterMs: 0,
      },
    });

    await doc.append({ kind: 'counter/add', payload: { amount: 1 }, eventId: 'evt_live_retry' });
    await clock.runNext();

    expect(doc.pendingEventIds()).toEqual(['evt_live_retry']);
    expect(doc.syncStatus()).toMatchObject({
      state: 'error',
      pendingEvents: 1,
      attempt: 1,
      reason: 'append',
    });
    expect(doc.syncStatus().lastError).toContain('budget');
    expect(clock.pendingDelays()).toEqual([1_000]);
    doc.stopRealtimeSync();
  });

  test('persists encrypted local cache across reloads with localStorage store', async () => {
    const storage = memoryStorage();
    const documentKey = generateDocumentKey();
    const signing = await generateDeviceSigningKeyPair();
    const firstStore = createLocalStorageDocumentStore({ storage, namespace: 'test.doc' });
    const first = await openCounterDocument({ documentKey, signing, store: firstStore });
    await first.append({
      kind: 'counter/add',
      payload: { amount: 9 },
      eventId: 'evt_reload',
      createdAt: '2026-05-11T12:00:00.000Z',
    });

    const raw = storage.getItem('test.doc:doc_counter') ?? '';
    expect(raw).toContain('evt_reload');
    expect(raw).not.toContain('counter/add');
    expect(raw).not.toContain('"amount":9');

    const secondStore = createLocalStorageDocumentStore({ storage, namespace: 'test.doc' });
    const reopened = await openCounterDocument({ documentKey, signing, store: secondStore });
    expect(reopened.state()).toEqual({ count: 9 });
    expect(reopened.pendingEventIds()).toEqual(['evt_reload']);
  });
});

describe('@shippie/doc access bundle handover', () => {
  test('wraps access bundles so Shippie can relay but not read keys', async () => {
    const recipient = await generateAccessTransferKeyPair();
    const documentKey = generateDocumentKey();
    const bundle: DocumentAccessBundle = {
      schema: 'shippie.document.access-bundle.v1',
      createdAt: '2026-05-11T12:00:00.000Z',
      deviceLabel: 'Devante phone',
      documents: [
        {
          documentId: 'doc_counter',
          documentKey,
          cursor: 'cursor_1',
          role: 'owner',
        },
      ],
    };

    const wrapped = await wrapAccessBundle({
      recipientPublicKeySpki: recipient.publicKeySpki,
      bundle,
    });

    expect(JSON.stringify(wrapped)).not.toContain(documentKey);
    expect(JSON.stringify(wrapped)).not.toContain('doc_counter');
    const unwrapped = await unwrapAccessBundle({
      recipientPrivateKey: recipient.privateKey,
      wrapped,
    });
    expect(unwrapped).toEqual(bundle);
  });

  test('rejects tampered wrapped access bundles', async () => {
    const recipient = await generateAccessTransferKeyPair();
    const wrapped = await wrapAccessBundle({
      recipientPublicKeySpki: recipient.publicKeySpki,
      bundle: {
        schema: 'shippie.document.access-bundle.v1',
        createdAt: '2026-05-11T12:00:00.000Z',
        documents: [{ documentId: 'doc_counter', documentKey: generateDocumentKey() }],
      },
    });

    await expect(
      unwrapAccessBundle({
        recipientPrivateKey: recipient.privateKey,
        wrapped: {
          ...wrapped,
          ciphertext: `${wrapped.ciphertext.startsWith('A') ? 'B' : 'A'}${wrapped.ciphertext.slice(1)}`,
        },
      }),
    ).rejects.toThrow();
  });

  test('uses relay request and bundle endpoints without exposing raw keys', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const recipient = await generateAccessTransferKeyPair();
    const documentKey = generateDocumentKey();
    const transferId = generateAccessTransferId();
    const bundle: DocumentAccessBundle = {
      schema: 'shippie.document.access-bundle.v1',
      createdAt: '2026-05-11T12:00:00.000Z',
      documents: [{ documentId: 'doc_counter', documentKey }],
    };
    const wrapped = await wrapAccessBundle({ recipientPublicKeySpki: recipient.publicKeySpki, bundle });

    const client = createAccessTransferRelayClient({
      origin: 'https://shippie.test',
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        if (String(input).endsWith('/request') && init?.method === 'PUT') {
          return Response.json({ transferId, stored: true, expiresIn: 600 }, { status: 201 });
        }
        if (String(input).endsWith('/request')) {
          return Response.json({
            schema: 'shippie.document.access-transfer-request.v1',
            recipientPublicKey: recipient.publicKeySpki,
            createdAt: '2026-05-11T12:00:00.000Z',
          });
        }
        if (init?.method === 'PUT') {
          return Response.json({ transferId, stored: true, expiresIn: 600 }, { status: 201 });
        }
        return Response.json(wrapped);
      },
    });

    await client.putRequest(transferId, {
      schema: 'shippie.document.access-transfer-request.v1',
      recipientPublicKey: recipient.publicKeySpki,
      createdAt: '2026-05-11T12:00:00.000Z',
    });
    await expect(client.getRequest(transferId)).resolves.toMatchObject({ recipientPublicKey: recipient.publicKeySpki });
    await client.putBundle(transferId, wrapped);
    await expect(client.getBundle(transferId)).resolves.toEqual(wrapped);

    const wireBodies = calls.map((call) => String(call.init?.body ?? '')).join('\n');
    expect(wireBodies).not.toContain(documentKey);
    expect(wireBodies).not.toContain('doc_counter');
  });
});

function event(eventId: string, createdAt: string, n: number): DocumentEvent<{ n: number }> {
  return {
    schema: 'shippie.document.event.v1',
    documentId: 'doc',
    eventId,
    parentIds: [],
    authorDeviceId: 'dev',
    createdAt,
    kind: 'n',
    payload: { n },
  };
}

function encryptedEvent(patch: Partial<EncryptedDocumentEvent>): EncryptedDocumentEvent {
  return {
    schema: 'shippie.document.encrypted-event.v1',
    documentId: 'doc_abc123',
    eventId: 'evt_default',
    parentIds: [],
    authorDeviceId: 'dev_author',
    authorPublicKey: 'pub_key',
    createdAt: '2026-05-11T12:00:00.000Z',
    cipher: 'AES-256-GCM',
    signatureAlg: 'ECDSA-P256-SHA256',
    nonce: 'nonce',
    ciphertext: 'ciphertext',
    ...patch,
  };
}

function openCounterDocument(opts: {
  documentKey: string;
  signing: Awaited<ReturnType<typeof generateDeviceSigningKeyPair>>;
  store: ReturnType<typeof createMemoryDocumentStore> | ReturnType<typeof createLocalStorageDocumentStore>;
  sync?: SealedSyncClient;
  realtime?: boolean | RealtimeSyncOptions;
}) {
  return openDocument<{ count: number }, { amount: number }>({
    documentId: 'doc_counter',
    documentKey: opts.documentKey,
    signing: opts.signing,
    store: opts.store,
    sync: opts.sync,
    realtime: opts.realtime,
    initialState: { count: 0 },
    reducer(state, item) {
      if (item.kind !== 'counter/add') return state;
      return { count: state.count + item.payload.amount };
    },
  });
}

function manualClock() {
  let now = Date.parse('2026-05-11T12:00:00.000Z');
  const timers: Array<{
    at: number;
    active: boolean;
    callback: () => void | Promise<void>;
  }> = [];
  const clock = {
    now: () => now,
    setTimeout(callback: () => void | Promise<void>, delayMs: number) {
      const timer = { at: now + delayMs, active: true, callback };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer: unknown) {
      if (timer && typeof timer === 'object' && 'active' in timer) {
        (timer as { active: boolean }).active = false;
      }
    },
  };

  return {
    clock,
    pendingDelays() {
      return timers.filter((timer) => timer.active).map((timer) => timer.at - now).sort((a, b) => a - b);
    },
    async runNext() {
      const timer = timers.filter((item) => item.active).sort((a, b) => a.at - b.at)[0];
      if (!timer) throw new Error('no manual clock timer scheduled');
      timer.active = false;
      now = timer.at;
      await timer.callback();
    },
  };
}

function fakeCoordinator(leader: boolean): RealtimeSyncCoordinator & { requests: RealtimeSyncReason[] } {
  const requests: RealtimeSyncReason[] = [];
  return {
    requests,
    isLeader: () => leader,
    requestSync: (reason) => {
      requests.push(reason);
    },
    announceSynced: (_status: DocumentSyncStatus) => undefined,
    onSyncRequest: () => () => undefined,
    onSynced: () => () => undefined,
    close: () => undefined,
  };
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}
