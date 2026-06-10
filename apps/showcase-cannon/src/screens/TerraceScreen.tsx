// TerraceScreen — ported from cannon-terrace.jsx, wired to /api/cannon.
// Downvotes for moderation, UK fan language, heat earned from votes.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ScreenHeader } from '../components/chrome';
import { buildTake, fallbackTakes, fetchTakes, postTake, postVote } from '../lib/api';
import { getHandle, shortHandle } from '../lib/handle';
import { heatFor, isDimmed, timeAgo } from '../lib/heat';
import type { Take, Thread, VoteDir } from '../lib/types';

const terL: CSSProperties = {
  fontFamily: "'Barlow Condensed',sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--cream-dim)',
};
const terB: CSSProperties = {
  fontFamily: "'Inter',sans-serif",
  fontSize: 14,
  lineHeight: 1.65,
  fontWeight: 400,
  color: 'var(--cream-muted)',
};

const HEAT = {
  scorching: { label: 'Scorching', bg: 'rgba(239,1,7,0.06)', border: 'rgba(239,1,7,0.18)', color: '#EF0107' },
  warm: { label: 'Warm', bg: 'rgba(184,150,62,0.06)', border: 'rgba(184,150,62,0.18)', color: 'var(--gold-light)' },
  cold: { label: 'Cold', bg: 'rgba(100,130,160,0.04)', border: 'rgba(100,130,160,0.14)', color: '#7A9AB5' },
};

const MAX_TAKE = 280;

const TakeCard = ({ take, onVote }: { take: Take; onVote: (id: string, dir: 'up' | 'down') => void }) => {
  const h = HEAT[heatFor(take.up)];
  const dimmed = isDimmed(take);

  return (
    <div
      style={{
        background: h.bg,
        border: `1px solid ${h.border}`,
        borderLeft: `3px solid ${h.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
        opacity: dimmed ? 0.55 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Handle + time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--gold-light)' }}>
          {take.handle}
        </span>
        <span style={{ ...terL }}>{timeAgo(take.createdAt)}</span>
      </div>
      {/* Heat badge */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ ...terL, color: h.color }}>{h.label}</span>
      </div>
      {/* Body */}
      <p style={{ ...terB, marginBottom: 12, overflowWrap: 'anywhere' }}>{take.text}</p>
      {/* Vote row: upvote + downvote */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onVote(take.id, 'up')}
          aria-label="Upvote"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: take.myVote === 'up' ? 'rgba(239,1,7,0.1)' : 'var(--raised)',
            border: take.myVote === 'up' ? '1px solid rgba(239,1,7,0.28)' : '1px solid var(--border)',
            borderRadius: 20,
            padding: '5px 12px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={take.myVote === 'up' ? '#EF0107' : 'none'} stroke={take.myVote === 'up' ? '#EF0107' : 'var(--cream-dim)'} strokeWidth="2" strokeLinecap="round">
            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
            <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
          </svg>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, color: take.myVote === 'up' ? '#EF0107' : 'var(--cream-dim)' }}>
            {take.up.toLocaleString()}
          </span>
        </button>
        <button
          onClick={() => onVote(take.id, 'down')}
          aria-label="Downvote"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: take.myVote === 'down' ? 'rgba(100,130,160,0.12)' : 'var(--raised)',
            border: take.myVote === 'down' ? '1px solid rgba(100,130,160,0.35)' : '1px solid var(--border)',
            borderRadius: 20,
            padding: '5px 12px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={take.myVote === 'down' ? '#7A9AB5' : 'none'} stroke={take.myVote === 'down' ? '#7A9AB5' : 'var(--cream-dim)'} strokeWidth="2" strokeLinecap="round">
            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
            <path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
          </svg>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, color: take.myVote === 'down' ? '#7A9AB5' : 'var(--cream-dim)' }}>
            {take.down}
          </span>
        </button>
        {/* Ratio bar — subtle community signal */}
        {take.up + take.down > 50 && (
          <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginLeft: 4 }}>
            <div style={{ height: '100%', width: `${(take.up / (take.up + take.down)) * 100}%`, background: 'linear-gradient(90deg,#EF0107,#C4982A)', borderRadius: 3 }} />
          </div>
        )}
      </div>
    </div>
  );
};

type FeedTab = 'ALL' | Thread;

function applyVote(takes: Take[], id: string, dir: 'up' | 'down'): Take[] {
  return takes.map((t) => {
    if (t.id !== id) return t;
    const wasUp = t.myVote === 'up';
    const wasDown = t.myVote === 'down';
    if (dir === 'up') {
      return { ...t, myVote: wasUp ? null : 'up', up: wasUp ? t.up - 1 : t.up + 1, down: wasDown ? t.down - 1 : t.down };
    }
    return { ...t, myVote: wasDown ? null : 'down', down: wasDown ? t.down - 1 : t.down + 1, up: wasUp ? t.up - 1 : t.up };
  });
}

export const TerraceScreen = () => {
  const [activeTab, setActiveTab] = useState<FeedTab>('ALL');
  const [takes, setTakes] = useState<Take[]>(fallbackTakes);
  const [input, setInput] = useState('');
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    fetchTakes().then(({ takes }) => {
      if (live.current) setTakes(takes);
    });
    return () => {
      live.current = false;
    };
  }, []);

  const filtered = activeTab === 'ALL' ? takes : takes.filter((t) => t.thread === activeTab);

  const handleVote = (id: string, dir: 'up' | 'down') => {
    const current = takes.find((t) => t.id === id);
    if (!current) return;
    const next: VoteDir = current.myVote === dir ? null : dir;
    setTakes((prev) => applyVote(prev, id, dir));
    postVote(id, next).then((res) => {
      if (res && live.current) {
        setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, up: res.up, down: res.down, myVote: res.myVote } : t)));
      }
    });
  };

  const handleSubmit = () => {
    const text = input.trim().slice(0, MAX_TAKE);
    if (!text) return;
    const thread: Thread = activeTab === 'ALL' ? 'MATCH' : activeTab;
    const optimistic = buildTake(getHandle(), thread, text);
    setInput('');
    setTakes((prev) => [optimistic, ...prev]);
    postTake(optimistic).then(({ take }) => {
      if (live.current) setTakes((prev) => prev.map((t) => (t.id === optimistic.id ? take : t)));
    });
  };

  const liveRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF0107', display: 'inline-block' }} />
      <span style={{ ...terL, color: '#EF0107' }}>Live</span>
    </div>
  );

  return (
    <div className="screen-enter" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="TERRACE" right={liveRight} />

      {/* Tabs */}
      <div style={{ padding: '10px 16px 8px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className={`tab-pill${activeTab === 'ALL' ? ' active' : ''}`} onClick={() => setActiveTab('ALL')} style={{ marginRight: 4 }}>
            All
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <button
            onClick={() => setActiveTab('MATCH')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 14px',
              borderRadius: 20,
              border: `1px solid ${activeTab === 'MATCH' ? '#EF0107' : 'rgba(239,1,7,0.28)'}`,
              background: activeTab === 'MATCH' ? '#EF0107' : 'rgba(239,1,7,0.06)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: activeTab === 'MATCH' ? '#fff' : '#EF0107',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: activeTab === 'MATCH' ? 'rgba(255,255,255,0.8)' : '#EF0107', display: 'inline-block' }} />
            Match
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          {(
            [
              { id: 'ANALYSIS', label: 'Analysis' },
              { id: 'HISTORY', label: 'History' },
            ] as Array<{ id: Thread; label: string }>
          ).map((t) => (
            <button key={t.id} className={`tab-pill${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 16px 8px', scrollbarWidth: 'none' }}>
        {filtered.map((take) => (
          <TakeCard key={take.id} take={take} onVote={handleVote} />
        ))}
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px 20px', ...terL }}>No takes yet — be first</div>}
      </div>

      {/* Compose */}
      <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 24, padding: '8px 8px 8px 14px' }}>
          <div
            style={{
              background: 'rgba(184,150,62,0.12)',
              border: '1px solid rgba(184,150,62,0.22)',
              borderRadius: 12,
              padding: '3px 8px',
              flexShrink: 0,
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--gold)',
              whiteSpace: 'nowrap',
            }}
          >
            {shortHandle(getHandle())}
          </div>
          <input
            value={input}
            maxLength={MAX_TAKE}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Leave your take…"
            style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'var(--cream)', caretColor: '#EF0107' }}
          />
          <button
            onClick={handleSubmit}
            aria-label="Post take"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              background: input.trim() ? '#EF0107' : 'var(--interactive)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
