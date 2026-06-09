import { readable } from 'svelte/store';

/** True when the browser reports network connectivity. Seeds from navigator.onLine. */
export const isOnline = readable(true, (set) => {
  if (typeof window === 'undefined') return;
  set(navigator.onLine);
  const on = () => set(true);
  const off = () => set(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
});
