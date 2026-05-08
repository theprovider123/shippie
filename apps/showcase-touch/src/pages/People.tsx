import { useMemo, useState } from 'react';
import { PersonCard } from '../components/PersonCard.tsx';
import { TagPicker } from '../components/TagPicker.tsx';
import type { Person, PersonTag, Tag } from '../db/schema.ts';
import { read } from '../lib/next-touch.ts';

interface Props {
  people: Person[];
  tags: Tag[];
  personTagLinks: PersonTag[];
  onOpen: (id: string) => void;
  onAddPerson: () => void;
}

export function People({ people, tags, personTagLinks, onOpen, onAddPerson }: Props) {
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);

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

  const visible = useMemo(() => {
    let list = people.filter((p) => !p.archived);
    if (filterTagIds.length > 0) {
      const ok = new Set<string>();
      for (const link of personTagLinks) {
        if (filterTagIds.includes(link.tag_id)) ok.add(link.person_id);
      }
      list = list.filter((p) => ok.has(p.id));
    }
    // Sort by next_touch_at ascending (overdue first), nulls (= no touches) first.
    return list.sort((a, b) => {
      const ra = read(a.last_touch_at, a.cadence_days).daysUntil;
      const rb = read(b.last_touch_at, b.cadence_days).daysUntil;
      return ra - rb;
    });
  }, [people, personTagLinks, filterTagIds]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>People</h2>
        <button type="button" className="primary" onClick={onAddPerson}>
          + Add
        </button>
      </div>

      {tags.length > 0 ? (
        <div>
          <p className="eyebrow">Filter</p>
          <TagPicker
            tags={tags}
            selected={filterTagIds}
            onToggle={(id) =>
              setFilterTagIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              )
            }
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty">
          {people.length === 0
            ? 'No one here yet. Add the first 5–30 people you actually want to keep in touch with.'
            : 'No people match this filter.'}
        </div>
      ) : (
        <div className="person-list">
          {visible.map((p) => (
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
  );
}
