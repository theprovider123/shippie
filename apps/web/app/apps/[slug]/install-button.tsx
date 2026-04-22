'use client';

import { useState } from 'react';

/**
 * Install CTA on the app detail page. When clicked it fires an
 * `install_click` beacon to `/api/shippie/install-click` with the current
 * `?ref=…` source so the platform can attribute installs to the
 * marketplace surface (home / category / search / leaderboard) before
 * the user leaves for the maker app.
 *
 * The beacon uses `navigator.sendBeacon` so it survives the tab-switch
 * into the install flow. If sendBeacon is missing or rejects, we fall
 * back to a keepalive fetch — best-effort, never blocks the UI.
 */
export function InstallButton({
  url,
  name,
  slug,
}: {
  url: string;
  name: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  const emitInstallClick = (): void => {
    if (typeof window === 'undefined') return;
    let source: string | null = null;
    try {
      source = new URLSearchParams(window.location.search).get('ref');
    } catch {
      source = null;
    }
    const body = JSON.stringify({ slug, source });
    try {
      const sent = navigator.sendBeacon?.('/api/shippie/install-click', body);
      if (sent) return;
    } catch {
      // fall through to fetch
    }
    void fetch('/api/shippie/install-click', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // best-effort — never break the install UX
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="h-12 px-6 border-2 border-white font-medium hover:bg-white hover:text-neutral-900 transition-colors cursor-pointer"
        onClick={() => {
          // Fire the attribution beacon BEFORE toggling the install guide —
          // if the user bounces away it still lands via sendBeacon's
          // queue-on-unload semantics.
          emitInstallClick();
          setOpen((v) => !v);
        }}
      >
        Install {name}
      </button>
      {open && (
        <div className="bg-white/10 backdrop-blur p-4 text-sm space-y-2 max-w-xs">
          {isIOS ? (
            <>
              <p className="font-bold">iOS install:</p>
              <ol className="list-decimal ml-4 space-y-1 text-xs opacity-90">
                <li>
                  Open{' '}
                  <a href={url} target="_blank" rel="noopener" className="underline">
                    {url}
                  </a>{' '}
                  in Safari
                </li>
                <li>Tap the Share button (box with arrow)</li>
                <li>Scroll down, tap &ldquo;Add to Home Screen&rdquo;</li>
                <li>Tap &ldquo;Add&rdquo;</li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-bold">Install as app:</p>
              <ol className="list-decimal ml-4 space-y-1 text-xs opacity-90">
                <li>
                  Open{' '}
                  <a href={url} target="_blank" rel="noopener" className="underline">
                    {url}
                  </a>
                </li>
                <li>Click the install icon in the address bar</li>
                <li>Or: browser menu &rarr; &ldquo;Install app&rdquo;</li>
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
