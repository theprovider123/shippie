import { useMemo } from 'react';
import { PersonCard } from '../components/PersonCard.tsx';
import type { Person, PersonTag, Tag, Task } from '../db/schema.ts';
import { read } from '../lib/next-touch.ts';

interface Props {
  people: Person[];
  tasks: Task[];
  tags: Tag[];
  personTagLinks: PersonTag[];
  onOpen: (personId: string) => void;
  onToggleTask: (taskId: string, done: boolean) => void;
}

const MS_PER_DAY = 86_400_000;

export function Today({ people, tasks, tags, personTagLinks, onOpen, onToggleTask }: Props) {
  const tagsForPerson = useMemo(() => {
    const map = new Map<string, Tag[]>();
    const tagById = new Map(tags.map((t) => [t.id, t]));
    for (const link of personTagLinks) {
      const tag = tagById.get(link.tag_id);
      if (!tag) continue;
      const list = map.get(link.person_id) ?? [];
      list.push(tag);
      map.set(link.person_id, list);
    }
    return map;
  }, [tags, personTagLinks]);

  const overdue = useMemo(() => {
    return people
      .filter((p) => !p.archived)
      .map((p) => ({ p, r: read(p.last_touch_at, p.cadence_days) }))
      .filter(({ r }) => r.band === 'overdue')
      .sort((a, b) => a.r.daysUntil - b.r.daysUntil)
      .map(({ p }) => p);
  }, [people]);

  const dueToday = useMemo(() => {
    const now = Date.now();
    return tasks
      .filter((t) => !t.done_at)
      .filter((t) => {
        if (!t.due_at) return false;
        const due = new Date(t.due_at).getTime();
        if (Number.isNaN(due)) return false;
        return due <= now + MS_PER_DAY;
      })
      .sort((a, b) => new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime());
  }, [tasks]);

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Today</h2>
      </div>
      <p className="muted small">What you'd do this morning if you actually got around to it.</p>

      <div className="card">
        <h3>Overdue follow-ups</h3>
        {overdue.length === 0 ? (
          <p className="muted small">Nothing overdue. Catch your breath.</p>
        ) : (
          <div className="person-list">
            {overdue.slice(0, 8).map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                tags={tagsForPerson.get(p.id) ?? []}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Promises due</h3>
        {dueToday.length === 0 ? (
          <p className="muted small">Nothing due today. Good.</p>
        ) : (
          <div>
            {dueToday.map((t) => {
              const person = personById.get(t.person_id);
              return (
                <div className="task-row" key={t.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(t.done_at)}
                    onChange={() => onToggleTask(t.id, !t.done_at)}
                    aria-label="Toggle task"
                  />
                  <div className="body">
                    {t.body}
                    {person ? (
                      <button
                        type="button"
                        onClick={() => onOpen(person.id)}
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: '#7E7570',
                          padding: 0,
                          marginLeft: 6,
                          cursor: 'pointer',
                        }}
                      >
                        · {person.name}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
