import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { WorkspaceStore } from './workspace-store';

// node:sqlite is a Node built-in (Node 22+). The SvelteKit/Vite resolver
// rewrites a static `import 'node:sqlite'` to a bare `sqlite` specifier and
// fails to load it, so we pull it through Node's own require — bypassing the
// bundler entirely. Production code (the DO) never touches this; only the
// Node-side unit test does.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

function store() {
  const db = new DatabaseSync(':memory:');
  const exec = {
    run: (sql: string, ...a: unknown[]) => {
      db.prepare(sql).run(...(a as never[]));
    },
    all: <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[])) as T[],
  };
  const s = new WorkspaceStore(exec);
  s.init();
  return s;
}

const ev = (id: string) => ({
  clientEventId: id,
  type: 'feedback.created',
  instanceId: 'i1',
  actorUserId: 'u1',
  deviceId: 'd1',
  createdOfflineAt: '2026-06-07T00:00:00Z',
  schemaVersion: 1,
  payload: { got: true },
});
const RECEIVED = 1_717_800_000_000; // server receipt time, injected (≠ createdOfflineAt)

describe('WorkspaceStore', () => {
  it('migrates workspace_schema_version to the current version on init', () => {
    expect(store().schemaVersion()).toBe(2);
  });
  it('appends an event and reads it back', () => {
    const s = store();
    s.appendEvent(ev('c1'), RECEIVED);
    expect(s.listEvents().map((e) => e.clientEventId)).toEqual(['c1']);
  });
  it('is append-only and dedupes by clientEventId', () => {
    const s = store();
    s.appendEvent(ev('c1'), RECEIVED);
    s.appendEvent(ev('c1'), RECEIVED);
    expect(s.listEvents()).toHaveLength(1);
  });
  it('audits with SERVER receipt time, not the client event time', () => {
    const s = store();
    s.appendEvent(ev('c1'), RECEIVED);
    const row = s.listAudit().find((a) => a.action === 'event.appended');
    expect(row?.at).toBe(RECEIVED); // server receipt, not Date.parse(createdOfflineAt)
    expect(row?.at).not.toBe(Date.parse('2026-06-07T00:00:00Z'));
  });
});
