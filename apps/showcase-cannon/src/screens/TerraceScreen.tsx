/**
 * Terrace — the anonymous fan feed. Match thread when a match is on (or one
 * was opened from Matches), plus the season-long Analysis and History rooms.
 * Heat is earned from votes; reports hide; nothing needs an account.
 */
import { useEffect, useRef, useState } from 'react';
import { EmptyNote, Rule } from '../components/chrome';
import {
  buildTake,
  fallbackTakes,
  fetchTakes,
  postReport,
  postTake,
  postVote,
} from '../lib/api';
import { FEEDS, useFeed } from '../lib/feeds';
import { getHandle, shortHandle } from '../lib/handle';
import { heatFor, isDimmed, timeAgo } from '../lib/heat';
import { broadcastFanReaction } from '../lib/intents';
import type { ReportReason, Take, Thread, VoteDir } from '../lib/types';

const MAX_TAKE = 280;
const HEAT_LABEL = { scorching: 'Scorching', warm: 'Warm', cold: 'Cold' } as const;
const HIDDEN_KEY = 'cannon_hidden_takes';

function localHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function hideLocally(id: string): void {
  try {
    const next = [...localHidden().add(id)];
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(next.slice(-200)));
  } catch {
    /* private mode */
  }
}

// ── Take card ────────────────────────────────────────────────────────────────
const REPORT_REASONS: Array<{ id: ReportReason; label: string }> = [
  { id: 'abuse', label: 'Abusive' },
  { id: 'spam', label: 'Spam' },
  { id: 'off-topic', label: 'Off topic' },
  { id: 'other', label: 'Something else' },
];

const TakeCard = ({
  take,
  onVote,
  onReported,
}: {
  take: Take;
  onVote: (id: string, dir: 'up' | 'down') => void;
  onReported: (id: string) => void;
}) => {
  const heat = heatFor(take.up);
  const dimmed = isDimmed(take);
  const [reporting, setReporting] = useState(false);

  const report = (reason: ReportReason) => {
    hideLocally(take.id);
    onReported(take.id);
    void postReport(take.id, reason);
  };

  return (
    <article className={`take take--${heat}${dimmed ? ' take--dimmed' : ''}`}>
      <header className="take-head">
        <span className="take-handle">{take.handle}</span>
        <span className="take-meta">
          <span className={`take-heat take-heat--${heat}`}>{HEAT_LABEL[heat]}</span>
          <span className="take-time">{timeAgo(take.createdAt)}</span>
        </span>
      </header>
      <p className="take-body">{take.text}</p>
      <footer className="take-foot">
        <button
          className={`vote-btn${take.myVote === 'up' ? ' active-up' : ''}`}
          onClick={() => onVote(take.id, 'up')}
          aria-label="Upvote"
        >
          ▲ {take.up.toLocaleString()}
        </button>
        <button
          className={`vote-btn${take.myVote === 'down' ? ' active-down' : ''}`}
          onClick={() => onVote(take.id, 'down')}
          aria-label="Downvote"
        >
          ▼ {take.down.toLocaleString()}
        </button>
        {take.up + take.down > 20 && (
          <span className="take-ratio">
            <span
              className="take-ratio-fill"
              style={{ width: `${(take.up / (take.up + take.down)) * 100}%` }}
            />
          </span>
        )}
        <button className="report-btn" onClick={() => setReporting((r) => !r)} aria-label="Report take">
          ⚑
        </button>
      </footer>
      {reporting && (
        <div className="report-row">
          {REPORT_REASONS.map((r) => (
            <button key={r.id} className="chip chip--small" onClick={() => report(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
};

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

// ── Screen ───────────────────────────────────────────────────────────────────
type Room = 'all' | 'match' | 'ANALYSIS' | 'HISTORY';

export const TerraceScreen = ({ threadMatchId }: { threadMatchId: string | null }) => {
  const match = useFeed(FEEDS.match);
  const activeMatchId = threadMatchId ?? match.data.matchId;
  const matchOn = match.data.phase === 'live' || match.data.phase === 'ht';

  const [room, setRoom] = useState<Room>(threadMatchId || matchOn ? 'match' : 'all');
  const [takes, setTakes] = useState<Take[]>(fallbackTakes);
  const [hidden, setHidden] = useState<Set<string>>(localHidden);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(true);
  // Set once the user votes/composes. An OFFLINE fetch result landing after
  // that must not clobber their optimistic state with the stale cache; a
  // real server response remains the tie-breaker as designed.
  const dirty = useRef(false);

  const scoped = room === 'match' ? activeMatchId : null;

  useEffect(() => {
    live.current = true;
    fetchTakes(scoped).then(({ takes, online }) => {
      if (!live.current) return;
      if (!online && dirty.current) return;
      setTakes(takes);
    });
    return () => {
      live.current = false;
    };
  }, [scoped]);

  useEffect(() => {
    if (threadMatchId) setRoom('match');
  }, [threadMatchId]);

  const visible = takes.filter((t) => !hidden.has(t.id));
  const filtered =
    room === 'all'
      ? visible
      : room === 'match'
        ? visible.filter((t) => t.matchId === activeMatchId || t.thread === 'MATCH')
        : visible.filter((t) => t.thread === room);

  const handleVote = (id: string, dir: 'up' | 'down') => {
    const current = takes.find((t) => t.id === id);
    if (!current) return;
    dirty.current = true;
    const next: VoteDir = current.myVote === dir ? null : dir;
    setTakes((prev) => applyVote(prev, id, dir));
    postVote(id, next).then((res) => {
      if (res && live.current) {
        setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, up: res.up, down: res.down, myVote: res.myVote } : t)));
      }
    });
  };

  const handleReported = (id: string) => {
    setHidden((prev) => new Set(prev).add(id));
    setNotice('Reported — thanks. It’s hidden for you.');
    setTimeout(() => setNotice(null), 2400);
  };

  const handleSubmit = () => {
    const text = input.trim().slice(0, MAX_TAKE);
    if (!text) return;
    dirty.current = true;
    const thread: Thread = room === 'ANALYSIS' || room === 'HISTORY' ? room : 'MATCH';
    const matchId = room === 'match' ? activeMatchId : null;
    const optimistic = buildTake(getHandle(), thread, text, matchId);
    setInput('');
    setTakes((prev) => [optimistic, ...prev]);
    postTake(optimistic).then(({ take, blocked }) => {
      if (!live.current) return;
      if (blocked) {
        setTakes((prev) => prev.filter((t) => t.id !== optimistic.id));
        setNotice('That language isn’t for the Terrace.');
        setTimeout(() => setNotice(null), 2800);
        return;
      }
      setTakes((prev) =>
        prev.some((t) => t.id === optimistic.id)
          ? prev.map((t) => (t.id === optimistic.id ? take : t))
          : [take, ...prev],
      );
    });
    broadcastFanReaction(matchId, 'take');
  };

  const rooms: Array<{ id: Room; label: string; hot?: boolean }> = [
    { id: 'all', label: 'All' },
    { id: 'match', label: matchOn ? 'Match thread' : 'Matchday', hot: matchOn },
    { id: 'ANALYSIS', label: 'Analysis' },
    { id: 'HISTORY', label: 'History' },
  ];

  return (
    <div className="screen terrace-screen">
      <div className="screen-head">
        <h1 className="screen-title">Terrace</h1>
        <span className="handle-chip" title="Your anonymous matchday handle">
          {shortHandle(getHandle())}
        </span>
      </div>

      <div className="chip-strip" role="tablist" aria-label="Rooms">
        {rooms.map((r) => (
          <button
            key={r.id}
            className={`chip${room === r.id ? ' active' : ''}${r.hot ? ' chip--hot' : ''}`}
            onClick={() => setRoom(r.id)}
            role="tab"
            aria-selected={room === r.id}
          >
            {r.hot && <span className="live-dot pulse" />}
            {r.label}
          </button>
        ))}
      </div>

      {room === 'match' && (
        <Rule
          label={`Arsenal ${match.data.venue === 'A' ? '@' : 'v'} ${match.data.opponent}`}
          accent="#EF0107"
        />
      )}

      {notice && <div className="terrace-notice">{notice}</div>}

      <div className="take-feed">
        {filtered.map((take) => (
          <TakeCard key={take.id} take={take} onVote={handleVote} onReported={handleReported} />
        ))}
        {filtered.length === 0 && (
          <EmptyNote>
            {room === 'match' ? 'Nothing in the match thread yet — first take wins.' : 'No takes yet — be first.'}
          </EmptyNote>
        )}
      </div>

      <div className="compose">
        <span className="compose-handle">{shortHandle(getHandle())}</span>
        <input
          className="compose-input"
          value={input}
          maxLength={MAX_TAKE}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={room === 'match' ? 'Into the match thread…' : 'Leave your take…'}
        />
        <button
          className={`compose-send${input.trim() ? ' ready' : ''}`}
          onClick={handleSubmit}
          aria-label="Post take"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
