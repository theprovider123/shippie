import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { summarizeQuiet, type QuietSession } from './quiet.ts';

const shippie = createShippieIframeSdk({ appId: 'app_quiet' });
const STORAGE_KEY = 'shippie.quiet.v1';
const BREATH_SECONDS = 60;
const FOCUS_SECONDS = 25 * 60;
type Mode = 'breath' | 'focus' | 'mood';

function load(): QuietSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { sessions?: unknown };
    return Array.isArray(parsed.sessions) ? parsed.sessions as QuietSession[] : [];
  } catch {
    return [];
  }
}

function save(sessions: readonly QuietSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions }));
  } catch {
    /* local quota errors are non-fatal */
  }
}

export function App() {
  const [sessions, setSessions] = useState<QuietSession[]>(() => load());
  const [mode, setMode] = useState<Mode>('breath');
  const localNavigation = useMemo(
    () => createLocalNavigation<Mode>('breath', setMode),
    [],
  );
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [moodScore, setMoodScore] = useState(3);
  const [note, setNote] = useState('');
  const startedAt = useRef<number | null>(null);

  useEffect(() => save(sessions), [sessions]);
  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  useEffect(() => {
    shippie.requestIntent('caffeine-logged');
    shippie.requestIntent('workout-completed');
    shippie.requestIntent('sleep-logged');
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (startedAt.current === null) startedAt.current = Date.now();
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const target = mode === 'breath' ? BREATH_SECONDS : FOCUS_SECONDS;
    if (mode === 'mood' || elapsed < target) return;
    finishTimedSession();
  }, [elapsed, mode, running]);

  const summary = useMemo(() => summarizeQuiet(sessions), [sessions]);
  const recent = sessions.slice(0, 8);
  const targetSeconds = mode === 'breath' ? BREATH_SECONDS : FOCUS_SECONDS;
  const remaining = Math.max(0, targetSeconds - elapsed);
  const ringProgress = mode === 'mood' ? moodScore / 5 : Math.min(1, elapsed / targetSeconds);

  function start() {
    if (mode === 'mood') return;
    startedAt.current = Date.now();
    setElapsed(0);
    setRunning(true);
    shippie.feel.texture('confirm');
  }

  function stop() {
    setRunning(false);
    startedAt.current = null;
    setElapsed(0);
    shippie.feel.texture('toggle');
  }

  function finishTimedSession() {
    const kind = mode === 'focus' ? 'focus' : 'breath';
    const durationSeconds = mode === 'focus' ? FOCUS_SECONDS : BREATH_SECONDS;
    const session: QuietSession = {
      id: `quiet_${Date.now()}`,
      kind,
      durationSeconds,
      createdAt: Date.now(),
    };
    setSessions((prev) => [session, ...prev].slice(0, 100));
    setRunning(false);
    startedAt.current = null;
    setElapsed(0);
    shippie.feel.texture('milestone');
    if (kind === 'focus') {
      shippie.intent.broadcast('focus-session', [
        { kind: 'focus-session', title: '25-minute focus', durationMin: 25, finishedAt: new Date().toISOString() },
      ]);
    } else {
      shippie.intent.broadcast('mindful-session', [
        { kind: 'breath', pattern: 'quiet-minute', duration_seconds: durationSeconds, completed_at: new Date().toISOString() },
      ]);
    }
  }

  function logMood() {
    const session: QuietSession = {
      id: `quiet_${Date.now()}`,
      kind: 'mood',
      score: moodScore,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    };
    setSessions((prev) => [session, ...prev].slice(0, 100));
    setNote('');
    shippie.feel.texture('confirm');
    shippie.intent.broadcast('mood-logged', [
      { score: moodScore, note: session.note, logged_at: new Date(session.createdAt).toISOString() },
    ]);
  }

  return (
    <main {...(running ? { 'data-shippie-wakelock': true } : {})}>
      <header>
        <p className="eyebrow">Quiet</p>
        <h1>One calmer surface.</h1>
        <p>Breath, focus, and mood stay local, but still feed Daily.</p>
      </header>

      <section className="modes" aria-label="Quiet modes">
        {(['breath', 'focus', 'mood'] as const).map((next) => (
          <button
            key={next}
            type="button"
            className={mode === next ? 'active' : ''}
            onClick={() => {
              stop();
              void localNavigation.navigate(next, { kind: 'crossfade' });
            }}
          >
            {next}
          </button>
        ))}
      </section>

      <section className="ritual" aria-live="polite">
        <div className="ring" style={{ '--progress': ringProgress } as CSSProperties}>
          <div>
            <strong>{mode === 'mood' ? moodScore : formatSeconds(remaining)}</strong>
            <small>{mode === 'breath' ? 'quiet minute' : mode === 'focus' ? 'focus block' : 'mood score'}</small>
          </div>
        </div>

        {mode === 'mood' ? (
          <div className="mood-panel">
            <label>
              <span>mood - {moodScore}/5</span>
              <input
                type="range"
                min={1}
                max={5}
                value={moodScore}
                onChange={(event) => setMoodScore(Number(event.target.value))}
              />
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 160))}
              placeholder="one line, optional"
              rows={2}
            />
            <button type="button" className="primary" onClick={logMood}>Log mood</button>
          </div>
        ) : (
          <div className="actions">
            {running ? (
              <>
                <button type="button" className="primary" onClick={finishTimedSession}>Finish</button>
                <button type="button" onClick={stop}>Stop</button>
              </>
            ) : (
              <button type="button" className="primary" onClick={start}>
                Start {mode === 'focus' ? 'focus' : 'breath'}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="summary" aria-label="Quiet summary">
        <div><strong>{summary.breath}</strong><span>breath</span></div>
        <div><strong>{summary.focus}</strong><span>focus</span></div>
        <div><strong>{summary.mood}</strong><span>mood</span></div>
        <div><strong>{summary.averageMood === null ? '-' : summary.averageMood.toFixed(1)}</strong><span>avg mood</span></div>
      </section>

      <section className="recent">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="empty">Start a breath, finish a focus block, or log a mood. Daily receives the signal.</p>
        ) : (
          <ul>
            {recent.map((session) => (
              <li key={session.id}>
                <strong>{session.kind}</strong>
                <small>
                  {session.kind === 'mood' ? `${session.score}/5` : formatSeconds(session.durationSeconds ?? 0)}
                  {' - '}
                  {new Date(session.createdAt).toLocaleDateString()}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
