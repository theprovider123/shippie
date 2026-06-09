// Bottom-sheet primitive in lot.'s cream language. Built from scratch (no
// Radix/other UI lib): overlay + slide-up panel + grip + dismiss on backdrop
// or Escape.

import { useEffect, type ReactNode } from 'react';
import { C, F } from '../tokens.ts';

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional right-aligned subtitle in mono (e.g. a count). */
  meta?: string;
}

export function Sheet({ title, onClose, children, meta }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(28,14,6,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="slide-up"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: C.cream,
          borderRadius: '18px 18px 0 0',
          boxShadow: '0 -18px 50px rgba(28,14,6,0.32)',
          padding: `14px 20px calc(24px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.tanLight }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h2 style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: C.espresso, margin: 0 }}>{title}</h2>
          {meta && <span style={{ fontFamily: F.mono, fontSize: 11, color: C.espressoLight, letterSpacing: '0.04em' }}>{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}
