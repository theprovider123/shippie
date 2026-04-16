'use client';

import { useEffect, useState, useRef } from 'react';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const promptRef = useRef<DeferredPrompt | null>(null);

  useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if dismissed within 7 days
    const dismissed = localStorage.getItem('shippie-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86_400_000) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    setIsIOS(ios);

    // Android: capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as DeferredPrompt;
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Show after 50% scroll OR 60 seconds
    let triggered = false;
    const trigger = () => {
      if (triggered) return;
      triggered = true;
      setShow(true);
    };

    const scrollHandler = () => {
      const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (pct > 0.5) trigger();
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    const timer = setTimeout(trigger, 60_000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('scroll', scrollHandler);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem('shippie-install-dismissed', String(Date.now()));
  }

  async function install() {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (promptRef.current) {
      await promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      if (outcome === 'accepted') dismiss();
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between gap-4"
      style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-default)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span style={{ color: 'var(--accent-marigold)', fontSize: 20 }}>★</span>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          <strong>Keep Shippie on your phone.</strong>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>Tap to install — instant and works offline.</span>
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={install} className="btn-action h-9 px-4 text-sm font-medium">
          Install
        </button>
        <button onClick={dismiss} className="h-9 px-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          ✕
        </button>
      </div>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm p-6 space-y-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Install Shippie on iOS</h3>
            <ol className="text-sm space-y-2" style={{ color: 'var(--text-secondary)' }}>
              <li>1. Tap the <strong>Share</strong> button in Safari (box with arrow)</li>
              <li>2. Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong></li>
              <li>3. Tap <strong>&ldquo;Add&rdquo;</strong> in the top right</li>
            </ol>
            <button onClick={() => setShowIOSGuide(false)} className="w-full h-10 text-sm font-medium" style={{ background: 'var(--border-default)' }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
