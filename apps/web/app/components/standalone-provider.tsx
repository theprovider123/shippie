'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const StandaloneContext = createContext(false);

export function useIsStandalone(): boolean {
  return useContext(StandaloneContext);
}

export function StandaloneProvider({ children }: { children: ReactNode }) {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    // iOS Safari
    const iosStandalone = 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true;
    // Android + desktop PWA
    const mq = window.matchMedia('(display-mode: standalone)');
    setStandalone(iosStandalone || mq.matches);
    const handler = (e: MediaQueryListEvent) => setStandalone(e.matches || iosStandalone);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return <StandaloneContext.Provider value={standalone}>{children}</StandaloneContext.Provider>;
}
