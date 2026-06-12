// Shared form atoms in lot.'s cream language. No UI library — plain inputs
// styled to the design system.

import type { CSSProperties, ReactNode } from 'react';
import { C, F } from '../tokens.ts';

export const inputStyle: CSSProperties = {
  width: '100%',
  background: C.creamDark,
  border: `1px solid ${C.tanLight}`,
  borderRadius: 8,
  color: C.espresso,
  fontFamily: F.sans,
  fontSize: 16, // >= 16px so iOS Safari doesn't zoom on focus
  padding: '10px 12px',
  minHeight: 44,
  outline: 'none',
};

export const monoInputStyle: CSSProperties = { ...inputStyle, fontFamily: F.mono };

export const labelStyle: CSSProperties = {
  fontFamily: F.sans,
  fontSize: 9,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: C.espressoLight,
  marginBottom: 5,
  display: 'block',
};

export function primaryBtnStyle(tone: 'terracotta' | 'sage' = 'terracotta'): CSSProperties {
  const col = tone === 'sage' ? C.sage : C.terracotta;
  const rgb = tone === 'sage' ? '107,140,110' : '196,99,58';
  return {
    width: '100%',
    height: 44,
    borderRadius: 8,
    background: `rgba(${rgb},0.06)`,
    color: col,
    border: `1px solid rgba(${rgb},0.55)`,
    fontFamily: F.serif,
    fontSize: 15,
    fontStyle: 'italic',
    fontWeight: 500,
    letterSpacing: '0.05em',
    cursor: 'pointer',
  };
}

export const ghostBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  fontFamily: F.sans,
  fontSize: 12,
  color: C.espressoLight,
  cursor: 'pointer',
  minHeight: 44, // comfortable thumb target
  padding: '0 12px',
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

export function Chip({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: F.sans,
        fontSize: 12,
        color: active ? C.cream : C.espressoMid,
        background: active ? C.terracotta : C.creamDark,
        border: `1px solid ${active ? C.terracotta : C.tanLight}`,
        borderRadius: 22,
        padding: '11px 16px', // >= 44px tap target
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
