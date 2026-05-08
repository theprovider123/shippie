import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  edited: boolean;
  onChange: (next: string) => void;
}

/**
 * Contenteditable transcript with save-on-blur. We deliberately don't
 * round-trip caret position on each keystroke — that fights the user
 * and breaks IME composition. Instead we accept the divergence: the
 * DOM holds the live edit; React state catches up on blur.
 */
export function EditableTranscript({ value, edited, onChange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Sync the DOM whenever the canonical value changes from the
    // outside (e.g. fresh transcription replacing a draft).
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  function handleBlur() {
    const next = ref.current?.textContent ?? '';
    if (next !== value) onChange(next);
  }

  return (
    <div className="vm-editable">
      <div
        ref={ref}
        className="vm-editable-text"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onBlur={handleBlur}
        role="textbox"
        aria-multiline="true"
        aria-label="Transcript — edit if Whisper got it wrong"
      />
      <p className="muted small vm-editable-hint">
        {edited
          ? 'Edited by you · Whisper kept the original audio.'
          : 'Auto-filled by Whisper-tiny. Tap to edit if it got something wrong.'}
      </p>
    </div>
  );
}
