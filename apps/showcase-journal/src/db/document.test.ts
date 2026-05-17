import { describe, expect, it } from 'bun:test';
import type { DocumentEvent } from '@shippie/doc';
import { reduceJournalDocument, type JournalDocumentPayload, type JournalDocumentState } from './document.ts';

function event(
  payload: JournalDocumentPayload,
  createdAt = '2026-05-11T10:00:00.000Z',
): DocumentEvent<JournalDocumentPayload> {
  return {
    schema: 'shippie.document.event.v1',
    documentId: 'journal_entries_v1',
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    parentIds: [],
    authorDeviceId: 'dev_test',
    createdAt,
    kind: 'test',
    payload,
  };
}

describe('journal document reducer', () => {
  it('rebuilds entries from a legacy snapshot', () => {
    const state = reduceJournalDocument(empty(), event({
      type: 'legacy-snapshot',
      source: 'local-db',
      entries: [{ id: 'a', body: 'first', embedding: [0.1, 0.2] }],
    }));

    expect(state.entries.a?.body).toBe('first');
    expect(state.entries.a?.embedding).toEqual([0.1, 0.2]);
  });

  it('upserts and deletes deterministically', () => {
    let state = empty();
    state = reduceJournalDocument(state, event({ type: 'entry-upsert', entry: { id: 'a', body: 'draft' } }));
    state = reduceJournalDocument(state, event({ type: 'entry-upsert', entry: { id: 'a', body: 'final' } }));
    state = reduceJournalDocument(state, event({ type: 'entry-delete', id: 'a' }));

    expect(state.entries.a).toBeUndefined();
    expect(state.deletedIds).toEqual(['a']);
  });
});

function empty(): JournalDocumentState {
  return { entries: {}, deletedIds: [] };
}
