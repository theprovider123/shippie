import { useMemo, useState } from 'react';
import { OPENING_FIXTURE, fixtureTitle } from '../data/tournament.ts';
import {
  readCommentaryPosts,
  readPulseVote,
  saveCommentaryPost,
  savePulseVote,
  type CommentaryPost,
} from '../shared/local-store.ts';

const PULSE_ID = 'opening-room-mood';
const PULSE_OPTIONS = ['Mexico win', 'South Africa upset', 'Draw', 'Just here for chaos'];
const BASE_COUNTS: Record<string, number> = {
  'Mexico win': 142,
  'South Africa upset': 64,
  Draw: 39,
  'Just here for chaos': 87,
};

const QUICK_LINES = [
  'Opening match nerves are already ridiculous.',
  'The group is harder than people think.',
  'This feels like a late goal game.',
  'Neutral corner checking in.',
];

export function CommentaryRoom() {
  const [scope, setScope] = useState<'room' | 'global'>('room');
  const [text, setText] = useState('');
  const [posts, setPosts] = useState<CommentaryPost[]>(() => readCommentaryPosts());
  const [pulseVote, setPulseVote] = useState(() => readPulseVote(PULSE_ID));
  const counts = useMemo(() => {
    const next = { ...BASE_COUNTS };
    if (pulseVote) next[pulseVote.option] = (next[pulseVote.option] ?? 0) + 1;
    return next;
  }, [pulseVote]);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const submit = (nextText = text) => {
    const clean = nextText.trim();
    if (!clean) return;
    const post = saveCommentaryPost({ text: clean.slice(0, 180), scope });
    setPosts((current) => [post, ...current].slice(0, 16));
    setText('');
  };

  const vote = (option: string) => {
    const next = savePulseVote({ questionId: PULSE_ID, option });
    setPulseVote(next);
  };

  return (
    <section className="commentary-room">
      <div className="panel-head">
        <h2>Commentary room</h2>
        <span>{fixtureTitle(OPENING_FIXTURE)}</span>
      </div>
      <div className="scope-tabs" role="tablist" aria-label="Commentary scope">
        <button className={scope === 'room' ? 'selected' : ''} onClick={() => setScope('room')} type="button">This room</button>
        <button className={scope === 'global' ? 'selected' : ''} onClick={() => setScope('global')} type="button">Shippie pulse</button>
      </div>
      <div className="pulse-bars" aria-label="Shippie pulse">
        {PULSE_OPTIONS.map((option) => {
          const count = counts[option] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <button key={option} className={pulseVote?.option === option ? 'selected' : ''} onClick={() => vote(option)} type="button">
              <span>
                <strong>{option}</strong>
                <em>{pct}%</em>
              </span>
              <i style={{ transform: `scaleX(${Math.max(0.04, pct / 100)})` }} />
            </button>
          );
        })}
      </div>
      <p className="muted">Pulse votes are anonymous. Room commentary stays separate from wider match mood.</p>
      <div className="quick-comment-grid">
        {QUICK_LINES.map((line) => (
          <button key={line} onClick={() => submit(line)} type="button">{line}</button>
        ))}
      </div>
      <label>
        Add commentary
        <textarea value={text} onChange={(event) => setText(event.currentTarget.value)} maxLength={180} />
      </label>
      <div className="form-foot">
        <span>{scope === 'room' ? 'Posts to this board' : 'Marked for Shippie pulse'}</span>
        <button onClick={() => submit()} type="button">Post</button>
      </div>
      <div className="commentary-list">
        {posts.filter((post) => post.scope === scope).slice(0, 5).map((post) => (
          <article key={post.id}>
            <strong>{post.scope === 'room' ? 'Room' : 'Pulse'}</strong>
            <p>{post.text}</p>
          </article>
        ))}
        {posts.filter((post) => post.scope === scope).length === 0 ? <p className="muted">No commentary yet.</p> : null}
      </div>
    </section>
  );
}
