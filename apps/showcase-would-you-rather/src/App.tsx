import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { questionForDate, todayKey, type DailyQuestion } from './questions';

/**
 * Would You Rather — daily two-tap question.
 *
 * Question is deterministic from the date + bank version, so the same
 * day shows the same question on every device. Personal-history % only
 * — no cross-user aggregation in v1 (per plan).
 *
 * Storage: localStorage of {question_id → choice}. 60-day rolling
 * history powers the personal stats panel ("you picked A 70% of the
 * time over your last 30 days of play").
 */

interface Answer {
  question_id: string;
  date: string;
  choice: 'a' | 'b';
}

const STORAGE_KEY = 'shippie:wyr:v1';

const sdk = createShippieIframeSdk({ appId: 'app_would_you_rather' });
const observations = createObservationClient(sdk);

function loadAnswers(): Record<string, Answer> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) ?? {}) as Record<string, Answer>;
  } catch {
    return {};
  }
}

function saveAnswers(rows: Record<string, Answer>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* best-effort */
  }
}

export function App() {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => loadAnswers());
  const today = todayKey();
  const todayQ: DailyQuestion = useMemo(() => questionForDate(today), [today]);
  const todayAnswer = answers[todayQ.question_id];

  useEffect(() => { saveAnswers(answers); }, [answers]);

  const choose = (choice: 'a' | 'b') => {
    if (todayAnswer) return;
    haptic('success');
    const row: Answer = { question_id: todayQ.question_id, date: today, choice };
    setAnswers((prev) => ({ ...prev, [todayQ.question_id]: row }));
    observations.emit({
      kind: 'preference.choice',
      question_id: todayQ.question_id,
      choice,
      at: new Date().toISOString(),
    });
  };

  const stats = useMemo(() => {
    const rows = Object.values(answers);
    const total = rows.length;
    const aCount = rows.filter((r) => r.choice === 'a').length;
    const bCount = total - aCount;
    return { total, aCount, bCount };
  }, [answers]);

  const aPct = stats.total > 0 ? Math.round((stats.aCount / stats.total) * 100) : 0;
  const bPct = stats.total > 0 ? 100 - aPct : 0;

  return (
    <main className="app">
      <header>
        <h1>Would You Rather</h1>
        <p className="muted">A new question each day. Your answers stay on this device.</p>
      </header>

      <section className="question">
        <button
          type="button"
          className={`option ${todayAnswer?.choice === 'a' ? 'picked' : ''} ${todayAnswer && todayAnswer.choice !== 'a' ? 'fade' : ''}`}
          onClick={() => choose('a')}
          disabled={!!todayAnswer}
        >
          <span className="letter">A</span>
          <span className="text">{todayQ.a}</span>
        </button>

        <div className="or">or</div>

        <button
          type="button"
          className={`option ${todayAnswer?.choice === 'b' ? 'picked' : ''} ${todayAnswer && todayAnswer.choice !== 'b' ? 'fade' : ''}`}
          onClick={() => choose('b')}
          disabled={!!todayAnswer}
        >
          <span className="letter">B</span>
          <span className="text">{todayQ.b}</span>
        </button>
      </section>

      {todayAnswer ? (
        <section className="result" aria-live="polite">
          <p>You picked <strong>{todayAnswer.choice === 'a' ? todayQ.a : todayQ.b}</strong>.</p>
          <p className="muted small">Come back tomorrow for the next question.</p>
        </section>
      ) : null}

      {stats.total > 0 ? (
        <section className="stats">
          <h2>Your patterns</h2>
          <p className="muted small">{stats.total} answered · {aPct}% A · {bPct}% B</p>
          <div className="bar" aria-hidden>
            <div className="fill-a" style={{ width: `${aPct}%` }} />
            <div className="fill-b" style={{ width: `${bPct}%` }} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
