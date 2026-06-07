import { describe, it, expect } from 'vitest';
import { fetchNormalisedRoster } from '@shippie/cloudlet-contract';
import { ManualImportAdapter, CsvAdapter } from './roster-adapters';
import { WondeAdapter } from './wonde-adapter';
import type { FetchLike } from './wonde-adapter';
import { WONDE_STUDENTS, WONDE_CLASSES, WONDE_EMPLOYEES } from './wonde-fixture';

describe('ManualImportAdapter', () => {
  it('normalises hand-entered classes + pupils + flags', async () => {
    const a = new ManualImportAdapter([
      {
        className: '4M',
        yearGroup: 'Year 4',
        room: 'R12',
        pupils: [
          { name: 'Aisha Khan', send: true },
          { name: 'Darius Okafor', eal: true },
        ],
      },
    ]);
    expect(a.isConfigured()).toBe(true);
    const roster = await fetchNormalisedRoster(a);
    expect(roster.classes).toHaveLength(1);
    expect(roster.pupils).toHaveLength(2);
    expect(roster.memberships).toHaveLength(2);
    const aisha = roster.pupils.find((p) => p.name === 'Aisha Khan')!;
    expect(aisha.send).toBe(true);
    expect(aisha.initials).toBe('AK');
    expect(aisha.sourceId).toBe('4M:Aisha Khan');
  });
});

describe('CsvAdapter', () => {
  it('parses a CSV through the adapter interface + surfaces row errors', async () => {
    const a = new CsvAdapter('Pupil,Class,SEND\nSam Lee,6T,Y\n,6T');
    expect(a.isConfigured()).toBe(true);
    const roster = await fetchNormalisedRoster(a);
    expect(roster.pupils).toHaveLength(1);
    expect(a.errors.some((e) => /missing pupil name/.test(e.message))).toBe(true);
  });

  it('an empty CSV is not configured', () => {
    expect(new CsvAdapter('   ').isConfigured()).toBe(false);
  });
});

// A fixture fetch that routes Wonde resource URLs to the mocked responses.
function fixtureFetch(): FetchLike {
  return async (url: string) => {
    let body: unknown = { data: [], meta: { pagination: { next: null } } };
    if (url.includes('/students')) body = WONDE_STUDENTS;
    else if (url.includes('/classes')) body = WONDE_CLASSES;
    else if (url.includes('/employees')) body = WONDE_EMPLOYEES;
    return { ok: true, status: 200, json: async () => body };
  };
}

describe('WondeAdapter — GATING', () => {
  it('is NOT configured without an API key (never crashes, returns [])', async () => {
    const a = new WondeAdapter({ apiKey: null, schoolId: 'SCH1', fetch: fixtureFetch() });
    expect(a.isConfigured()).toBe(false);
    expect(await a.fetchPupils()).toEqual([]);
    expect(await a.fetchClasses()).toEqual([]);
  });

  it('is NOT configured without a school id', () => {
    expect(new WondeAdapter({ apiKey: 'k', schoolId: null, fetch: fixtureFetch() }).isConfigured()).toBe(false);
  });

  it('is configured with key + school id + fetch', () => {
    expect(new WondeAdapter({ apiKey: 'k', schoolId: 'SCH1', fetch: fixtureFetch() }).isConfigured()).toBe(true);
  });
});

describe('WondeAdapter — mapping against the mocked fixture', () => {
  const adapter = () => new WondeAdapter({ apiKey: 'test-key', schoolId: 'SCH1', fetch: fixtureFetch() });

  it('maps students with SEND/EAL/FSM from extended_details', async () => {
    const pupils = await adapter().fetchPupils();
    expect(pupils).toHaveLength(3);
    const aisha = pupils.find((p) => p.sourceId === 'A100')!; // UPN preferred over Wonde id
    expect(aisha.name).toBe('Aisha Khan');
    expect(aisha.send).toBe(true); // sen_status 'K'
    expect(aisha.eal).toBe(false);
    expect(aisha.fsm).toBe(true);
    const leo = pupils.find((p) => p.sourceId === 'A102')!;
    expect(leo.send).toBe(true); // sen_status 'E' (EHC plan)
  });

  it('maps classes with year group', async () => {
    const classes = await adapter().fetchClasses();
    expect(classes).toHaveLength(2);
    const fourM = classes.find((c) => c.name === '4M')!;
    expect(fourM.yearGroup).toBe('Year 4');
  });

  it('maps memberships resolving Wonde ids to UPN source ids', async () => {
    const memberships = await adapter().fetchMemberships();
    expect(memberships).toHaveLength(3);
    expect(memberships).toContainEqual({ classSourceId: 'C9000001', pupilSourceId: 'A100' });
  });

  it('maps staff with email', async () => {
    const staff = await adapter().fetchStaff();
    expect(staff).toHaveLength(1);
    expect(staff[0]?.email).toBe('p.mistry@greenfield.sch.uk');
  });

  it('degrades to [] on a non-OK response (never blocks a pilot)', async () => {
    const failing: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const a = new WondeAdapter({ apiKey: 'k', schoolId: 'S', fetch: failing });
    expect(await a.fetchPupils()).toEqual([]);
  });
});
