import { useState } from 'react';
import type { ChiwitState } from '../lib/store';

interface YourWordsSheetProps {
  state: ChiwitState;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
  onClose: () => void;
}

const BUILT_IN_WORDS: Record<string, string[]> = {
  Body: ['period', 'bloating', 'migraine', 'energy'],
  Mind: ['reading', 'meditation', 'worry'],
  Moving: ['stretching', 'a run', 'yoga'],
};

export function YourWordsSheet({ state, setState, onClose }: YourWordsSheetProps) {
  const [customInput, setCustomInput] = useState('');

  function toggle(word: string) {
    setState((prev) => {
      const adopted = prev.adoptedWords.includes(word)
        ? prev.adoptedWords.filter((w) => w !== word)
        : [...prev.adoptedWords, word];
      return { ...prev, adoptedWords: adopted };
    });
  }

  function addCustom() {
    const word = customInput.trim().toLowerCase();
    if (!word) return;
    if (state.adoptedWords.includes(word)) {
      setCustomInput('');
      return;
    }
    setState((prev) => ({ ...prev, adoptedWords: [...prev.adoptedWords, word] }));
    setCustomInput('');
  }

  return (
    <div className="chiwit-sheet-overlay" role="dialog" aria-modal="true" aria-label="Your words">
      <div className="chiwit-sheet chiwit-yourwords">
        <button type="button" className="chiwit-sheet__close" onClick={onClose} aria-label="Close">×</button>

        <h2 className="chiwit-yourwords__title">your words</h2>
        <p className="chiwit-yourwords__subtitle">
          the things you track are just words you keep. add one, drop one — your day grows with you.
        </p>

        {Object.entries(BUILT_IN_WORDS).map(([category, words]) => (
          <div key={category} className="chiwit-yourwords__category">
            <p className="chiwit-yourwords__cat-label">{category}</p>
            <ul className="chiwit-yourwords__list">
              {words.map((word) => {
                const adopted = state.adoptedWords.includes(word);
                return (
                  <li key={word}>
                    <button
                      type="button"
                      className={`chiwit-yourwords__word ${adopted ? 'is-adopted' : ''}`}
                      onClick={() => toggle(word)}
                      aria-pressed={adopted}
                    >
                      {word}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Custom adopted words not in built-ins */}
        {state.adoptedWords.filter(
          (w) => !Object.values(BUILT_IN_WORDS).flat().includes(w)
        ).length > 0 && (
          <div className="chiwit-yourwords__category">
            <p className="chiwit-yourwords__cat-label">Yours</p>
            <ul className="chiwit-yourwords__list">
              {state.adoptedWords
                .filter((w) => !Object.values(BUILT_IN_WORDS).flat().includes(w))
                .map((word) => (
                  <li key={word}>
                    <button
                      type="button"
                      className="chiwit-yourwords__word is-adopted"
                      onClick={() => toggle(word)}
                      aria-pressed={true}
                    >
                      {word}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="chiwit-yourwords__add">
          <input
            type="text"
            placeholder="+ a word of your own"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
            className="chiwit-yourwords__input"
            aria-label="Add a custom word"
          />
          {customInput.trim() && (
            <button type="button" className="chiwit-btn-ghost" onClick={addCustom}>add</button>
          )}
        </div>

        <p className="chiwit-yourwords__footer">
          each word becomes a line in your day — phrased kindly, counted privately.
        </p>
      </div>
    </div>
  );
}
