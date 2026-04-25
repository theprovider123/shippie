import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterSuggestions } from '../db/queries.ts';

export interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  candidates: string[];
  placeholder?: string;
  required?: boolean;
  name?: string;
  ariaLabel?: string;
}

/**
 * Plain `<input autocomplete="shippie">` element. The wrapper's
 * text-autocomplete rule wires real suggestions in production; this
 * component renders an in-page suggestion popover so the showcase
 * works in dev and demonstrates the same UX.
 */
export function AutocompleteInput({
  value,
  onChange,
  candidates,
  placeholder,
  required,
  name,
  ariaLabel,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const ref = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => filterSuggestions(value, candidates).filter((c) => c.toLowerCase() !== value.trim().toLowerCase()),
    [value, candidates],
  );

  useEffect(() => {
    setActive(0);
  }, [value]);

  return (
    <div className="autocomplete">
      <input
        ref={ref}
        type="text"
        autoComplete="shippie"
        name={name}
        value={value}
        placeholder={placeholder}
        required={required}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && suggestions.length > 0}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(suggestions.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && suggestions[active]) {
            e.preventDefault();
            onChange(suggestions[active]!);
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <ul className="autocomplete-list" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'autocomplete-active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
