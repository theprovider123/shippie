/**
 * One-time disclaimer + persistent footer link.
 *
 * Shown automatically the first time the app boots. Dismissal is
 * persisted in localStorage. The same copy lives behind a footer link
 * so the user can re-read it later.
 */
import { useEffect, useState } from 'react';

export const DISCLAIMER_KEY = 'shippie:steep:disclaimer-seen:v1';

const DISCLAIMER_BODY = (
  <>
    <p>
      Steep is a notebook, not a doctor. Properties shown are traditional
      cultural uses, not medical advice.
    </p>
    <p>
      If you take medication or have a health condition, talk to a herbalist
      or doctor before starting a new blend.
    </p>
    <p>
      Recipes and brews live on this device only. We don’t see them.
    </p>
  </>
);

export function DisclaimerSheet() {
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(DISCLAIMER_KEY) === 'seen') return;
    setOpen(true);
  }, []);

  const close = (markSeen: boolean) => {
    if (markSeen && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DISCLAIMER_KEY, 'seen');
      } catch {
        // best-effort
      }
    }
    setForced(false);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="footer-disclaimer-link"
        onClick={() => {
          setForced(true);
          setOpen(true);
        }}
        aria-label="Read the Steep disclaimer"
      >
        About Steep
      </button>

      {open ? (
        <div
          className="disclaimer-backdrop"
          role="presentation"
          onClick={() => close(forced)}
        >
          <section
            className="disclaimer-sheet"
            role="dialog"
            aria-labelledby="disclaimer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2 id="disclaimer-title">About Steep</h2>
            </header>
            {DISCLAIMER_BODY}
            <button type="button" className="primary" onClick={() => close(true)}>
              {forced ? 'Close' : 'Got it'}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
