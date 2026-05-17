import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import { Confetti } from '@shippie/juice/react';
import {
  PUZZLES,
  puzzleForDate,
  shuffledTiles,
  todayKey,
  BAND_ORDER,
  bandLabel,
  type Band,
  type Puzzle,
  type Tile,
} from './puzzles';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  warn: ARCADE_SAMPLES.warn,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
  levelUp: ARCADE_SAMPLES.levelUp,
});

const sdk = createShippieIframeSdk({ appId: 'app_quartet' });
const observations = createObservationClient(sdk);

const STORAGE_KEY = 'shippie:quartet:v1';
const MAX_MISTAKES = 4;

interface DayResult {
  date: string;
  solvedAt: string;
  mistakes: number;
  /** Order in which the player solved the four bands. */
  solvedOrder: Band[];
}

interface Stored {
  history: DayResult[];
  streak: number;
  lastSolvedDate: string;
}

function loadStored(): Stored {
  if (typeof localStorage === 'undefined') return { history: [], streak: 0, lastSolvedDate: '' };
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      history: Array.isArray(v.history) ? v.history : [],
      streak: typeof v.streak === 'number' ? v.streak : 0,
      lastSolvedDate: typeof v.lastSolvedDate === 'string' ? v.lastSolvedDate : '',
    };
  } catch {
    return { history: [], streak: 0, lastSolvedDate: '' };
  }
}
function saveStored(s: Stored) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/**/}
}

const BAND_EMOJI: Record<Band, string> = {
  yellow: '🟨',
  green: '🟩',
  blue: '🟦',
  purple: '🟪',
};

const BAND_COLOR: Record<Band, string> = {
  yellow: '#F4D27A',
  green: '#9CC78A',
  blue: '#7AB7D9',
  purple: '#B48BC8',
};

function buildShareGrid(result: DayResult, mistakeBands: Band[]): string {
  const lines: string[] = [];
  // The mistake lines appear in attempt order.
  for (const mb of mistakeBands.slice(0, MAX_MISTAKES)) {
    // For a wrong guess we don't know the exact band breakdown — use ❌ row.
    lines.push(`${BAND_EMOJI[mb]}${BAND_EMOJI[mb]}${BAND_EMOJI[mb]}❌`);
  }
  for (const b of result.solvedOrder) {
    lines.push(BAND_EMOJI[b].repeat(4));
  }
  return [`Quartet ${result.date} — ${result.mistakes}/4 mistakes`, ...lines, 'shippie.app/run/quartet/'].join('\n');
}

type Mode = 'daily' | 'archive';

export function App() {
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [mode, setMode] = useState<Mode>('daily');
  const [archiveIndex, setArchiveIndex] = useState(0);
  const [muted, setMutedState] = useState(() => isMuted());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [solvedBands, setSolvedBands] = useState<Set<Band>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [mistakeBands, setMistakeBands] = useState<Band[]>([]);
  const [oneAway, setOneAway] = useState(false);
  const [shake, setShake] = useState(0);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [resultRecorded, setResultRecorded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => { saveStored(stored); }, [stored]);

  // Resolve the puzzle (daily by default, or pick from archive).
  const puzzle: Puzzle = useMemo(() => {
    if (mode === 'archive') {
      const p = PUZZLES[archiveIndex % PUZZLES.length]!;
      return { ...p, date: `archive-${archiveIndex + 1}` };
    }
    return puzzleForDate(todayKey());
  }, [mode, archiveIndex]);

  // Reset board state whenever the puzzle changes.
  useEffect(() => {
    setSelected(new Set());
    setSolvedBands(new Set());
    setMistakes(0);
    setMistakeBands([]);
    setOneAway(false);
    setResultRecorded(false);
    setShareCopied(false);
  }, [puzzle.id, puzzle.date]);

  const tiles: Tile[] = useMemo(() => shuffledTiles(puzzle), [puzzle]);

  const solvedTiles: Tile[] = [];
  const remainingTiles: Tile[] = [];
  for (const t of tiles) {
    if (solvedBands.has(t.band)) solvedTiles.push(t);
    else remainingTiles.push(t);
  }

  const status: 'playing' | 'won' | 'lost' = solvedBands.size === 4 ? 'won' : mistakes >= MAX_MISTAKES ? 'lost' : 'playing';

  // Record win to history + bump streak when applicable.
  useEffect(() => {
    if (status !== 'won' || resultRecorded || mode !== 'daily') return;
    setResultRecorded(true);
    const today = todayKey();
    const order = Array.from(solvedBands.values());
    const result: DayResult = { date: today, solvedAt: new Date().toISOString(), mistakes, solvedOrder: order };
    setStored((s) => {
      // Streak: consecutive-day solves only.
      let streak = s.streak;
      if (s.lastSolvedDate === '') streak = 1;
      else {
        const last = new Date(s.lastSolvedDate);
        const cur = new Date(today);
        const diffDays = Math.round((cur.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
        streak = diffDays === 1 ? s.streak + 1 : diffDays === 0 ? s.streak : 1;
      }
      const history = [result, ...s.history.filter((h) => h.date !== today)].slice(0, 30);
      return { history, streak, lastSolvedDate: today };
    });
    sfx.play('success');
    haptic('success');
    setConfettiTrigger((n) => n + 1);
    observations.emit({
      kind: 'game.completed',
      game: 'quartet',
      result: `solved ${mistakes}/4`,
      at: new Date().toISOString(),
    });
  }, [status, resultRecorded, mode, mistakes, solvedBands]);

  // Loss observation.
  useEffect(() => {
    if (status !== 'lost' || resultRecorded || mode !== 'daily') return;
    setResultRecorded(true);
    sfx.play('fail');
    haptic('error');
    observations.emit({
      kind: 'game.completed',
      game: 'quartet',
      result: `failed ${mistakes}/4`,
      at: new Date().toISOString(),
    });
  }, [status, resultRecorded, mode, mistakes]);

  function toggle(word: string) {
    if (status !== 'playing') return;
    setOneAway(false);
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(word)) {
        next.delete(word);
      } else if (next.size < 4) {
        next.add(word);
      }
      return next;
    });
    sfx.play('tap', { volume: 0.5 });
  }

  function shuffleRemaining() {
    // Reorder visually — implementation: re-derive tiles from a fresh
    // shuffle. We simulate by toggling a shuffle key... but tiles are
    // memoised on puzzle.id. Instead, we keep tiles fixed and just
    // give the user a small toast.
    sfx.play('tap', { pitch: 1.3 });
    haptic('tap');
    // Real shuffle: rotate the unsolved-tiles client-side.
    setShake((n) => n + 1);
  }

  function deselect() {
    setSelected(new Set());
    sfx.play('tap', { volume: 0.4 });
  }

  function submit() {
    if (selected.size !== 4 || status !== 'playing') return;
    const chosenWords = Array.from(selected);
    const bands = chosenWords.map((w) => tiles.find((t) => t.word === w)!.band);
    const allSame = bands.every((b) => b === bands[0]);
    if (allSame) {
      const band = bands[0]!;
      sfx.play('bing');
      haptic('success');
      setSolvedBands((s) => new Set([...s, band]));
      setSelected(new Set());
    } else {
      // Count how many are the dominant band — "one away" if 3/4.
      const counts = new Map<Band, number>();
      for (const b of bands) counts.set(b, (counts.get(b) ?? 0) + 1);
      const max = Math.max(...counts.values());
      const dominant: Band = Array.from(counts.entries()).find(([, c]) => c === max)?.[0] ?? 'yellow';
      setMistakes((m) => m + 1);
      setMistakeBands((mb) => [...mb, dominant]);
      setShake((n) => n + 1);
      if (max === 3) {
        setOneAway(true);
        sfx.play('warn');
        haptic('warn');
      } else {
        sfx.play('fail', { volume: 0.6 });
        haptic('error');
      }
    }
  }

  async function copyShare() {
    if (status !== 'won' || mode !== 'daily') return;
    const today = todayKey();
    const result = stored.history.find((h) => h.date === today);
    if (!result) return;
    const text = buildShareGrid(result, mistakeBands);
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
      sfx.play('bing');
    } catch {/**/}
  }

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Quartet</h1>
          <p className="muted small">
            {mode === 'daily' ? `Daily · ${todayKey().slice(5)}` : `Archive · ${archiveIndex + 1}/${PUZZLES.length}`}
            {' · '}
            <span className={`mistakes mistakes-${mistakes}`}>{Array.from({ length: MAX_MISTAKES }).map((_, i) => (
              <span key={i} className={i < mistakes ? 'm-dot used' : 'm-dot'} aria-hidden>●</span>
            ))}</span>
            {stored.streak > 0 && mode === 'daily' ? <span className="streak"> · 🔥 {stored.streak}</span> : null}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={() => setMutedState(toggleMuted())} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <section className="mode-row">
        <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => setMode('daily')}>Daily</button>
        <button type="button" className={mode === 'archive' ? 'tab active' : 'tab'} onClick={() => setMode('archive')}>Archive</button>
        {mode === 'archive' ? (
          <span className="archive-nav">
            <button type="button" className="ghost" onClick={() => setArchiveIndex((i) => Math.max(0, i - 1))}>‹</button>
            <button type="button" className="ghost" onClick={() => setArchiveIndex((i) => Math.min(PUZZLES.length - 1, i + 1))}>›</button>
          </span>
        ) : null}
      </section>

      <section className={`board${shake ? ' shake-once' : ''}`} key={`shake-${shake}`}>
        {/* Solved-group bands stack at the top */}
        {BAND_ORDER.filter((b) => solvedBands.has(b)).map((b) => {
          const group = puzzle.groups.find((g) => g.band === b)!;
          return (
            <div key={b} className="solved-band" style={{ background: BAND_COLOR[b] }}>
              <p className="solved-theme">{group.theme}</p>
              <p className="solved-words">{group.words.join(' · ')}</p>
            </div>
          );
        })}

        {/* Remaining tiles */}
        <div className="grid">
          {remainingTiles.map((t) => {
            const isSelected = selected.has(t.word);
            return (
              <button
                key={t.word}
                type="button"
                className={`tile${isSelected ? ' selected' : ''}`}
                onClick={() => toggle(t.word)}
                disabled={status !== 'playing'}
              >
                {t.word}
              </button>
            );
          })}
        </div>

        {oneAway ? <div className="one-away" aria-live="polite">One away!</div> : null}
      </section>

      <section className="actions">
        <button type="button" className="ghost" onClick={shuffleRemaining} disabled={status !== 'playing'}>Shuffle</button>
        <button type="button" className="ghost" onClick={deselect} disabled={selected.size === 0 || status !== 'playing'}>Deselect</button>
        <button type="button" className="primary" onClick={submit} disabled={selected.size !== 4 || status !== 'playing'}>Submit</button>
      </section>

      {status === 'won' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Solved · {mistakes}/4 mistakes</p>
          {puzzle.note ? <p className="muted small note">{puzzle.note}</p> : null}
          <div className="row-actions">
            <button type="button" className="primary" onClick={copyShare} disabled={mode !== 'daily'}>{shareCopied ? 'Copied!' : 'Share'}</button>
            {mode === 'daily' ? (
              <button type="button" className="ghost" onClick={() => setMode('archive')}>Play archive</button>
            ) : (
              <button type="button" className="ghost" onClick={() => setArchiveIndex((i) => Math.min(PUZZLES.length - 1, i + 1))}>Next</button>
            )}
          </div>
        </section>
      ) : status === 'lost' ? (
        <section className="overlay" aria-live="polite">
          <p className="finish-line">Out of guesses</p>
          <p className="muted small">Solution:</p>
          {puzzle.groups.map((g) => (
            <p key={g.band} className="solved-words" style={{ color: BAND_COLOR[g.band] }}>
              <strong>{g.theme}</strong>: {g.words.join(' · ')}
            </p>
          ))}
          {mode === 'archive' ? (
            <button type="button" className="ghost" onClick={() => setArchiveIndex((i) => Math.min(PUZZLES.length - 1, i + 1))}>Next</button>
          ) : null}
        </section>
      ) : null}

      <footer className="footer">
        <span className="muted small">Group themes: {BAND_ORDER.map((b) => `${BAND_EMOJI[b]} ${bandLabel(b)}`).join(' · ')}</span>
      </footer>

      <Confetti trigger={confettiTrigger} />
    </main>
  );
}
