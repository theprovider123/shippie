import { useState, useId } from 'react';
import type { ChiwitState, MoodWord, DayLog } from '../lib/store';
import { todayLocal } from '../lib/store';
import { Stem } from '../components/Stem';
import { VoiceSheet } from '../sheets/Voice';
import { TomorrowSheet } from '../sheets/Tomorrow';
import { YourWordsSheet } from '../sheets/YourWords';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

interface TodayProps {
  state: ChiwitState;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
  onBroadcastMood: (word: MoodWord, note?: string) => void;
  onBroadcastHydration: () => void;
  onBroadcastSleep: (hours: number) => void;
  onBroadcastMovement: () => void;
  shippie: ShippieIframeSdk;
}

const MOOD_WORDS: MoodWord[] = ['heavy', 'low', 'okay', 'light', 'bright'];

const HOUR_WORDS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
  11: 'eleven', 12: 'twelve',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning.';
  if (h >= 12 && h < 17) return 'afternoon.';
  if (h >= 17 && h < 22) return 'evening.';
  return 'late.';
}

function formatDate(countThisWeek: number): React.ReactNode {
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const dayName = dayNames[now.getDay()];
  const day = now.getDate();
  const month = monthNames[now.getMonth()];

  return (
    <>
      {dayName} {day} {month} ·{' '}
      <span className="chiwit-today__date-highlight">
        {countThisWeek} {countThisWeek === 1 ? 'day' : 'days'} of little things this week
      </span>
    </>
  );
}

function weekDaysLogged(days: Record<string, DayLog>): number {
  const now = new Date();
  // Get start of current week (Sunday)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  let count = 0;
  for (const [dateStr, day] of Object.entries(days)) {
    const d = new Date(dateStr + 'T00:00:00');
    if (d >= startOfWeek && d <= endOfWeek) {
      const hasThings = Object.values(day.things).length > 0 || day.mood;
      if (hasThings) count++;
    }
  }
  return count;
}

function thingsCount(day: DayLog | undefined): number {
  if (!day) return 0;
  let count = 0;
  if (day.things['medication']) count++;
  const water = day.things['water'];
  if (water?.action === 'done' && (water.count ?? 0) >= 1) count++;
  if (day.things['movement']?.action === 'done') count++;
  if (day.things['sleep']?.action === 'done') count++;
  return count;
}

function footerText(count: number): string {
  if (count === 0) return 'the day is still open';
  if (count === 1) return 'one little thing — a start';
  if (count === 2) return 'two little things today — they add up';
  if (count === 3) return 'three things. you\'re doing it.';
  return 'all four, quietly done.';
}

function sleepLabel(day: DayLog | undefined): string {
  const entry = day?.things['sleep'];
  if (!entry) return 'sleep, not logged. no rush.';
  if (entry.action !== 'done') return 'sleep, not logged. no rush.';
  const m = (entry.detail ?? '').match(/^([\d.]+)h/);
  if (m && m[1]) {
    const hours = parseFloat(m[1]);
    const whole = Math.round(hours);
    const word = HOUR_WORDS[whole] ?? String(whole);
    return `${word} hours of sleep, give or take.`;
  }
  return 'sleep, noted.';
}

function waterLabel(count: number): React.ReactNode {
  if (count === 0) return <em>no water yet — even one glass counts.</em>;
  if (count === 1) return 'one glass of water, so far.';
  if (count === 2) return 'two glasses of water today.';
  return `${count} glasses of water today.`;
}

export function Today({
  state,
  setState,
  onBroadcastMood,
  onBroadcastHydration,
  onBroadcastSleep,
  onBroadcastMovement,
}: TodayProps) {
  const today = todayLocal();
  const day = state.days[today];
  const mood = day?.mood;
  const medEntry = day?.things['medication'];
  const waterEntry = day?.things['water'];
  const waterCount = waterEntry?.action === 'done' ? (waterEntry.count ?? 0) : 0;
  const hasMoved = day?.things['movement']?.action === 'done';
  const hasSleep = day?.things['sleep']?.action === 'done';
  const medDone = medEntry?.action === 'done';
  const medSkipped = medEntry?.action === 'skipped';

  const [journalText, setJournalText] = useState('');
  const [showVoice, setShowVoice] = useState(false);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [showYourWords, setShowYourWords] = useState(false);
  const [subNav, setSubNav] = useState<'today' | 'tomorrow' | 'yourwords'>('today');

  const journalId = useId();

  const coreCount = thingsCount(day);
  const allCoreDone = coreCount >= 4;
  const weekCount = weekDaysLogged(state.days);

  function setMood(word: MoodWord) {
    setState((prev) => {
      const days = { ...prev.days };
      const existing = days[today] ?? { date: today, things: {}, journal: [] };
      days[today] = { ...existing, mood: word };
      return { ...prev, days };
    });
    onBroadcastMood(word);
  }

  function incrementWater() {
    setState((prev) => {
      const days = { ...prev.days };
      const existing = days[today] ?? { date: today, things: {}, journal: [] };
      const prevCount = existing.things['water']?.count ?? 0;
      days[today] = {
        ...existing,
        things: {
          ...existing.things,
          water: { kind: 'water', action: 'done', count: prevCount + 1, at: Date.now() },
        },
      };
      return { ...prev, days };
    });
    onBroadcastHydration();
  }

  function toggleMed() {
    setState((prev) => {
      const days = { ...prev.days };
      const existing = days[today] ?? { date: today, things: {}, journal: [] };
      const cur = existing.things['medication'];
      let next: 'done' | 'skipped' | undefined;
      if (!cur) next = 'done';
      else if (cur.action === 'done') next = 'skipped';
      else next = undefined;

      const things = { ...existing.things };
      if (next === undefined) {
        delete things['medication'];
      } else {
        things['medication'] = { kind: 'medication', action: next, at: Date.now() };
      }
      days[today] = { ...existing, things };
      return { ...prev, days };
    });
  }

  function toggleMovement() {
    setState((prev) => {
      const days = { ...prev.days };
      const existing = days[today] ?? { date: today, things: {}, journal: [] };
      const cur = existing.things['movement'];
      const things = { ...existing.things };
      if (cur?.action === 'done') {
        delete things['movement'];
      } else {
        things['movement'] = { kind: 'movement', action: 'done', at: Date.now() };
        onBroadcastMovement();
      }
      days[today] = { ...existing, things };
      return { ...prev, days };
    });
  }

  function toggleSleep() {
    setState((prev) => {
      const days = { ...prev.days };
      const existing = days[today] ?? { date: today, things: {}, journal: [] };
      const cur = existing.things['sleep'];
      const things = { ...existing.things };
      if (cur?.action === 'done') {
        delete things['sleep'];
      } else {
        things['sleep'] = { kind: 'sleep', action: 'done', at: Date.now() };
        onBroadcastSleep(0);
      }
      days[today] = { ...existing, things };
      return { ...prev, days };
    });
  }

  function submitJournal(e: React.FormEvent) {
    e.preventDefault();
    const text = journalText.trim();
    if (!text) return;
    const entry = { id: crypto.randomUUID(), text, at: Date.now() };
    setState((prev) => {
      const days = { ...prev.days };
      const existing = days[today] ?? { date: today, things: {}, journal: [] };
      days[today] = { ...existing, journal: [...existing.journal, entry] };
      return { ...prev, days };
    });
    setJournalText('');
  }

  function handleSubNav(sub: 'today' | 'tomorrow' | 'yourwords') {
    setSubNav(sub);
    if (sub === 'tomorrow') { setShowTomorrow(true); setShowVoice(false); setShowYourWords(false); }
    if (sub === 'yourwords') { setShowYourWords(true); setShowVoice(false); setShowTomorrow(false); }
    if (sub === 'today') { setShowTomorrow(false); setShowVoice(false); setShowYourWords(false); }
  }

  return (
    <div className="chiwit-screen chiwit-today">
      <p className="chiwit-today__greeting">{greeting()}</p>
      <p className="chiwit-today__date">{formatDate(weekCount)}</p>

      {/* Mood line */}
      <p className="chiwit-today__prose-line chiwit-today__mood-line">
        {MOOD_WORDS.map((word, i) => (
          <span key={word}>
            {i > 0 && <span className="chiwit-today__dot"> · </span>}
            <button
              type="button"
              className={`chiwit-today__mood-word ${mood === word ? 'is-selected' : ''}`}
              onClick={() => setMood(word)}
            >
              {word}
            </button>
          </span>
        ))}
      </p>

      {/* Habit lines */}
      <div className="chiwit-today__habits">
        {/* Medication */}
        <button
          type="button"
          className={`chiwit-today__prose-line chiwit-today__habit-line ${medDone ? 'is-done' : medSkipped ? 'is-skipped' : 'is-pending'}`}
          onClick={toggleMed}
        >
          {medDone
            ? 'your meds, taken with breakfast.'
            : medSkipped
            ? 'your meds — skipped today. noted, nothing more.'
            : <em>your meds — whenever you're ready.</em>}
        </button>

        {/* Water */}
        <button
          type="button"
          className={`chiwit-today__prose-line chiwit-today__habit-line ${waterCount > 0 ? 'is-done' : 'is-pending'}`}
          onClick={incrementWater}
        >
          {waterLabel(waterCount)}
        </button>

        {/* Movement */}
        <button
          type="button"
          className={`chiwit-today__prose-line chiwit-today__habit-line ${hasMoved ? 'is-done' : 'is-pending'}`}
          onClick={toggleMovement}
        >
          {hasMoved
            ? 'you walked. it counted.'
            : <em>no walk yet — even a short one counts.</em>}
        </button>

        {/* Sleep */}
        <button
          type="button"
          className={`chiwit-today__prose-line chiwit-today__habit-line ${hasSleep ? 'is-done' : 'is-pending'}`}
          onClick={toggleSleep}
        >
          {hasSleep
            ? sleepLabel(day)
            : <em>sleep, not logged. no rush.</em>}
        </button>
      </div>

      {/* Adopted words */}
      {state.adoptedWords.length > 0 && (
        <div className="chiwit-today__adopted-words">
          {state.adoptedWords.map((word) => (
            <span key={word} className="chiwit-today__adopted-word">{word}</span>
          ))}
        </div>
      )}

      {/* Journal */}
      <form className="chiwit-today__journal" onSubmit={submitJournal}>
        <label htmlFor={journalId} className="chiwit-today__journal-label">worth keeping?</label>
        <input
          id={journalId}
          type="text"
          className="chiwit-today__journal-input"
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          placeholder=""
          aria-label="Journal entry"
        />
      </form>

      {day?.journal && day.journal.length > 0 && (
        <ul className="chiwit-today__journal-entries">
          {day.journal.map((entry) => (
            <li key={entry.id} className="chiwit-today__journal-entry">{entry.text}</li>
          ))}
        </ul>
      )}

      {/* Stem flourish */}
      {coreCount > 0 && (
        <Stem thingsCount={coreCount} allDone={allCoreDone} />
      )}

      {/* Footer */}
      <p className="chiwit-today__footer">{footerText(coreCount)}</p>

      {/* Quiet links */}
      <div className="chiwit-today__links">
        <button type="button" className="chiwit-today__quiet-link" onClick={() => setShowVoice(true)}>
          speak it
        </button>
        <button type="button" className="chiwit-today__quiet-link" onClick={() => handleSubNav('tomorrow')}>
          tomorrow
        </button>
        <button type="button" className="chiwit-today__quiet-link" onClick={() => handleSubNav('yourwords')}>
          your words
        </button>
      </div>

      {/* Sheets */}
      {showVoice && (
        <VoiceSheet onClose={() => setShowVoice(false)} setState={setState} />
      )}
      {showTomorrow && (
        <TomorrowSheet
          state={state}
          setState={setState}
          onClose={() => { setShowTomorrow(false); setSubNav('today'); }}
          onNavigate={(sub) => {
            if (sub === 'today') { setShowTomorrow(false); setSubNav('today'); }
            if (sub === 'yourwords') { setShowTomorrow(false); setShowYourWords(true); setSubNav('yourwords'); }
          }}
        />
      )}
      {showYourWords && (
        <YourWordsSheet
          state={state}
          setState={setState}
          onClose={() => { setShowYourWords(false); setSubNav('today'); }}
        />
      )}

      {/* Sub-nav indicator */}
      {subNav !== 'today' && (
        <div style={{ display: 'none' }} aria-hidden="true" data-subnav={subNav} />
      )}
    </div>
  );
}
