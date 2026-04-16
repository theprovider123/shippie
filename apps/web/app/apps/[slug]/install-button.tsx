'use client';

import { useState } from 'react';

export function InstallButton({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="h-12 px-6 border-2 border-white font-medium hover:bg-white hover:text-neutral-900 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
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
