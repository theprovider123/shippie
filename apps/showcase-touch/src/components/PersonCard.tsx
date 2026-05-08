import type { Person, Tag } from '../db/schema.ts';
import { read } from '../lib/next-touch.ts';

interface Props {
  person: Person;
  tags?: Tag[];
  onOpen: (id: string) => void;
}

export function PersonCard({ person, tags, onOpen }: Props) {
  const reading = read(person.last_touch_at, person.cadence_days);
  const subtitle = [person.role, person.company].filter(Boolean).join(' · ');
  return (
    <button type="button" className="person-card" onClick={() => onOpen(person.id)}>
      <div className="name">{person.name}</div>
      {subtitle ? <div className="role">{subtitle}</div> : null}
      <div className="meta">
        <span className={`pill ${reading.band}`}>{reading.label}</span>
        {tags && tags.length > 0 ? (
          <span className="tag-list">
            {tags.slice(0, 3).map((t) => (
              <span key={t.id} className="pill tag">
                {t.label}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </button>
  );
}
