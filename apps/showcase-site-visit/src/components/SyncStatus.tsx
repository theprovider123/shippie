/**
 * Tiny badge that makes the offline-first claim visible. Watches the
 * `online`/`offline` events; shows "Saved offline" when there's no
 * signal, "Saved on this phone" when there is. We never sync — the
 * point is that the inspector always sees their data was kept.
 */

import { useEffect, useState } from 'react';

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function SyncStatus() {
  const [online, setOnline] = useState<boolean>(() => isOnline());

  useEffect(() => {
    function update() {
      setOnline(isOnline());
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <span
      className={`sync-status ${online ? 'sync-status--online' : 'sync-status--offline'}`}
      role="status"
      aria-live="polite"
    >
      <span className="sync-status__dot" aria-hidden />
      {online ? 'saved on this phone' : 'saved offline'}
    </span>
  );
}
