import { describe, expect, it } from 'vitest';
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import {
  enforceSealedWriteBudget,
  readSealedAttachment,
  listSealedSnapshots,
  storeSealedAttachment,
  listSealedEvents,
  readSealedDocumentManifest,
  readSealedDocumentChangeHint,
  readSealedDocumentBudgetHealth,
  hasSealedDocumentChanged,
  storeSealedSnapshot,
  storeSealedEventBatch,
  readSealedDocumentHealth,
  storeSealedEvent,
  validateSealedSnapshot,
  validateSealedEvent,
  type EncryptedDocumentEventEnvelope,
  type EncryptedDocumentSnapshotEnvelope,
} from './sealed-cloud';

describe('sealed document cloud storage', () => {
  it('stores opaque encrypted events and lists them by document', async () => {
    const env = fakeEnv();
    const first = event({ eventId: 'evt_a', createdAt: '2026-05-11T12:00:00.000Z' });
    const second = event({ eventId: 'evt_b', createdAt: '2026-05-11T12:00:01.000Z' });

    await expect(storeSealedEvent(env, first.documentId, first)).resolves.toMatchObject({ stored: true });
    await expect(storeSealedEvent(env, second.documentId, second)).resolves.toMatchObject({ stored: true });

    const listed = await listSealedEvents(env, 'doc_abcdef');
    expect(listed.events.map((item) => item.eventId)).toEqual(['evt_a', 'evt_b']);
    expect(JSON.stringify(listed.events)).not.toContain('draft-pick');
    await expect(readSealedDocumentHealth(env, 'doc_abcdef')).resolves.toMatchObject({ lastEventId: 'evt_b' });
    await expect(readSealedDocumentBudgetHealth(env, 'doc_abcdef'))
      .resolves.toMatchObject({
        status: 'healthy',
        events: { used: 2, limit: 20_000 },
      });
  });

  it('summarises sealed copy budget pressure without exposing implementation details', async () => {
    const env = fakeEnv({ SEALED_DOC_DAILY_EVENT_LIMIT: '10', SEALED_DOC_DAILY_BYTE_LIMIT: '1000' });

    for (let i = 0; i < 7; i += 1) {
      await enforceSealedWriteBudget(env, 'doc_abcdef', 10, {
        request: requestFrom('203.0.113.10', `dev_budget_${i}`),
        now: new Date('2026-05-11T12:00:00.000Z'),
      });
    }

    await expect(readSealedDocumentBudgetHealth(env, 'doc_abcdef', {
      now: new Date('2026-05-11T12:30:00.000Z'),
    })).resolves.toMatchObject({
      status: 'watch',
      warnings: expect.arrayContaining(['sync writes is rising quickly today']),
      events: {
        used: 7,
        limit: 10,
        remaining: 3,
        ratio: 0.7,
      },
    });
  });

  it('dedupes the same event key', async () => {
    const env = fakeEnv();
    const item = event({ eventId: 'evt_a', createdAt: '2026-05-11T12:00:00.000Z' });

    await expect(storeSealedEvent(env, item.documentId, item)).resolves.toMatchObject({ stored: true });
    await expect(storeSealedEvent(env, item.documentId, item)).resolves.toMatchObject({ stored: false });
  });

  it('uses object-key cursors instead of R2 continuation tokens for event sync', async () => {
    const env = fakeEnv();
    await storeSealedEvent(env, 'doc_abcdef', event({ eventId: 'evt_a', createdAt: '2026-05-11T12:00:00.000Z' }));
    await storeSealedEvent(env, 'doc_abcdef', event({ eventId: 'evt_b', createdAt: '2026-05-11T12:00:01.000Z' }));

    const firstPage = await listSealedEvents(env, 'doc_abcdef', { limit: 1 });
    expect(firstPage.events.map((item) => item.eventId)).toEqual(['evt_a']);
    expect(firstPage.cursor).toContain('_evt_a.json');
    expect(firstPage.truncated).toBe(true);

    const secondPage = await listSealedEvents(env, 'doc_abcdef', { cursor: firstPage.cursor, limit: 1 });
    expect(secondPage.events.map((item) => item.eventId)).toEqual(['evt_b']);
    expect(secondPage.cursor).toContain('_evt_b.json');
    expect(secondPage.truncated).toBe(false);

    const freshPage = await listSealedEvents(env, 'doc_abcdef', { cursor: secondPage.cursor, limit: 1 });
    expect(freshPage.events).toEqual([]);
    expect(freshPage.cursor).toBe(secondPage.cursor);

    const recovered = await listSealedEvents(env, 'doc_abcdef', { cursor: 'old-r2-continuation-token' });
    expect(recovered.events.map((item) => item.eventId)).toEqual(['evt_a', 'evt_b']);
    expect(recovered.cursor).toContain('_evt_b.json');
  });

  it('stores event batches for faster migration and device restore bursts', async () => {
    const env = fakeEnv();
    const first = event({ eventId: 'evt_batch_a', createdAt: '2026-05-11T12:00:00.000Z' });
    const second = event({ eventId: 'evt_batch_b', createdAt: '2026-05-11T12:00:01.000Z' });

    const stored = await storeSealedEventBatch(env, 'doc_abcdef', [first, second]);
    expect(stored.stored).toBe(2);
    expect(stored.events.map((item) => item.stored)).toEqual([true, true]);

    const listed = await listSealedEvents(env, 'doc_abcdef');
    expect(listed.events.map((item) => item.eventId)).toEqual(['evt_batch_a', 'evt_batch_b']);
  });

  it('keeps batched sealed events immutable when the same batch is retried', async () => {
    const env = fakeEnv();
    const first = event({ eventId: 'evt_retry_a', createdAt: '2026-05-11T12:00:00.000Z' });
    const second = event({ eventId: 'evt_retry_b', createdAt: '2026-05-11T12:00:01.000Z' });

    await expect(storeSealedEventBatch(env, 'doc_abcdef', [first, second])).resolves.toMatchObject({ stored: 2 });
    const retried = await storeSealedEventBatch(env, 'doc_abcdef', [
      { ...first, ciphertext: 'changedciphertext' },
      { ...second, ciphertext: 'changedciphertext' },
    ]);

    expect(retried.stored).toBe(0);
    expect(retried.events.map((item) => item.stored)).toEqual([false, false]);
    const listed = await listSealedEvents(env, 'doc_abcdef');
    expect(listed.events.map((item) => item.ciphertext)).toEqual([first.ciphertext, second.ciphertext]);
  });

  it('stores sealed snapshots and exposes a safe manifest for fast restore', async () => {
    const env = fakeEnv();
    const first = event({ eventId: 'evt_snapshot_base', createdAt: '2026-05-11T12:00:00.000Z' });
    const sealedSnapshot = snapshot({
      snapshotId: 'snap_counter_1',
      lastEventId: first.eventId,
      lastEventCreatedAt: first.createdAt,
      eventCount: 1,
      createdAt: '2026-05-11T12:01:00.000Z',
    });

    await expect(storeSealedEvent(env, first.documentId, first)).resolves.toMatchObject({ stored: true });
    await expect(storeSealedSnapshot(env, sealedSnapshot.documentId, sealedSnapshot)).resolves.toMatchObject({ stored: true });

    const listed = await listSealedSnapshots(env, 'doc_abcdef');
    expect(listed.snapshots.map((item) => item.snapshotId)).toEqual(['snap_counter_1']);
    expect(JSON.stringify(listed.snapshots)).not.toContain('private state');

    const manifest = await readSealedDocumentManifest(env, 'doc_abcdef');
    expect(manifest).toMatchObject({
      eventCount: 1,
      snapshotCount: 1,
      latestEventId: 'evt_snapshot_base',
      latestSnapshotId: 'snap_counter_1',
    });

    const hint = await readSealedDocumentChangeHint(env, 'doc_abcdef');
    expect(hint).toMatchObject({
      schema: 'shippie.document.change-hint.v1',
      documentId: 'doc_abcdef',
      eventCount: 1,
      snapshotCount: 1,
      latestEventId: 'evt_snapshot_base',
      latestSnapshotId: 'snap_counter_1',
    });
    expect(hasSealedDocumentChanged(hint, {
      eventCount: manifest.eventCount,
      snapshotCount: manifest.snapshotCount,
      eventCursor: manifest.latestEventCursor,
      snapshotCursor: manifest.latestSnapshotCursor,
    })).toBe(false);
    expect(hasSealedDocumentChanged(hint, {
      eventCount: 0,
      snapshotCount: manifest.snapshotCount,
    })).toBe(true);
    expect(hasSealedDocumentChanged(hint, {
      eventCount: manifest.eventCount,
      snapshotCount: manifest.snapshotCount,
      eventCursor: 'documents/v0/doc_abcdef/events/different.json',
      snapshotCursor: manifest.latestSnapshotCursor,
    })).toBe(true);
  });

  it('returns only the latest sealed snapshot when requested', async () => {
    const env = fakeEnv();
    await storeSealedSnapshot(env, 'doc_abcdef', snapshot({ snapshotId: 'snap_old', createdAt: '2026-05-11T12:01:00.000Z' }));
    await storeSealedSnapshot(env, 'doc_abcdef', snapshot({ snapshotId: 'snap_new', createdAt: '2026-05-11T12:02:00.000Z' }));

    const latest = await listSealedSnapshots(env, 'doc_abcdef', { latest: true });
    expect(latest.snapshots.map((item) => item.snapshotId)).toEqual(['snap_new']);
  });

  it('charges batched events against write budgets as a batch', async () => {
    const env = fakeEnv({ SEALED_DOC_DAILY_EVENT_LIMIT: '3' });
    const events = [
      event({ eventId: 'evt_batch_a', createdAt: '2026-05-11T12:00:00.000Z' }),
      event({ eventId: 'evt_batch_b', createdAt: '2026-05-11T12:00:01.000Z' }),
      event({ eventId: 'evt_batch_c', createdAt: '2026-05-11T12:00:02.000Z' }),
    ];

    await expect(storeSealedEventBatch(env, 'doc_abcdef', events)).resolves.toMatchObject({ stored: 3 });
    await expect(
      storeSealedEventBatch(env, 'doc_abcdef', [
        event({ eventId: 'evt_batch_d', createdAt: '2026-05-11T12:00:03.000Z' }),
      ]),
    ).rejects.toThrow(/budget/);
  });

  it('rejects plaintext-looking or malformed event envelopes', () => {
    expect(() => validateSealedEvent({ ...event({}), kind: 'draft-pick' })).toThrow(/plaintext field/);
    expect(() => validateSealedEvent({ ...event({}), cipher: 'plaintext' })).toThrow(/cipher/);
    expect(() => validateSealedEvent({ ...event({}), documentId: '../bad' })).toThrow(/document id/);
  });

  it('rejects plaintext-looking or malformed snapshot envelopes', () => {
    expect(() => validateSealedSnapshot({ ...snapshot({}), state: { count: 1 } })).toThrow(/plaintext field/);
    expect(() => validateSealedSnapshot({ ...snapshot({}), cipher: 'plaintext' })).toThrow(/cipher/);
    expect(() => validateSealedSnapshot({ ...snapshot({}), snapshotId: '../bad' })).toThrow(/snapshot id/);
  });

  it('accepts real encrypted event payload sizes while rejecting non-base64url ciphertext', () => {
    expect(() => validateSealedEvent(event({ ciphertext: 'a'.repeat(800) }))).not.toThrow();
    expect(() => validateSealedEvent(event({ ciphertext: 'not base64+url' }))).toThrow(/ciphertext/);
  });

  it('blocks abnormal daily document write volume behind the free user experience', async () => {
    const env = fakeEnv({ SEALED_DOC_DAILY_EVENT_LIMIT: '1' });
    await enforceSealedWriteBudget(env, 'doc_abcdef', 100, {
      request: requestFrom('203.0.113.10'),
      now: new Date('2026-05-11T12:00:00.000Z'),
    });

    await expect(
      enforceSealedWriteBudget(env, 'doc_abcdef', 100, {
        request: requestFrom('203.0.113.10'),
        now: new Date('2026-05-11T12:01:00.000Z'),
      }),
    ).rejects.toThrow(/budget/);
  });

  it('blocks abnormal per-ip write volume across documents', async () => {
    const env = fakeEnv({ SEALED_DOC_IP_DAILY_EVENT_LIMIT: '1' });
    await enforceSealedWriteBudget(env, 'doc_abcdef', 100, {
      request: requestFrom('203.0.113.11'),
      now: new Date('2026-05-11T12:00:00.000Z'),
    });

    await expect(
      enforceSealedWriteBudget(env, 'doc_ghijkl', 100, {
        request: requestFrom('203.0.113.11'),
        now: new Date('2026-05-11T12:01:00.000Z'),
      }),
    ).rejects.toThrow(/budget/);
  });

  it('blocks abnormal per-device write volume across IP changes', async () => {
    const env = fakeEnv({ SEALED_DOC_DEVICE_DAILY_EVENT_LIMIT: '1' });
    await enforceSealedWriteBudget(env, 'doc_abcdef', 100, {
      request: requestFrom('203.0.113.11', 'dev_same'),
      now: new Date('2026-05-11T12:00:00.000Z'),
    });

    await expect(
      enforceSealedWriteBudget(env, 'doc_ghijkl', 100, {
        request: requestFrom('203.0.113.12', 'dev_same'),
        now: new Date('2026-05-11T12:01:00.000Z'),
      }),
    ).rejects.toThrow(/budget/);
  });

  it('stores larger encrypted attachments outside the event log', async () => {
    const env = fakeEnv();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const request = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: bytes,
      headers: {
        'content-type': 'application/octet-stream',
        'cf-connecting-ip': '203.0.113.20',
      },
    });

    const stored = await storeSealedAttachment(env, 'doc_abcdef', 'att_image_1.jpg', request);
    expect(stored).toMatchObject({ stored: true, byteLength: 5 });

    const response = await readSealedAttachment(env, 'doc_abcdef', 'att_image_1.jpg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('x-shippie-sealed-copy')).toBe('1');
  });

  it('preserves intended attachment content type from the sealed client metadata header', async () => {
    const env = fakeEnv();
    const request = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
      headers: {
        'content-type': 'application/octet-stream',
        'x-shippie-attachment-content-type': 'text/plain',
      },
    });

    await storeSealedAttachment(env, 'doc_abcdef', 'att_text_1', request);

    const response = await readSealedAttachment(env, 'doc_abcdef', 'att_text_1');
    expect(response.headers.get('content-type')).toBe('text/plain');
  });


  it('blocks oversized sealed attachments before storage', async () => {
    const env = fakeEnv({ SEALED_DOC_MAX_ATTACHMENT_BYTES: '4' });
    const request = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });

    await expect(
      storeSealedAttachment(env, 'doc_abcdef', 'att_too_large', request),
    ).rejects.toThrow(/attachment too large/);
  });

  it('rejects attachment ids that could create nested paths', async () => {
    const env = fakeEnv();
    const request = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1]),
    });

    await expect(
      storeSealedAttachment(env, 'doc_abcdef', 'folder/att.txt', request),
    ).rejects.toThrow(/attachment id/);
  });

  it('blocks abnormal daily attachment volume per document', async () => {
    const env = fakeEnv({ SEALED_DOC_DAILY_ATTACHMENT_BYTE_LIMIT: '8' });
    const first = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4]),
    });
    const second = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });

    await expect(storeSealedAttachment(env, 'doc_abcdef', 'att_a', first)).resolves.toMatchObject({ stored: true });
    await expect(storeSealedAttachment(env, 'doc_abcdef', 'att_b', second)).rejects.toThrow(/attachment budget/);
  });

  it('blocks abnormal daily attachment volume per device', async () => {
    const env = fakeEnv({ SEALED_DOC_DEVICE_DAILY_ATTACHMENT_BYTE_LIMIT: '8' });
    const first = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4]),
      headers: { 'x-shippie-device-id': 'dev_upload' },
    });
    const second = new Request('https://shippie.test/attachment', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4, 5]),
      headers: { 'x-shippie-device-id': 'dev_upload' },
    });

    await expect(storeSealedAttachment(env, 'doc_abcdef', 'att_a', first)).resolves.toMatchObject({ stored: true });
    await expect(storeSealedAttachment(env, 'doc_ghijkl', 'att_b', second)).rejects.toThrow(/attachment budget/);
  });
});

function event(patch: Partial<EncryptedDocumentEventEnvelope>): EncryptedDocumentEventEnvelope {
  return {
    schema: 'shippie.document.encrypted-event.v1',
    documentId: 'doc_abcdef',
    eventId: 'evt_a',
    parentIds: [],
    authorDeviceId: 'dev_author',
    authorPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEopaque',
    createdAt: '2026-05-11T12:00:00.000Z',
    cipher: 'AES-256-GCM',
    signatureAlg: 'ECDSA-P256-SHA256',
    nonce: 'nonce_123',
    ciphertext: 'ciphertext_456',
    ...patch,
  };
}

function snapshot(patch: Partial<EncryptedDocumentSnapshotEnvelope>): EncryptedDocumentSnapshotEnvelope {
  return {
    schema: 'shippie.document.encrypted-snapshot.v1',
    documentId: 'doc_abcdef',
    snapshotId: 'snap_a',
    authorDeviceId: 'dev_author',
    authorPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEopaque',
    createdAt: '2026-05-11T12:01:00.000Z',
    reducerVersion: 'v1',
    lastEventId: 'evt_a',
    lastEventCreatedAt: '2026-05-11T12:00:00.000Z',
    eventCount: 1,
    cipher: 'AES-256-GCM',
    signatureAlg: 'ECDSA-P256-SHA256',
    nonce: 'nonce_123',
    ciphertext: 'ciphertext_456',
    ...patch,
  };
}

function fakeEnv(extra: Record<string, string> = {}) {
  const r2 = new Map<string, { value: string | Uint8Array; contentType?: string }>();
  const kv = new Map<string, string>();
  return {
    DOCUMENTS: {
      async head(key: string) {
        return r2.has(key) ? ({ key } as never) : null;
      },
      async put(
        key: string,
        value: string | Uint8Array,
        opts?: { httpMetadata?: { contentType?: string }; onlyIf?: { etagDoesNotMatch?: string } },
      ) {
        if (opts?.onlyIf?.etagDoesNotMatch === '*' && r2.has(key)) return null;
        r2.set(key, { value, contentType: opts?.httpMetadata?.contentType });
        return {} as never;
      },
      async get(key: string) {
        const entry = r2.get(key);
        if (!entry) return null;
        const value = entry.value;
        const bodyPart = typeof value === 'string' ? value : value.slice().buffer;
        return {
          body: new Blob([bodyPart]).stream(),
          httpMetadata: entry.contentType ? { contentType: entry.contentType } : undefined,
          text: async () => typeof value === 'string' ? value : new TextDecoder().decode(value),
          writeHttpMetadata(headers: Headers) {
            headers.set('content-type', 'application/octet-stream');
          },
        } as never;
      },
      async list(opts?: { prefix?: string; cursor?: string; limit?: number }) {
        const keys = [...r2.keys()]
          .filter((key) => key.startsWith(opts?.prefix ?? ''))
          .sort();
        return {
          objects: keys.slice(0, opts?.limit ?? keys.length).map((key) => ({ key })),
          truncated: false,
        } as never;
      },
    } as unknown as R2Bucket,
    CACHE: {
      async get(key: string) {
        return kv.get(key) ?? null;
      },
      async put(key: string, value: string) {
        kv.set(key, value);
      },
    } as unknown as KVNamespace,
    ...extra,
  };
}

function requestFrom(ip: string, deviceId?: string): Request {
  const headers: Record<string, string> = { 'cf-connecting-ip': ip };
  if (deviceId) headers['x-shippie-device-id'] = deviceId;
  return new Request('https://shippie.test/api/documents/doc_abcdef/events', {
    headers,
  });
}
