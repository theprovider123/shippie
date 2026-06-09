// SVG icons ported verbatim from lot-components.jsx + lot-world.jsx.

import type { ReactElement } from 'react';
import { C } from '../tokens.ts';

export function BrewIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M8 3 L6 14.5 Q6.5 17 11 17 Q15.5 17 16 14.5 L14 3 Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.5 17 L9.5 19 Q9.5 20.5 11 20.5 Q12.5 20.5 12.5 19 L12.5 17" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="7.5" x2="14" y2="7.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

export function CellarIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="8" height="10" rx="2" stroke={color} strokeWidth="1.4" />
      <rect x="12" y="2" width="8" height="10" rx="2" stroke={color} strokeWidth="1.4" />
      <rect x="2" y="14" width="8" height="6" rx="2" stroke={color} strokeWidth="1.4" />
      <rect x="12" y="14" width="8" height="6" rx="2" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

export function WorldIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8.5" stroke={color} strokeWidth="1.4" />
      <path d="M11 2.5 C8.5 5.5 8.5 16.5 11 19.5 C13.5 16.5 13.5 5.5 11 2.5 Z" stroke={color} strokeWidth="1.4" fill="none" />
      <path d="M2.5 11 Q6.5 8.5 11 11 Q15.5 13.5 19.5 11" stroke={color} strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export function SearchIcon({ color = C.espressoLight }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.4" />
      <path d="M10 10L13 13" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeft({ color = C.terracotta }: { color?: string }) {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
      <path d="M7 1L1 7l6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type NodeTypeLabel = 'Origins' | 'Varieties' | 'Processes' | 'Roasters';

export const NODE_ICONS: Record<NodeTypeLabel, ReactElement> = {
  Origins: (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="11" stroke={C.tan} strokeWidth="1.4" />
      <path d="M14 3 C11 7.5 11 20.5 14 25 C17 20.5 17 7.5 14 3Z" stroke={C.tan} strokeWidth="1.2" fill="none" />
      <path d="M3 14 Q8.5 11 14 14 Q19.5 17 25 14" stroke={C.tan} strokeWidth="1.2" fill="none" />
    </svg>
  ),
  Varieties: (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 4 C14 4 6 9 6 16 C6 21 9.6 24 14 24 C18.4 24 22 21 22 16 C22 9 14 4 14 4Z" stroke={C.tan} strokeWidth="1.3" fill="none" />
      <path d="M14 24 L14 14" stroke={C.tan} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M14 18 C12 16 8.5 15.5 7 14" stroke={C.tan} strokeWidth="1" strokeLinecap="round" />
      <path d="M14 15 C16 13 19.5 12.5 21 11" stroke={C.tan} strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  Processes: (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M4 16 Q7 12 10 16 Q13 20 16 16 Q19 12 22 16 Q23.5 18 24.5 16" stroke={C.tan} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M4 11 Q7 7 10 11 Q13 15 16 11 Q19 7 22 11 Q23.5 13 24.5 11" stroke={C.tan} strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  ),
  Roasters: (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 5 C14 5 11 9 11 13 C11 15.8 12.3 18 14 18 C15.7 18 17 15.8 17 13 C17 9 14 5 14 5Z" stroke={C.tan} strokeWidth="1.3" fill="none" />
      <path d="M9 20 Q14 23 19 20" stroke={C.tan} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="14" cy="13" r="2" fill={C.tan} opacity="0.5" />
    </svg>
  ),
};
