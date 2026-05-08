/**
 * Touch — store layer over local-db.
 *
 * CRUD across the five tables, plus the small composite operations the
 * UI needs (e.g. logTouch which writes a touches row + updates the
 * person's last_touch_at + recomputes next_touch_at).
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  PEOPLE_TABLE,
  PERSON_TAGS_TABLE,
  TAGS_TABLE,
  TASKS_TABLE,
  TOUCHES_TABLE,
  peopleSchema,
  personTagsSchema,
  tagsSchema,
  tasksSchema,
  touchesSchema,
  type Person,
  type PersonTag,
  type Tag,
  type Task,
  type Touch,
  type TouchKind,
  type Sentiment,
} from '../db/schema.ts';
import { computeNextTouchAt } from './next-touch.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(PEOPLE_TABLE, peopleSchema);
      await db.create(TOUCHES_TABLE, touchesSchema);
      await db.create(TAGS_TABLE, tagsSchema);
      await db.create(PERSON_TAGS_TABLE, personTagsSchema);
      await db.create(TASKS_TABLE, tasksSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type CreatePersonInput = Partial<Omit<Person, 'id' | 'created_at'>> & { name: string };

export async function listPeople(db: ShippieLocalDb): Promise<Person[]> {
  await ensureSchema(db);
  return db.query<RowOf<Person>>(PEOPLE_TABLE);
}

export async function getPerson(db: ShippieLocalDb, id: string): Promise<Person | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Person>>(PEOPLE_TABLE, { where: { id }, limit: 1 });
  return rows[0] ?? null;
}

export async function createPerson(db: ShippieLocalDb, input: CreatePersonInput): Promise<Person> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const row: Person = {
    id: newId('p'),
    name: input.name,
    role: input.role ?? null,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    notes_md: input.notes_md ?? null,
    cadence_days: input.cadence_days ?? null,
    last_touch_at: input.last_touch_at ?? null,
    next_touch_at: input.next_touch_at ?? null,
    photo_url: input.photo_url ?? null,
    archived: input.archived ?? 0,
    created_at: now,
  };
  await db.insert(PEOPLE_TABLE, asRow(row));
  return row;
}

export async function updatePerson(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Person, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Person>>(PEOPLE_TABLE, id, asRow(patch));
}

export async function archivePerson(db: ShippieLocalDb, id: string): Promise<void> {
  await updatePerson(db, id, { archived: 1 });
}

export async function deletePerson(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(PEOPLE_TABLE, id);
  // Cascade: drop touches, person-tags, tasks for this person.
  for (const t of await db.query<RowOf<Touch>>(TOUCHES_TABLE, { where: { person_id: id } })) {
    await db.delete(TOUCHES_TABLE, t.id);
  }
  for (const t of await db.query<RowOf<PersonTag>>(PERSON_TAGS_TABLE, { where: { person_id: id } })) {
    await db.delete(PERSON_TAGS_TABLE, t.id);
  }
  for (const t of await db.query<RowOf<Task>>(TASKS_TABLE, { where: { person_id: id } })) {
    await db.delete(TASKS_TABLE, t.id);
  }
}

// ---------------------------------------------------------------------------
// Touches
// ---------------------------------------------------------------------------

export interface LogTouchInput {
  person_id: string;
  kind: TouchKind;
  summary?: string;
  link_url?: string | null;
  sentiment?: Sentiment;
  happened_at?: string;
}

export async function listTouches(db: ShippieLocalDb): Promise<Touch[]> {
  await ensureSchema(db);
  return db.query<RowOf<Touch>>(TOUCHES_TABLE);
}

export async function listTouchesFor(db: ShippieLocalDb, personId: string): Promise<Touch[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Touch>>(TOUCHES_TABLE, { where: { person_id: personId } });
  return rows.sort((a, b) => (a.happened_at < b.happened_at ? 1 : -1));
}

/**
 * Composite operation. Records the touch row, updates the person's
 * last_touch_at, and recomputes their next_touch_at from the cadence.
 */
export async function logTouch(db: ShippieLocalDb, input: LogTouchInput): Promise<Touch> {
  await ensureSchema(db);
  const happened_at = input.happened_at ?? new Date().toISOString();
  const row: Touch = {
    id: newId('t'),
    person_id: input.person_id,
    kind: input.kind,
    happened_at,
    summary: input.summary ?? '',
    link_url: input.link_url ?? null,
    sentiment: input.sentiment ?? '0',
  };
  await db.insert(TOUCHES_TABLE, asRow(row));
  const person = await getPerson(db, input.person_id);
  if (person) {
    const next = computeNextTouchAt(happened_at, person.cadence_days);
    await updatePerson(db, person.id, {
      last_touch_at: happened_at,
      next_touch_at: next,
    });
  }
  return row;
}

export async function deleteTouch(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(TOUCHES_TABLE, id);
}

// ---------------------------------------------------------------------------
// Tags + person_tags
// ---------------------------------------------------------------------------

export async function listTags(db: ShippieLocalDb): Promise<Tag[]> {
  await ensureSchema(db);
  return db.query<RowOf<Tag>>(TAGS_TABLE);
}

export async function createTag(db: ShippieLocalDb, label: string): Promise<Tag> {
  await ensureSchema(db);
  const trimmed = label.trim();
  if (!trimmed) throw new Error('Tag label is required.');
  const existing = (await listTags(db)).find(
    (t) => t.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing;
  const tag: Tag = { id: newId('tag'), label: trimmed };
  await db.insert(TAGS_TABLE, asRow(tag));
  return tag;
}

export async function deleteTag(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(TAGS_TABLE, id);
  for (const link of await db.query<RowOf<PersonTag>>(PERSON_TAGS_TABLE, { where: { tag_id: id } })) {
    await db.delete(PERSON_TAGS_TABLE, link.id);
  }
}

export async function listPersonTagLinks(db: ShippieLocalDb): Promise<PersonTag[]> {
  await ensureSchema(db);
  return db.query<RowOf<PersonTag>>(PERSON_TAGS_TABLE);
}

export async function setPersonTags(
  db: ShippieLocalDb,
  personId: string,
  tagIds: ReadonlyArray<string>,
): Promise<void> {
  await ensureSchema(db);
  const links = await db.query<RowOf<PersonTag>>(PERSON_TAGS_TABLE, {
    where: { person_id: personId },
  });
  const want = new Set(tagIds);
  for (const link of links) {
    if (!want.has(link.tag_id)) {
      await db.delete(PERSON_TAGS_TABLE, link.id);
    } else {
      want.delete(link.tag_id);
    }
  }
  for (const tagId of want) {
    const link: PersonTag = { id: newId('pt'), person_id: personId, tag_id: tagId };
    await db.insert(PERSON_TAGS_TABLE, asRow(link));
  }
}

export async function tagsForPerson(
  db: ShippieLocalDb,
  personId: string,
  allTags?: Tag[],
): Promise<Tag[]> {
  await ensureSchema(db);
  const links = await db.query<RowOf<PersonTag>>(PERSON_TAGS_TABLE, {
    where: { person_id: personId },
  });
  const tags = allTags ?? (await listTags(db));
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  return links
    .map((l) => tagMap.get(l.tag_id))
    .filter((t): t is Tag => Boolean(t));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(db: ShippieLocalDb): Promise<Task[]> {
  await ensureSchema(db);
  return db.query<RowOf<Task>>(TASKS_TABLE);
}

export async function listTasksFor(db: ShippieLocalDb, personId: string): Promise<Task[]> {
  await ensureSchema(db);
  return db.query<RowOf<Task>>(TASKS_TABLE, { where: { person_id: personId } });
}

export interface CreateTaskInput {
  person_id: string;
  body: string;
  due_at?: string | null;
}

export async function createTask(db: ShippieLocalDb, input: CreateTaskInput): Promise<Task> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const row: Task = {
    id: newId('task'),
    person_id: input.person_id,
    body: input.body,
    due_at: input.due_at ?? null,
    done_at: null,
    created_at: now,
  };
  await db.insert(TASKS_TABLE, asRow(row));
  return row;
}

export async function completeTask(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Task>>(TASKS_TABLE, id, asRow({ done_at: new Date().toISOString() }));
}

export async function reopenTask(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Task>>(TASKS_TABLE, id, asRow({ done_at: null }));
}

export async function deleteTask(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(TASKS_TABLE, id);
}
