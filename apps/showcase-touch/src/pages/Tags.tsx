import { useState } from 'react';
import type { Tag } from '../db/schema.ts';

interface Props {
  tags: Tag[];
  countFor: (tagId: string) => number;
  onCreate: (label: string) => void;
  onDelete: (id: string) => void;
}

export function Tags({ tags, countFor, onCreate, onDelete }: Props) {
  const [draft, setDraft] = useState('');

  return (
    <div className="page">
      <div className="page-header">
        <h2>Tags</h2>
      </div>
      <p className="muted small">Group people any way that helps you remember them.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onCreate(draft.trim());
          setDraft('');
        }}
        className="card"
      >
        <label>
          New tag
          <input
            type="text"
            value={draft}
            placeholder="inner-circle"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button type="submit" className="primary" style={{ marginTop: 8 }}>
          Add tag
        </button>
      </form>

      <div className="card">
        <h3>Existing</h3>
        {tags.length === 0 ? (
          <p className="muted small">No tags yet.</p>
        ) : (
          <ul className="person-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tags.map((t) => (
              <li
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid #ECE3D2',
                }}
              >
                <span>
                  <strong>{t.label}</strong>{' '}
                  <span className="muted small">· {countFor(t.id)} people</span>
                </span>
                <button type="button" className="danger" onClick={() => onDelete(t.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
