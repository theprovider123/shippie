import { useMemo, useState } from 'react';
import {
  METHOD_LABEL,
  PROCESS_LABEL,
  newId,
  type Bean,
  type Brew,
  type TastingNote,
  type TastingKind,
} from '../db.ts';
import { BrewSessionRow } from '../components/BrewSessionRow.tsx';
import { BeanEditor } from '../components/BeanEditor.tsx';
import { reading } from '../lib/freshness.ts';

interface BeanPageProps {
  bean: Bean;
  brews: ReadonlyArray<Brew>;
  tastingNotes: ReadonlyArray<TastingNote>;
  onSave: (b: Bean) => void;
  onDelete: (id: string) => void;
  onAddTastingNote: (n: TastingNote) => void;
  onBack: () => void;
  onBrewWithThis: () => void;
}

const TASTING_KINDS: ReadonlyArray<TastingKind> = ['sweet', 'acidity', 'body', 'aftertaste', 'general'];

export function BeanPage({
  bean,
  brews,
  tastingNotes,
  onSave,
  onDelete,
  onAddTastingNote,
  onBack,
  onBrewWithThis,
}: BeanPageProps) {
  const [editing, setEditing] = useState<boolean>(false);
  const [newNote, setNewNote] = useState<string>('');
  const [newKind, setNewKind] = useState<TastingKind>('general');

  const beanBrews = useMemo(() => brews.filter((b) => b.bean_id === bean.id), [brews, bean.id]);
  const beanNotes = useMemo(
    () => tastingNotes.filter((n) => n.bean_id === bean.id),
    [tastingNotes, bean.id],
  );

  const stats = useMemo(() => {
    if (beanBrews.length === 0) return null;
    const ratings = beanBrews.map((b) => b.taste_rating).filter((r): r is number => r !== null);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    const bestBrew = beanBrews.reduce<Brew | null>((best, cur) => {
      if (cur.taste_rating === null) return best;
      if (!best || (best.taste_rating ?? 0) < cur.taste_rating) return cur;
      return best;
    }, null);
    return { count: beanBrews.length, avgRating, bestBrew };
  }, [beanBrews]);

  const fresh = reading(bean.method, bean.roast_date);

  function commitNote() {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    onAddTastingNote({
      id: newId('note'),
      bean_id: bean.id,
      kind: newKind,
      note: trimmed,
      created_at: new Date().toISOString(),
    });
    setNewNote('');
  }

  if (editing) {
    return (
      <main className="page page-bean">
        <BeanEditor
          bean={bean}
          onSave={(b) => {
            onSave(b);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={() => onDelete(bean.id)}
        />
      </main>
    );
  }

  return (
    <main className="page page-bean">
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="ghost edit" onClick={() => setEditing(true)}>
          Edit
        </button>
      </header>

      <section className="bean-hero">
        {bean.photo_url ? (
          <img className="bean-photo" src={bean.photo_url} alt="" loading="lazy" />
        ) : null}
        <div className="bean-hero-text">
          <h1>{bean.name}</h1>
          {bean.roaster ? <p className="muted">{bean.roaster}</p> : null}
          {fresh ? (
            <p className={`freshness-tag inline tag-${fresh.band}`}>
              {fresh.daysSinceRoast}d · {fresh.label} · {fresh.hint}
            </p>
          ) : (
            <p className="muted small">no roast date — set one to see freshness</p>
          )}
        </div>
      </section>

      <section className="bean-facts">
        {bean.origin ? <Fact label="origin" value={bean.origin} /> : null}
        {bean.process ? <Fact label="process" value={PROCESS_LABEL[bean.process]} /> : null}
        <Fact label="roast" value={bean.roast} />
        {bean.roast_date ? <Fact label="roasted" value={bean.roast_date} /> : null}
        <Fact label="method" value={METHOD_LABEL[bean.method]} />
        <Fact label="ratio" value={`1:${bean.ratio}`} />
        {bean.grind ? <Fact label="grind" value={bean.grind} /> : null}
        {bean.cupping_score ? <Fact label="cupping" value={`${bean.cupping_score}/100`} /> : null}
      </section>

      {bean.notes ? <p className="bean-notes">{bean.notes}</p> : null}

      <section className="bean-cta">
        <button type="button" className="primary" onClick={onBrewWithThis}>
          Brew with this →
        </button>
      </section>

      {stats ? (
        <section className="bean-stats">
          <p className="eyebrow">stats</p>
          <div className="stats-row">
            <Fact label="brews" value={String(stats.count)} />
            <Fact
              label="avg ★"
              value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
            />
            {stats.bestBrew ? (
              <Fact
                label="best at"
                value={`1:${stats.bestBrew.ratio} · ${stats.bestBrew.brew_seconds}s`}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="bean-tasting">
        <p className="eyebrow">tasting journal</p>
        {beanNotes.length === 0 ? (
          <p className="muted small">No tasting notes yet. Try one below.</p>
        ) : (
          <ul className="tasting-list">
            {beanNotes.map((n) => (
              <li key={n.id} className="tasting-line">
                <span className="tasting-kind">{n.kind}</span>
                <span>{n.note}</span>
                <span className="muted small">
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="tasting-input">
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as TastingKind)}>
            {TASTING_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="quick tasting note…"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNote();
            }}
          />
          <button type="button" className="ghost" onClick={commitNote} disabled={!newNote.trim()}>
            Add
          </button>
        </div>
      </section>

      <section className="bean-history">
        <p className="eyebrow">brew history ({beanBrews.length})</p>
        {beanBrews.length === 0 ? (
          <p className="muted small">No brews logged yet for this bean.</p>
        ) : (
          <ul className="session-list">
            {beanBrews.map((b) => (
              <BrewSessionRow key={b.id} brew={b} showBean={false} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span className="eyebrow">{label}</span>
      <span className="fact-value">{value}</span>
    </div>
  );
}
