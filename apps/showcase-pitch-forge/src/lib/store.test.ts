import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  addVersion,
  briefFor,
  clearAll,
  insertPitch,
  load,
  newId,
  PITCH_STATUSES,
  removePitch,
  removeSection,
  reorderSections,
  save,
  sectionsFor,
  setIdentity,
  updatePitch,
  upsertBrief,
  upsertSection,
  versionsFor,
  VERSION_CAP,
  type Pitch,
  type Section,
} from './store.ts';
import { snapshot } from './versions.ts';

function memStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, v);
    },
  };
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = memStorage();
});
afterEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = memStorage();
});

function makePitch(over?: Partial<Pitch>): Pitch {
  return {
    id: newId('pitch'),
    type: 'grant',
    title: 'Test pitch',
    target: 'Test foundation',
    deadline: '2026-12-01',
    status: 'drafting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function makeSection(pitchId: string, over?: Partial<Section>): Section {
  return {
    id: newId('sec'),
    pitch_id: pitchId,
    kind: 'problem',
    title: 'Problem',
    body_md: '',
    order: 0,
    ...over,
  };
}

describe('store · load + save round trip', () => {
  test('fresh load returns an empty document', () => {
    const state = load();
    expect(state.pitches).toEqual([]);
    expect(state.sections).toEqual([]);
    expect(state.briefs).toEqual([]);
    expect(state.versions).toEqual([]);
    expect(state.identity).toEqual({ name: '', role: '', org: '', email: '' });
  });

  test('save round-trips a pitch', () => {
    const p = makePitch();
    const sec = makeSection(p.id);
    save({
      pitches: [p],
      sections: [sec],
      briefs: [],
      versions: [],
      identity: { name: 'Devante', role: 'Founder', org: 'Shippie', email: 'd@example.com' },
    });
    const back = load();
    expect(back.pitches).toHaveLength(1);
    expect(back.sections).toHaveLength(1);
    expect(back.identity.name).toBe('Devante');
  });

  test('clearAll removes the document', () => {
    save({ pitches: [makePitch()], sections: [], briefs: [], versions: [], identity: { name: '', role: '', org: '', email: '' } });
    clearAll();
    expect(load().pitches).toEqual([]);
  });
});

describe('store · pitches CRUD', () => {
  test('insertPitch adds with sections', () => {
    const p = makePitch();
    const sec = makeSection(p.id);
    const next = insertPitch(load(), p, [sec]);
    expect(next.pitches).toHaveLength(1);
    expect(next.sections).toHaveLength(1);
  });

  test('updatePitch refreshes updated_at', async () => {
    const p = makePitch();
    let state = insertPitch(load(), p, []);
    const before = state.pitches[0]!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    state = updatePitch(state, p.id, { status: 'sent' });
    expect(state.pitches[0]!.status).toBe('sent');
    expect(state.pitches[0]!.updated_at).not.toBe(before);
  });

  test('removePitch cascades to sections, briefs, versions', () => {
    const p = makePitch();
    const sec = makeSection(p.id);
    let state = insertPitch(load(), p, [sec]);
    state = upsertBrief(state, {
      id: newId('brief'),
      pitch_id: p.id,
      body: 'brief body',
      captured_at: new Date().toISOString(),
    });
    state = addVersion(state, snapshot(p.id, [sec], 'v1'));
    state = removePitch(state, p.id);
    expect(state.pitches).toEqual([]);
    expect(state.sections).toEqual([]);
    expect(state.briefs).toEqual([]);
    expect(state.versions).toEqual([]);
  });

  test('PITCH_STATUSES covers the documented lifecycle', () => {
    expect(PITCH_STATUSES).toEqual(['drafting', 'review', 'sent', 'accepted', 'declined']);
  });
});

describe('store · sections CRUD', () => {
  test('upsertSection adds new', () => {
    const p = makePitch();
    const state = insertPitch(load(), p, []);
    const sec = makeSection(p.id);
    const next = upsertSection(state, sec);
    expect(next.sections).toHaveLength(1);
  });

  test('upsertSection updates by id', () => {
    const p = makePitch();
    const sec = makeSection(p.id, { body_md: 'first' });
    let state = insertPitch(load(), p, [sec]);
    state = upsertSection(state, { ...sec, body_md: 'second' });
    expect(state.sections[0]!.body_md).toBe('second');
    expect(state.sections).toHaveLength(1);
  });

  test('removeSection removes only the matching id', () => {
    const p = makePitch();
    const a = makeSection(p.id, { id: 'sa' });
    const b = makeSection(p.id, { id: 'sb' });
    let state = insertPitch(load(), p, [a, b]);
    state = removeSection(state, 'sa');
    expect(state.sections.map((s) => s.id)).toEqual(['sb']);
  });

  test('reorderSections reassigns order', () => {
    const p = makePitch();
    const a = makeSection(p.id, { id: 'sa', order: 0 });
    const b = makeSection(p.id, { id: 'sb', order: 1 });
    const c = makeSection(p.id, { id: 'sc', order: 2 });
    let state = insertPitch(load(), p, [a, b, c]);
    state = reorderSections(state, p.id, ['sc', 'sa', 'sb']);
    const ordered = sectionsFor(state, p.id);
    expect(ordered.map((s) => s.id)).toEqual(['sc', 'sa', 'sb']);
  });
});

describe('store · briefs', () => {
  test('upsertBrief adds and replaces by pitch_id', () => {
    const p = makePitch();
    let state = insertPitch(load(), p, []);
    const b1 = { id: 'b1', pitch_id: p.id, body: 'first', captured_at: new Date().toISOString() };
    state = upsertBrief(state, b1);
    expect(briefFor(state, p.id)?.body).toBe('first');
    const b2 = { ...b1, body: 'second' };
    state = upsertBrief(state, b2);
    expect(state.briefs).toHaveLength(1);
    expect(briefFor(state, p.id)?.body).toBe('second');
  });
});

describe('store · versions', () => {
  test('addVersion stores a snapshot', () => {
    const p = makePitch();
    const sec = makeSection(p.id);
    let state = insertPitch(load(), p, [sec]);
    state = addVersion(state, snapshot(p.id, [sec], 'v1'));
    expect(versionsFor(state, p.id)).toHaveLength(1);
  });

  test('addVersion caps history per pitch', () => {
    const p = makePitch();
    const sec = makeSection(p.id);
    let state = insertPitch(load(), p, [sec]);
    for (let i = 0; i < VERSION_CAP + 5; i++) {
      state = addVersion(state, snapshot(p.id, [sec], `v${i}`));
    }
    expect(versionsFor(state, p.id).length).toBe(VERSION_CAP);
  });
});

describe('store · identity', () => {
  test('setIdentity replaces the whole identity record', () => {
    let state = load();
    state = setIdentity(state, {
      name: 'Devante',
      role: 'Founder',
      org: 'Shippie',
      email: 'd@example.com',
    });
    expect(state.identity.name).toBe('Devante');
    expect(state.identity.email).toBe('d@example.com');
  });
});
