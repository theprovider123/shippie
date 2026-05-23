import { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast';

/**
 * Single-slot toast host. Mount once at the App root. Toasts dismiss on
 * timeout or tap. Use `showToast()` from `lib/toast.ts` anywhere.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          className={`toast toast--${toast.variant}`}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
