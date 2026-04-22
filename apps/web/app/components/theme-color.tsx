// apps/web/app/components/theme-color.tsx
/**
 * React wrapper around `@shippie/sdk/wrapper`'s `setThemeColor`. Idempotent
 * — rendering multiple instances simply updates the single
 * <meta name="theme-color"> tag. Safe in Server Components (renders
 * nothing until client-side hydration runs the effect).
 */
'use client';

import { useEffect } from 'react';
import { setThemeColor } from '@shippie/sdk/wrapper';

export function ThemeColor({ color }: { color: string }) {
  useEffect(() => {
    setThemeColor(color);
  }, [color]);
  return null;
}
