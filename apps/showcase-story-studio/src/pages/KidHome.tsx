import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import type { Story } from '../db/schema.ts';
import { listStories } from '../db/queries.ts';

interface Props {
  db: ShippieLocalDb;
  kidName: string;
  onNew: () => void;
  onOpen: (storyId: string) => void;
}

export function KidHome({ db, onNew, onOpen, kidName }: Props) {
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    void (async () => {
      setStories(await listStories(db));
    })();
  }, []);

  return (
    <section className="ss-kid-home">
      <button
        type="button"
        className="ss-kid-start"
        onClick={onNew}
        aria-label="Make a new story"
      >
        +
      </button>
      <p className="ss-kid-greet">{kidName}'s stories</p>
      {stories.length === 0 ? (
        <p className="ss-empty">Nothing made yet.</p>
      ) : (
        <ul className="ss-kid-list">
          {stories.map((s) => (
            <li key={s.id}>
              <button type="button" className="ss-kid-story" onClick={() => onOpen(s.id)}>
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
