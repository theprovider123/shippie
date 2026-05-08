import { useState } from 'react';
import { TouchRow } from '../components/TouchRow.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { TagPicker } from '../components/TagPicker.tsx';
import type { Person as PersonT, Tag, Task, Touch } from '../db/schema.ts';
import { read } from '../lib/next-touch.ts';
import { effectiveCadenceDays, CADENCES } from '../lib/cadence.ts';

interface Props {
  person: PersonT;
  touches: Touch[];
  tasks: Task[];
  tags: Tag[];
  selectedTagIds: ReadonlyArray<string>;
  onBack: () => void;
  onLogTouch: () => void;
  onUpdate: (patch: Partial<PersonT>) => void;
  onDelete: () => void;
  onToggleTask: (id: string, done: boolean) => void;
  onAddTask: (body: string, due_at: string | null) => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (label: string) => void;
}

export function Person({
  person,
  touches,
  tasks,
  tags,
  selectedTagIds,
  onBack,
  onLogTouch,
  onUpdate,
  onDelete,
  onToggleTask,
  onAddTask,
  onToggleTag,
  onCreateTag,
}: Props) {
  const reading = read(person.last_touch_at, person.cadence_days);
  const [editing, setEditing] = useState(false);
  const [taskBody, setTaskBody] = useState('');
  const [taskDue, setTaskDue] = useState('');

  const cadenceDays = effectiveCadenceDays(person.cadence_days);

  return (
    <div className="page">
      <div className="page-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← People
        </button>
        <button type="button" className="primary" onClick={onLogTouch}>
          + Log a touch
        </button>
      </div>

      <div className="card">
        <h3>{person.name}</h3>
        <div className="detail-meta">
          {person.role ? <span>{person.role}</span> : null}
          {person.company ? <span>{person.company}</span> : null}
          <span className={`pill ${reading.band}`}>{reading.label}</span>
          <span className="muted">cadence: every {cadenceDays}d</span>
        </div>
        {person.email ? <p className="small">{person.email}</p> : null}
        {person.phone ? <p className="small">{person.phone}</p> : null}
        {person.notes_md ? (
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{person.notes_md}</p>
        ) : null}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onUpdate({ archived: person.archived ? 0 : 1 })}
          >
            {person.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
        {editing ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label>
              Name
              <input
                type="text"
                value={person.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </label>
            <label>
              Role
              <input
                type="text"
                value={person.role ?? ''}
                onChange={(e) => onUpdate({ role: e.target.value || null })}
              />
            </label>
            <label>
              Company
              <input
                type="text"
                value={person.company ?? ''}
                onChange={(e) => onUpdate({ company: e.target.value || null })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={person.email ?? ''}
                onChange={(e) => onUpdate({ email: e.target.value || null })}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                value={person.phone ?? ''}
                onChange={(e) => onUpdate({ phone: e.target.value || null })}
              />
            </label>
            <label>
              Cadence
              <select
                value={person.cadence_days ?? ''}
                onChange={(e) =>
                  onUpdate({
                    cadence_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">default</option>
                {CADENCES.map((c) => (
                  <option key={c.key} value={c.days}>
                    {c.label} — every {c.days} days
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                value={person.notes_md ?? ''}
                onChange={(e) => onUpdate({ notes_md: e.target.value || null })}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>Tags</h3>
        <TagPicker
          tags={tags}
          selected={selectedTagIds}
          onToggle={onToggleTag}
          onCreate={onCreateTag}
        />
      </div>

      <div className="card">
        <h3>Open promises</h3>
        {tasks.length === 0 ? (
          <p className="muted small">No open promises. Add what you said you'd do.</p>
        ) : (
          <div>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggleTask} />
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!taskBody.trim()) return;
            onAddTask(taskBody.trim(), taskDue || null);
            setTaskBody('');
            setTaskDue('');
          }}
          style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <input
            type="text"
            placeholder="send the spreadsheet I promised"
            value={taskBody}
            onChange={(e) => setTaskBody(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="primary">
              Add
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Touches</h3>
        {touches.length === 0 ? (
          <p className="muted small">No touches yet — log the first one.</p>
        ) : (
          <div>
            {touches.map((t) => (
              <TouchRow key={t.id} touch={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
