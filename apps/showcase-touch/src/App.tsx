import { useCallback, useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { resolveLocalDb } from './db/runtime.ts';
import {
  archivePerson,
  completeTask,
  createPerson,
  createTag,
  createTask,
  deletePerson,
  deleteTag,
  ensureSchema,
  listPeople,
  listPersonTagLinks,
  listTags,
  listTasks,
  listTasksFor,
  listTouches,
  listTouchesFor,
  logTouch,
  reopenTask,
  setPersonTags,
  updatePerson,
} from './lib/store.ts';
import type {
  Person,
  PersonTag,
  Sentiment,
  Tag,
  Task,
  Touch,
  TouchKind,
} from './db/schema.ts';
import { LogTouchSheet } from './components/LogTouchSheet.tsx';
import { People } from './pages/People.tsx';
import { Person as PersonPage } from './pages/Person.tsx';
import { Today } from './pages/Today.tsx';
import { Review } from './pages/Review.tsx';
import { Tags } from './pages/Tags.tsx';
import { Settings } from './pages/Settings.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_touch' });

type Tab = 'today' | 'people' | 'review' | 'tags' | 'settings';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'people', label: 'People' },
  { id: 'review', label: 'Review' },
  { id: 'tags', label: 'Tags' },
  { id: 'settings', label: 'Settings' },
];

interface TouchHint {
  kind: TouchKind;
  summary: string;
}

interface Screen {
  tab: Tab;
  personId: string | null;
}

function sameScreen(a: Screen, b: Screen): boolean {
  return a.tab === b.tab && a.personId === b.personId;
}

export function App() {
  const db = useMemo(() => resolveLocalDb(), []);
  const [tab, setTab] = useState<Tab>('today');
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Screen>(
        { tab: 'today', personId: null },
        (next) => {
          setTab(next.tab);
          setOpenPersonId(next.personId);
        },
        { isEqual: sameScreen },
      ),
    [],
  );
  const [people, setPeople] = useState<Person[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tagList, setTagList] = useState<Tag[]>([]);
  const [personTagLinks, setPersonTagLinks] = useState<PersonTag[]>([]);
  const [logging, setLogging] = useState<{ personId: string; hint?: TouchHint } | null>(null);
  const [crossAppPrompt, setCrossAppPrompt] = useState<TouchHint | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [pp, tt, tk, tg, pl] = await Promise.all([
      listPeople(db),
      listTouches(db),
      listTasks(db),
      listTags(db),
      listPersonTagLinks(db),
    ]);
    setPeople(pp);
    setTouches(tt);
    setTasks(tk);
    setTagList(tg);
    setPersonTagLinks(pl);
  }, [db]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigateTab(next: Tab): void {
    void localNavigation.navigate({ tab: next, personId: null }, { kind: 'crossfade' });
  }

  function openPersonById(id: string): void {
    void localNavigation.navigate({ tab, personId: id }, { kind: 'rise' });
  }

  function closePerson(): void {
    void localNavigation.backOrReplace({ tab, personId: null }, { kind: 'crossfade' });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSchema(db);
      // Seed a starter set the first time the device is empty so the
      // experience is immediately legible. Five names across a few tags.
      const existing = await listPeople(db);
      if (existing.length === 0) {
        const inner = await createTag(db, 'inner-circle');
        const advisor = await createTag(db, 'advisor');
        const past = await createTag(db, 'past-client');
        const friend = await createTag(db, 'industry-friend');

        const ada = await createPerson(db, {
          name: 'Ada Marston',
          role: 'CTO',
          company: 'Lighthouse',
          cadence_days: 30,
          notes_md: 'Met at the off-site. Said yes to a quarterly catch-up.',
        });
        const ben = await createPerson(db, {
          name: 'Ben Okafor',
          role: 'Advisor',
          company: 'Independent',
          cadence_days: 60,
          notes_md: 'Investor-friend. Best over coffee, not Zoom.',
        });
        const cy = await createPerson(db, {
          name: 'Cy Ramirez',
          role: 'Founder',
          company: 'Tilde',
          cadence_days: 60,
          notes_md: 'Past client. Always has interesting hires-needs.',
        });
        const dee = await createPerson(db, {
          name: 'Dee Pham',
          role: 'PM',
          company: 'Westwood',
          cadence_days: 90,
        });
        const eli = await createPerson(db, {
          name: 'Eli Vance',
          role: 'Designer',
          company: 'Foundry',
          cadence_days: 90,
        });

        await setPersonTags(db, ada.id, [inner.id]);
        await setPersonTags(db, ben.id, [advisor.id, inner.id]);
        await setPersonTags(db, cy.id, [past.id]);
        await setPersonTags(db, dee.id, [past.id, friend.id]);
        await setPersonTags(db, eli.id, [friend.id]);
      }
      if (!cancelled) {
        await refresh();
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refresh]);

  // Subscribe to coffee-brewed and dined-out. We don't auto-log — we
  // surface a small confirm prompt at the top of People asking which
  // person to attribute it to. The user always confirms before any
  // touch is written.
  useEffect(() => {
    if (!ready) return;
    const offCoffee = shippie.intent.subscribe('coffee-brewed', ({ rows }) => {
      const row = rows[0] as
        | { method?: string; bean_name?: string; weight_g?: number }
        | undefined;
      if (!row) return;
      const summary = row.bean_name
        ? `Coffee — ${row.method ?? ''} ${row.bean_name}`.trim()
        : 'Coffee meet-up';
      setCrossAppPrompt({ kind: 'coffee', summary });
    });
    const offDined = shippie.intent.subscribe('dined-out', ({ rows }) => {
      const row = rows[0] as { restaurant?: string; note?: string } | undefined;
      if (!row) return;
      const summary = row.restaurant
        ? `Dinner at ${row.restaurant}`
        : row.note ?? 'Dined out — log who you were with?';
      setCrossAppPrompt({ kind: 'event', summary });
    });
    return () => {
      offCoffee();
      offDined();
    };
  }, [ready]);

  function broadcastTouch(touch: Touch, person: Person | null): void {
    shippie.intent.broadcast('touch-logged', [
      {
        person_id: touch.person_id,
        person_name: person?.name ?? null,
        kind: touch.kind,
        summary: touch.summary,
        sentiment: touch.sentiment,
        happened_at: touch.happened_at,
      },
    ]);
  }

  async function handleLogTouchSubmit(input: {
    kind: TouchKind;
    summary: string;
    sentiment: Sentiment;
    link_url: string | null;
  }) {
    if (!logging) return;
    const touch = await logTouch(db, {
      person_id: logging.personId,
      kind: input.kind,
      summary: input.summary,
      sentiment: input.sentiment,
      link_url: input.link_url,
    });
    const person = people.find((p) => p.id === logging.personId) ?? null;
    broadcastTouch(touch, person);
    shippie.feel?.texture?.('confirm');
    setLogging(null);
    setCrossAppPrompt(null);
    await refresh();
  }

  async function handleAddPerson() {
    const name = prompt('Their name?')?.trim();
    if (!name) return;
    await createPerson(db, { name });
    await refresh();
  }

  async function handleUpdatePerson(id: string, patch: Partial<Person>) {
    await updatePerson(db, id, patch);
    await refresh();
  }

  async function handleDeletePerson(id: string) {
    if (!confirm('Delete this person and all their touches/tasks?')) return;
    await deletePerson(db, id);
    void localNavigation.replace({ tab, personId: null }, { kind: 'crossfade' });
    await refresh();
  }

  async function handleToggleTask(id: string, done: boolean) {
    if (done) await completeTask(db, id);
    else await reopenTask(db, id);
    await refresh();
  }

  async function handleAddTask(personId: string, body: string, due_at: string | null) {
    await createTask(db, { person_id: personId, body, due_at });
    await refresh();
  }

  async function handleToggleTag(personId: string, tagId: string) {
    const current = personTagLinks.filter((l) => l.person_id === personId).map((l) => l.tag_id);
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    await setPersonTags(db, personId, next);
    await refresh();
  }

  async function handleCreateTag(label: string) {
    await createTag(db, label);
    await refresh();
  }

  async function handleDeleteTag(id: string) {
    if (!confirm('Delete this tag?')) return;
    await deleteTag(db, id);
    await refresh();
  }

  const openPerson = openPersonId ? people.find((p) => p.id === openPersonId) ?? null : null;
  const openPersonTouches = useMemo(
    () => (openPerson ? touches.filter((t) => t.person_id === openPerson.id).sort((a, b) => (a.happened_at < b.happened_at ? 1 : -1)) : []),
    [openPerson, touches],
  );
  const openPersonTasks = useMemo(
    () =>
      openPerson
        ? tasks
            .filter((t) => t.person_id === openPerson.id)
            .sort((a, b) => {
              if (Boolean(a.done_at) !== Boolean(b.done_at)) return a.done_at ? 1 : -1;
              return new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime();
            })
        : [],
    [openPerson, tasks],
  );
  const openPersonSelectedTagIds = useMemo(
    () =>
      openPerson
        ? personTagLinks.filter((l) => l.person_id === openPerson.id).map((l) => l.tag_id)
        : [],
    [openPerson, personTagLinks],
  );

  const tagCount = useCallback(
    (tagId: string) => personTagLinks.filter((l) => l.tag_id === tagId).length,
    [personTagLinks],
  );

  if (!ready) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Touch</h1>
          <p className="subtitle">your rolodex stays yours</p>
        </header>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Touch</h1>
        <p className="subtitle">your rolodex stays yours</p>
      </header>

      {!openPerson ? (
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={t.id === tab}
              className={`tab ${t.id === tab ? 'active' : ''}`}
              onClick={() => navigateTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {!openPerson && crossAppPrompt ? (
        <div className="card cross-app-prompt">
          <h3>Log a touch?</h3>
          <p className="small">{crossAppPrompt.summary}</p>
          <p className="muted small">Pick a person and we'll attribute it.</p>
          <div className="tag-list">
            {people
              .filter((p) => !p.archived)
              .slice(0, 6)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="tag-pick"
                  onClick={() =>
                    setLogging({
                      personId: p.id,
                      hint: crossAppPrompt,
                    })
                  }
                >
                  {p.name}
                </button>
              ))}
            <button
              type="button"
              className="tag-pick"
              onClick={() => setCrossAppPrompt(null)}
            >
              dismiss
            </button>
          </div>
        </div>
      ) : null}

      {openPerson ? (
        <PersonPage
          person={openPerson}
          touches={openPersonTouches}
          tasks={openPersonTasks}
          tags={tagList}
          selectedTagIds={openPersonSelectedTagIds}
          onBack={closePerson}
          onLogTouch={() => setLogging({ personId: openPerson.id })}
          onUpdate={(patch) => handleUpdatePerson(openPerson.id, patch)}
          onDelete={() => handleDeletePerson(openPerson.id)}
          onToggleTask={handleToggleTask}
          onAddTask={(body, due_at) => handleAddTask(openPerson.id, body, due_at)}
          onToggleTag={(tagId) => handleToggleTag(openPerson.id, tagId)}
          onCreateTag={handleCreateTag}
        />
      ) : tab === 'today' ? (
        <Today
          people={people}
          tasks={tasks}
          tags={tagList}
          personTagLinks={personTagLinks}
          onOpen={openPersonById}
          onToggleTask={handleToggleTask}
        />
      ) : tab === 'people' ? (
        <People
          people={people}
          tags={tagList}
          personTagLinks={personTagLinks}
          onOpen={openPersonById}
          onAddPerson={handleAddPerson}
        />
      ) : tab === 'review' ? (
        <Review
          people={people}
          touches={touches}
          tasks={tasks}
          onOpen={openPersonById}
          onToggleTask={handleToggleTask}
        />
      ) : tab === 'tags' ? (
        <Tags
          tags={tagList}
          countFor={tagCount}
          onCreate={handleCreateTag}
          onDelete={handleDeleteTag}
        />
      ) : (
        <Settings people={people} touches={touches} />
      )}

      {logging ? (
        <LogTouchSheet
          personName={people.find((p) => p.id === logging.personId)?.name ?? ''}
          kindHint={logging.hint?.kind}
          summaryHint={logging.hint?.summary}
          onCancel={() => setLogging(null)}
          onSubmit={handleLogTouchSubmit}
        />
      ) : null}
    </div>
  );
}
