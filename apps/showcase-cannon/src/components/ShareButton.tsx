/**
 * One-tap share affordance. Native share sheet where available, clipboard
 * otherwise, with a brief inline confirmation either way.
 */
import { useEffect, useRef, useState } from 'react';
import { share, type ShareMoment } from '../lib/share';

export const ShareButton = ({
  moment,
  label = 'Share',
  ghost,
  onShared,
}: {
  moment: ShareMoment;
  label?: string;
  ghost?: boolean;
  onShared?: () => void;
}) => {
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const handle = async () => {
    const result = await share(moment);
    if (result !== 'failed') onShared?.();
    setFlash(result === 'copied' ? 'Copied' : result === 'shared' ? 'Shared' : 'Couldn’t share');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1600);
  };

  return (
    <button className={`share-btn${ghost ? ' share-btn--ghost' : ''}`} onClick={handle}>
      {flash ?? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
};
