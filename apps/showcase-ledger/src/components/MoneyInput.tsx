import { useEffect, useId, useRef, useState } from 'react';
import { parseAmountToCents, currencySymbol } from '../db/queries.ts';

export interface MoneyInputProps {
  /** Controlled value as cents, or null when empty/invalid. */
  valueCents: number | null;
  onChange(cents: number | null): void;
  currency: string;
  autoFocus?: boolean;
  /** Pre-fill the text field (only on mount). Useful for intent-driven prompts. */
  initialText?: string;
}

/**
 * MoneyInput — accepts `12.50` or `12` and reports cents.
 *
 * Voice doc says errors are: "That amount didn't parse. Try `12.50` or `12`."
 * We surface it as a small line under the field, not a modal.
 *
 * Internal state is the raw text the user typed, so they can keep editing
 * "12." mid-typing without the field jumping. We only emit non-null cents
 * once the input parses cleanly.
 */
export function MoneyInput({
  valueCents,
  onChange,
  currency,
  autoFocus,
  initialText,
}: MoneyInputProps) {
  const id = useId();
  const [text, setText] = useState<string>(() => {
    if (initialText !== undefined) return initialText;
    if (valueCents === null) return '';
    return formatForInput(valueCents);
  });
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount when requested. Avoids the parent reaching for refs.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const trimmed = text.trim();
  const cents = trimmed ? parseAmountToCents(trimmed) : null;
  const showError = touched && trimmed !== '' && cents === null;

  function handleChange(next: string) {
    setText(next);
    const parsed = next.trim() ? parseAmountToCents(next.trim()) : null;
    onChange(parsed);
  }

  return (
    <div className="field">
      <label htmlFor={id}>Amount ({currency})</label>
      <input
        ref={inputRef}
        id={id}
        className="amount-input"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={`${currencySymbol(currency)}0.00`}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={showError}
      />
      {showError ? (
        <span className="error">That amount didn't parse. Try `12.50` or `12`.</span>
      ) : null}
    </div>
  );
}

function formatForInput(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${minor}`;
}
