import { useState } from 'react';
import { parseDayText } from '../lib/parser';
import type { ParsedItem } from '../lib/parser';
import type { ChiwitState, MoodWord } from '../lib/store';
import { todayLocal } from '../lib/store';

interface VoiceSheetProps {
  onClose: () => void;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
}

const MOOD_WORDS: MoodWord[] = ['heavy', 'low', 'okay', 'light', 'bright'];

function itemIcon(item: ParsedItem): string {
  switch (item.kind) {
    case 'medication': return '💊';
    case 'sleep': return '🌙';
    case 'movement': return '🚶';
    case 'water': return '💧';
    case 'mood': return '☀️';
    default: return '·';
  }
}

function itemDetail(item: ParsedItem): string {
  switch (item.kind) {
    case 'medication': return `medication · ${item.action}`;
    case 'sleep': return `sleep · ${item.detail}`;
    case 'movement': return `movement · done`;
    case 'water': return `water · ${item.count} glass${item.count === 1 ? '' : 'es'}`;
    case 'mood': return `mood · ${item.mood}`;
    default: return '';
  }
}

export function VoiceSheet({ onClose, setState }: VoiceSheetProps) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [moodOverride, setMoodOverride] = useState<MoodWord[]>([]);

  function handleParse() {
    const items = parseDayText(text);
    setParsed(items);
    setChecked(items.map(() => true));
    setMoodOverride(items.map((item) => (item.kind === 'mood' ? item.mood : 'okay')));
  }

  function cycleMood(idx: number) {
    setMoodOverride((prev) => {
      const next = [...prev];
      const cur = MOOD_WORDS.indexOf(next[idx] as MoodWord);
      const nextMood = MOOD_WORDS[(cur + 1) % MOOD_WORDS.length];
      if (nextMood) next[idx] = nextMood;
      return next;
    });
  }

  function handleKeepAll() {
    if (!parsed) return;
    const today = todayLocal();
    const at = Date.now();

    setState((prev) => {
      const days = { ...prev.days };
      if (!days[today]) {
        days[today] = { date: today, things: {}, journal: [] };
      }
      const day = { ...days[today], things: { ...days[today].things }, journal: [...days[today].journal] };

      parsed.forEach((item, i) => {
        if (!checked[i]) return;

        if (item.kind === 'medication') {
          day.things['medication'] = { kind: 'medication', action: item.action, at };
        } else if (item.kind === 'sleep') {
          day.things['sleep'] = { kind: 'sleep', action: 'done', detail: item.detail, at };
        } else if (item.kind === 'movement') {
          day.things['movement'] = { kind: 'movement', action: 'done', at };
        } else if (item.kind === 'water') {
          const existing = day.things['water'];
          const prevCount = existing?.action === 'done' ? (existing.count ?? 0) : 0;
          day.things['water'] = { kind: 'water', action: 'done', count: prevCount + item.count, at };
        } else if (item.kind === 'mood') {
          day.mood = moodOverride[i] as MoodWord;
        }
      });

      days[today] = day;
      return { ...prev, days };
    });

    onClose();
  }

  const keptCount = checked.filter(Boolean).length;

  return (
    <div className="chiwit-sheet-overlay" role="dialog" aria-modal="true" aria-label="Speak it">
      <div className="chiwit-sheet">
        <button type="button" className="chiwit-sheet__close" onClick={onClose} aria-label="Close">×</button>

        <div className="chiwit-voice__mic-circle">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="11" y="4" width="10" height="16" rx="5" stroke="#A84136" strokeWidth="1.5" />
            <path d="M6 17 C6 24 26 24 26 17" stroke="#A84136" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <line x1="16" y1="24" x2="16" y2="28" stroke="#A84136" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <textarea
          className="chiwit-voice__textarea"
          placeholder="speak or type it"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          aria-label="Voice or text input"
        />

        {!parsed && (
          <button
            type="button"
            className="chiwit-btn-primary"
            onClick={handleParse}
            disabled={!text.trim()}
          >
            parse
          </button>
        )}

        {parsed && parsed.length > 0 && (
          <div className="chiwit-voice__results">
            <p className="chiwit-voice__heard">
              I HEARD {parsed.length} THING{parsed.length === 1 ? '' : 'S'} — SOUND RIGHT?
            </p>
            <ul className="chiwit-voice__items">
              {parsed.map((item, i) => (
                <li key={i} className="chiwit-voice__item">
                  <button
                    type="button"
                    className={`chiwit-voice__check ${checked[i] ? 'is-checked' : ''}`}
                    onClick={() => setChecked((prev) => { const n = [...prev]; n[i] = !n[i]; return n; })}
                    aria-pressed={checked[i]}
                  >
                    {checked[i] ? '✓' : '○'}
                  </button>
                  <span className="chiwit-voice__item-icon">{itemIcon(item)}</span>
                  <span className="chiwit-voice__item-phrase">{item.phrase}</span>
                  <span className="chiwit-voice__item-detail">{itemDetail(item)}</span>
                  {item.kind === 'mood' && (
                    <button
                      type="button"
                      className="chiwit-voice__mood-change"
                      onClick={() => cycleMood(i)}
                    >
                      change
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="chiwit-btn-primary"
              onClick={handleKeepAll}
            >
              keep all {keptCount}
            </button>

            <p className="chiwit-voice__footer">
              the voice note itself is gone — unless you want it saved
            </p>
          </div>
        )}

        {parsed && parsed.length === 0 && (
          <p className="chiwit-voice__nothing">nothing recognised — try rephrasing</p>
        )}
      </div>
    </div>
  );
}
