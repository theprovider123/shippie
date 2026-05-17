import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { createSoundBank, isMuted, toggleMuted } from '@shippie/juice';
import { ARCADE_SAMPLES } from '@shippie/juice/samples';
import { Confetti } from '@shippie/juice/react';
import {
  BANK_VERSION,
  LANGS,
  loadWords,
  puzzleForDate,
  randomPuzzle,
  scoreGuess,
  shareGrid,
  todayKey,
  type DailyPuzzle,
  type Lang,
  type TileState,
} from './wordbank';

const sfx = createSoundBank({
  tap: ARCADE_SAMPLES.tap,
  pop: ARCADE_SAMPLES.pop,
  bing: ARCADE_SAMPLES.bing,
  success: ARCADE_SAMPLES.success,
  fail: ARCADE_SAMPLES.fail,
});

const FLIP_STAGGER_MS = 250;
const FLIP_DURATION_MS = 480;

/**
 * Five Letter — daily word puzzle in 3 languages.
 *
 * Daily mode: deterministic word from date+lang+bank-version. The
 * `puzzle_id` baked into every persisted answer + emitted observation
 * makes future bank refreshes safe — historical entries stay
 * attributable to the version they were authored against.
 *
 * Practice mode: random word from the same bank, no streak impact.
 *
 * Storage: per-puzzle attempts + outcome in localStorage. Stats panel
 * derives streak + win-distribution + best from this single source.
 *
 * Layout:
 *   - Phone-portrait: stacked grid, on-screen QWERTY keyboard with
 *     coloured key states.
 *   - Desktop: same layout but the on-screen keyboard is also
 *     keyboard-driven (physical typing works either way).
 */

const STORAGE_KEY = 'shippie:five-letter:v1';
const SETTINGS_KEY = 'shippie:five-letter:settings:v1';

const sdk = createShippieIframeSdk({ appId: 'app_five_letter' });
const observations = createObservationClient(sdk);

interface RowEntry {
  guess: string;
  states: TileState[];
}

interface PersistedAttempt {
  puzzle_id: string;
  date: string;
  lang: Lang;
  bank_version: string;
  guesses: string[];
  won: boolean;
  finished: boolean;
}

type AttemptMap = Record<string, PersistedAttempt>;

interface Settings {
  lang: Lang;
  hardMode: boolean;
}

function loadAttempts(): AttemptMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveAttempts(map: AttemptMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {/**/}
}
function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return { lang: 'en', hardMode: false };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (raw && (raw.lang === 'en' || raw.lang === 'es' || raw.lang === 'fr')) {
      return { lang: raw.lang, hardMode: raw.hardMode === true };
    }
  } catch {/**/}
  return { lang: 'en', hardMode: false };
}
function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {/**/}
}

const ROWS_PER_GAME = 6;

const KEYBOARD_LAYOUTS: Record<Lang, ReadonlyArray<string>> = {
  en: ['qwertyuiop', 'asdfghjkl', '⌫zxcvbnm⏎'],
  es: ['qwertyuiop', 'asdfghjklñ', '⌫zxcvbnm⏎'],
  fr: ['azertyuiop', 'qsdfghjklm', '⌫wxcvbn⏎'],
};

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [attempts, setAttempts] = useState<AttemptMap>(() => loadAttempts());
  const [wordsByLang, setWordsByLang] = useState<Partial<Record<Lang, string[]>>>({});
  const [practicePuzzle, setPracticePuzzle] = useState<DailyPuzzle | null>(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [shake, setShake] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'daily' | 'practice' | 'archive'>('daily');
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [hardModeError, setHardModeError] = useState<string | null>(null);
  // Tracks the last-submitted guess for tile-flip animation. Index N
  // becomes "revealed" at FLIP_STAGGER_MS × N + FLIP_DURATION_MS, so
  // the row reveals letter-by-letter (Wordle-cadence).
  const [flipping, setFlipping] = useState<{ rowIdx: number; revealedThrough: number } | null>(null);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [muted, setMutedState] = useState(() => isMuted());
  // Keep the keyboard state from updating until the row finishes
  // flipping — the green/yellow/grey colours should land WITH the
  // tiles, not before.
  const lastSubmitTimerRef = useRef<number | null>(null);

  const today = todayKey();
  const lang = settings.lang;
  const words = wordsByLang[lang] ?? null;
  const wordSet = useMemo(() => new Set(words ?? []), [words]);

  // Load words for the active language; lazy-load other languages on demand.
  useEffect(() => {
    if (wordsByLang[lang]) return;
    void loadWords(lang)
      .then((ws) => setWordsByLang((prev) => ({ ...prev, [lang]: ws })))
      .catch((err) => console.warn('[five-letter] words load failed', err));
  }, [lang, wordsByLang]);

  useEffect(() => { saveAttempts(attempts); }, [attempts]);
  useEffect(() => { saveSettings(settings); }, [settings]);

  const dailyPuzzle = useMemo<DailyPuzzle | null>(() => {
    if (!words) return null;
    return puzzleForDate(today, lang, words);
  }, [today, lang, words]);

  const archivePuzzle = useMemo<DailyPuzzle | null>(() => {
    if (!words || !archiveDate) return null;
    return puzzleForDate(archiveDate, lang, words);
  }, [archiveDate, lang, words]);

  const activePuzzle = activeMode === 'practice'
    ? practicePuzzle
    : activeMode === 'archive'
      ? archivePuzzle
      : dailyPuzzle;
  const activeAttempt = activePuzzle ? attempts[activePuzzle.puzzle_id] : undefined;

  const rows: RowEntry[] = useMemo(() => {
    if (!activePuzzle) return [];
    return (activeAttempt?.guesses ?? []).map((guess) => ({
      guess,
      states: scoreGuess(activePuzzle.answer, guess),
    }));
  }, [activeAttempt, activePuzzle]);

  const keyStates = useMemo<Record<string, TileState>>(() => {
    const out: Record<string, TileState> = {};
    // Skip the still-flipping row so keyboard tints don't precede the
    // tile reveal (they should land WITH the tiles, not before).
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      const isFlippingRow = flipping?.rowIdx === r;
      const upTo = isFlippingRow ? Math.max(0, flipping.revealedThrough + 1) : row.guess.length;
      for (let i = 0; i < upTo; i++) {
        const ch = row.guess[i]!;
        const next = row.states[i]!;
        const prev = out[ch];
        // Promote correct > present > absent; never demote.
        if (prev === 'correct') continue;
        if (next === 'correct') out[ch] = 'correct';
        else if (next === 'present' && prev !== 'present') out[ch] = 'present';
        else if (!prev) out[ch] = 'absent';
      }
    }
    return out;
  }, [rows, flipping]);

  const finished = activeAttempt?.finished ?? false;
  const won = activeAttempt?.won ?? false;

  const submitGuess = useCallback(() => {
    if (!activePuzzle) return;
    if (finished) return;
    if (currentGuess.length !== 5) return;
    if (!wordSet.has(currentGuess.toLowerCase())) {
      haptic('error');
      sfx.play('fail');
      setShake(true);
      window.setTimeout(() => setShake(false), 300);
      return;
    }
    const guess = currentGuess.toLowerCase();
    // Hard mode: must reuse all revealed greens (in same position)
    // and yellows (somewhere). Block submit + flash a hint message.
    if (settings.hardMode && rows.length > 0) {
      const required: { letter: string; position: number | null }[] = [];
      for (const r of rows) {
        for (let i = 0; i < r.guess.length; i++) {
          const ch = r.guess[i]!;
          const st = r.states[i]!;
          if (st === 'correct') required.push({ letter: ch, position: i });
          else if (st === 'present' && !required.some((q) => q.letter === ch)) required.push({ letter: ch, position: null });
        }
      }
      for (const req of required) {
        if (req.position !== null) {
          if (guess[req.position] !== req.letter) {
            setHardModeError(`Hard mode: ${req.letter.toUpperCase()} must be in slot ${req.position + 1}`);
            window.setTimeout(() => setHardModeError(null), 2200);
            haptic('error');
            sfx.play('fail');
            setShake(true);
            window.setTimeout(() => setShake(false), 300);
            return;
          }
        } else {
          if (!guess.includes(req.letter)) {
            setHardModeError(`Hard mode: must use ${req.letter.toUpperCase()}`);
            window.setTimeout(() => setHardModeError(null), 2200);
            haptic('error');
            sfx.play('fail');
            setShake(true);
            window.setTimeout(() => setShake(false), 300);
            return;
          }
        }
      }
    }
    haptic('tap');
    sfx.play('tap');
    const states = scoreGuess(activePuzzle.answer, guess);
    const isWin = states.every((s) => s === 'correct');
    const nextGuesses = [...(activeAttempt?.guesses ?? []), guess];
    const isFinished = isWin || nextGuesses.length >= ROWS_PER_GAME;
    const next: PersistedAttempt = {
      puzzle_id: activePuzzle.puzzle_id,
      date: activePuzzle.date,
      lang: activePuzzle.lang,
      bank_version: BANK_VERSION,
      guesses: nextGuesses,
      won: isWin,
      finished: isFinished,
    };
    setAttempts((m) => ({ ...m, [activePuzzle.puzzle_id]: next }));
    setCurrentGuess('');

    // Tile-flip reveal sequence — staggered per-tile, then optional
    // win celebration on the row.
    const newRowIdx = nextGuesses.length - 1;
    setFlipping({ rowIdx: newRowIdx, revealedThrough: -1 });
    for (let i = 0; i < 5; i++) {
      window.setTimeout(() => {
        sfx.play('pop', { pitch: 1 + i * 0.05 });
        setFlipping({ rowIdx: newRowIdx, revealedThrough: i });
      }, i * FLIP_STAGGER_MS + FLIP_DURATION_MS / 2);
    }
    // Clear the flipping marker once the last tile lands.
    const totalRevealMs = 4 * FLIP_STAGGER_MS + FLIP_DURATION_MS;
    if (lastSubmitTimerRef.current) window.clearTimeout(lastSubmitTimerRef.current);
    lastSubmitTimerRef.current = window.setTimeout(() => {
      setFlipping(null);
      if (isFinished) {
        if (isWin) {
          haptic('success');
          sfx.play('success');
          setConfettiTrigger((n) => n + 1);
        } else {
          sfx.play('fail');
        }
        observations.emit({
          kind: 'game.completed',
          game: 'five-letter',
          result: isWin ? `${nextGuesses.length}/6` : `X/6`,
          at: new Date().toISOString(),
        });
      }
    }, totalRevealMs);
  }, [activePuzzle, activeAttempt, currentGuess, finished, wordSet, settings.hardMode, rows]);

  const onKey = useCallback(
    (key: string) => {
      if (finished) return;
      if (key === '⏎' || key === 'enter') return submitGuess();
      if (key === '⌫' || key === 'backspace') {
        setCurrentGuess((g) => g.slice(0, -1));
        return;
      }
      if (currentGuess.length >= 5) return;
      // Accept lowercase a-z, accented letters, ñ.
      const ch = key.toLowerCase();
      if (!/^[a-zà-ÿñ]$/u.test(ch)) return;
      setCurrentGuess((g) => g + ch);
    },
    [currentGuess, finished, submitGuess],
  );

  // Physical-keyboard binding for desktop.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onKey('⏎');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onKey('⌫');
      } else if (e.key.length === 1) {
        onKey(e.key);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey]);

  const stats = useMemo(() => {
    let wins = 0;
    let plays = 0;
    let streak = 0;
    let bestStreak = 0;
    const dist: Record<number, number> = {};
    const sorted = Object.values(attempts)
      .filter((a) => a.finished && !a.puzzle_id.startsWith('fl-practice-'))
      .sort((a, b) => a.date.localeCompare(b.date));
    let prevDate: string | null = null;
    for (const a of sorted) {
      plays++;
      if (a.won) {
        wins++;
        const n = a.guesses.length;
        dist[n] = (dist[n] ?? 0) + 1;
      }
      if (prevDate && nextDay(prevDate) !== a.date) {
        streak = a.won ? 1 : 0;
      } else {
        streak = a.won ? streak + 1 : 0;
      }
      if (streak > bestStreak) bestStreak = streak;
      prevDate = a.date;
    }
    return { wins, plays, streak, bestStreak, dist };
  }, [attempts]);

  const share = async () => {
    if (!activeAttempt || !activePuzzle) return;
    const text = shareGrid(rows.map((r) => r.states), activePuzzle.puzzle_id);
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    try {
      if (typeof nav.share === 'function') {
        await nav.share({ text });
        setShareNote('Shared');
      } else {
        await navigator.clipboard.writeText(text);
        setShareNote('Copied to clipboard');
      }
    } catch {
      try { await navigator.clipboard.writeText(text); setShareNote('Copied to clipboard'); }
      catch { setShareNote('Share unavailable'); }
    }
    window.setTimeout(() => setShareNote(null), 2500);
  };

  const startPractice = () => {
    if (!words) return;
    setPracticePuzzle(randomPuzzle(lang, words));
    setCurrentGuess('');
    setActiveMode('practice');
  };

  const goDaily = () => {
    setActiveMode('daily');
    setArchiveDate(null);
    setCurrentGuess('');
  };

  const playArchiveDate = (date: string) => {
    setArchiveDate(date);
    setActiveMode('archive');
    setCurrentGuess('');
    setShowArchive(false);
  };

  // Build last-30-days archive list.
  const archiveDates = useMemo(() => {
    const dates: string[] = [];
    const d = new Date();
    for (let i = 1; i <= 30; i++) {
      const cur = new Date(d);
      cur.setDate(d.getDate() - i);
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const day = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
    return dates;
  }, []);

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Five Letter</h1>
          <p className="muted small">
            {activeMode === 'daily' ? `Daily · ${today}` : activeMode === 'archive' ? `Archive · ${archiveDate ?? today}` : 'Practice mode'}
            {settings.hardMode ? <span className="hardmode-chip">HARD</span> : null}
          </p>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="lang"
            onClick={() => setShowArchive(true)}
            aria-label="Archive"
            title="Archive"
          >📅</button>
          <button
            type="button"
            className="lang"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >⚙</button>
          <button
            type="button"
            className="lang"
            onClick={() => setMutedState(toggleMuted())}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="lang-row">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                className={l.code === lang ? 'lang active' : 'lang'}
                onClick={() => setSettings({ ...settings, lang: l.code })}
                aria-pressed={l.code === lang}
                title={l.label}
              >
                {l.flag}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!words ? (
        <p className="muted">Loading {lang.toUpperCase()} word bank…</p>
      ) : (
        <>
          <section className="grid" aria-label="Guess grid">
            {Array.from({ length: ROWS_PER_GAME }).map((_, ri) => {
              const row = rows[ri];
              const isCurrent = !finished && ri === rows.length;
              const guess = isCurrent ? currentGuess : row?.guess ?? '';
              const states = row?.states;
              const isFlippingRow = flipping?.rowIdx === ri;
              const winRow = finished && won && ri === rows.length - 1;
              return (
                <div
                  key={ri}
                  className={`grid-row${isCurrent && shake ? ' shake' : ''}`}
                  role="row"
                >
                  {Array.from({ length: 5 }).map((_, ci) => {
                    const ch = guess[ci] ?? '';
                    const state = states?.[ci];
                    // During flip, the per-tile state is hidden until
                    // the stagger reveals it. After the row settles,
                    // states are always shown.
                    const revealed = isFlippingRow ? ci <= flipping.revealedThrough : true;
                    const showState = state && revealed;
                    return (
                      <span
                        key={ci}
                        className={[
                          'tile',
                          showState ? `tile-${state}` : '',
                          ch && !state ? 'tile-typed' : '',
                          isFlippingRow ? 'flipping' : '',
                          isFlippingRow && revealed ? 'flipped' : '',
                          winRow && !isFlippingRow ? 'win-bounce' : '',
                        ].filter(Boolean).join(' ')}
                        style={
                          isFlippingRow
                            ? { animationDelay: `${ci * FLIP_STAGGER_MS}ms` }
                            : winRow
                              ? { animationDelay: `${ci * 80}ms` }
                              : undefined
                        }
                      >
                        {ch.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </section>

          <section className="keyboard" aria-label="On-screen keyboard">
            {KEYBOARD_LAYOUTS[lang].map((row, idx) => (
              <div key={idx} className="kb-row">
                {Array.from(row).map((k) => {
                  const state = keyStates[k];
                  const wide = k === '⌫' || k === '⏎';
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`key${state ? ` key-${state}` : ''}${wide ? ' key-wide' : ''}`}
                      onPointerDown={() => onKey(k)}
                      aria-label={k === '⌫' ? 'Backspace' : k === '⏎' ? 'Enter' : k}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            ))}
          </section>

          {hardModeError ? <div className="hardmode-error" aria-live="polite">{hardModeError}</div> : null}

          <Confetti trigger={confettiTrigger} />

          {showSettings ? (
            <div className="modal-backdrop" role="dialog" onClick={() => setShowSettings(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title">Settings</h3>
                <label className="setting-row">
                  <input
                    type="checkbox"
                    checked={settings.hardMode}
                    onChange={(e) => {
                      // Block enabling mid-game (rule integrity).
                      if (rows.length > 0 && !settings.hardMode) {
                        setHardModeError('Enable hard mode before your first guess');
                        window.setTimeout(() => setHardModeError(null), 2400);
                        return;
                      }
                      setSettings({ ...settings, hardMode: e.target.checked });
                    }}
                  />
                  <span>
                    <strong>Hard mode</strong>
                    <span className="muted small"> — revealed letters must be reused in subsequent guesses</span>
                  </span>
                </label>
                <p className="muted small">Streak counts both modes equally; hard mode shows in your stats only after a hard-mode win.</p>
                <button type="button" className="primary" onClick={() => setShowSettings(false)}>Done</button>
              </div>
            </div>
          ) : null}

          {showArchive ? (
            <div className="modal-backdrop" role="dialog" onClick={() => setShowArchive(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title">Archive · last 30 days</h3>
                <p className="muted small">Replay any past day. Doesn't affect your daily streak.</p>
                <div className="archive-grid">
                  {archiveDates.map((d) => {
                    const id = `fl-${d}-${lang}-${BANK_VERSION}`;
                    const a = attempts[id];
                    const cls = a?.won ? 'archive-day won' : a?.finished ? 'archive-day lost' : 'archive-day';
                    return (
                      <button key={d} type="button" className={cls} onClick={() => playArchiveDate(d)} title={d}>
                        {d.slice(5)}
                        {a?.won ? <span> ✓</span> : a?.finished ? <span> ✗</span> : null}
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="ghost" onClick={() => setShowArchive(false)}>Close</button>
              </div>
            </div>
          ) : null}

          {finished ? (
            <section className="finish" aria-live="polite">
              <p className="finish-line">
                {won ? '🎉 ' : ''}
                {won
                  ? `Solved in ${activeAttempt!.guesses.length}/6.`
                  : `Today's word was ${activePuzzle!.answer.toUpperCase()}.`}
              </p>
              {activeMode === 'daily' ? (
                <div className="row-actions">
                  <button type="button" className="primary" onClick={share}>Share grid</button>
                  <button type="button" className="ghost" onClick={startPractice}>Practice another</button>
                </div>
              ) : (
                <div className="row-actions">
                  <button type="button" className="primary" onClick={startPractice}>Another practice</button>
                  <button type="button" className="ghost" onClick={goDaily}>Back to daily</button>
                </div>
              )}
              {shareNote ? <p className="muted small">{shareNote}</p> : null}
            </section>
          ) : null}

          <section className="stats">
            <h2>Your patterns</h2>
            <p className="muted small">
              {stats.plays} played · {stats.wins ? Math.round((stats.wins / stats.plays) * 100) : 0}% won · streak {stats.streak} (best {stats.bestStreak})
            </p>
            {stats.wins > 0 ? (
              <div className="dist">
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const count = stats.dist[n] ?? 0;
                  const max = Math.max(1, ...Object.values(stats.dist));
                  const pct = (count / max) * 100;
                  return (
                    <div key={n} className="dist-row">
                      <span className="dist-label">{n}</span>
                      <div className="dist-bar">
                        <div className="dist-fill" style={{ width: `${pct}%` }}>{count > 0 ? count : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
