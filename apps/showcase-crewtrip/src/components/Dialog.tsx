import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let openDialogCount = 0;
let previousBodyOverflow = '';
let previousBodyTouchAction = '';
let previousHtmlOverflow = '';

export function Dialog({ open, onClose, label, children, className }: DialogProps) {
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    if (openDialogCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousBodyTouchAction = document.body.style.touchAction;
      previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      document.documentElement.style.overflow = 'hidden';
    }
    openDialogCount += 1;
    if (sheet) {
      const first = sheet.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.body.style.touchAction = previousBodyTouchAction;
        document.documentElement.style.overflow = previousHtmlOverflow;
      }
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="action-backdrop"
      role="presentation"
      onClick={onClose}
      onTouchMove={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <section
        ref={sheetRef}
        className={className ? `action-sheet ${className}` : 'action-sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
