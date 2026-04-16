'use client';

import { useEffect, useState, useRef } from 'react';
import { useIsStandalone } from './standalone-provider';
import { track } from '@/lib/track';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Platform = 'android' | 'ios-safari' | 'ios-chrome' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (isIOS) {
    return /CriOS/.test(ua) ? 'ios-chrome' : 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function PwaInstallBanner() {
  const isStandalone = useIsStandalone();
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const promptRef = useRef<DeferredPrompt | null>(null);

  useEffect(() => {
    if (isStandalone) return; // already installed

    const dismissed = localStorage.getItem('shippie-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86_400_000) return;

    const plat = detectPlatform();
    setPlatform(plat);

    // Android: capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as DeferredPrompt;
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Show immediately on mobile, after 30s on desktop
    if (plat === 'android' || plat === 'ios-safari' || plat === 'ios-chrome') {
      setShow(true);
      track('banner_shown', { platform: plat });
    } else if (plat === 'desktop') {
      const timer = setTimeout(() => {
        setShow(true);
        track('banner_shown', { platform: plat });
      }, 30_000);
      return () => { clearTimeout(timer); window.removeEventListener('beforeinstallprompt', handler); };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  function dismiss() {
    setShow(false);
    localStorage.setItem('shippie-install-dismissed', String(Date.now()));
    track('install_prompt_dismissed', { platform });
  }

  async function install() {
    track('install_clicked', { platform });

    if (platform === 'android' && promptRef.current) {
      await promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      track(outcome === 'accepted' ? 'install_prompt_accepted' : 'install_prompt_dismissed', { platform });
      if (outcome === 'accepted') dismiss();
      return;
    }

    if (platform === 'ios-safari') {
      setShowIOSGuide(true);
      track('ios_safari_help_opened');
      return;
    }

    if (platform === 'ios-chrome') {
      track('ios_chrome_redirect_shown');
      // Can't install from Chrome iOS — show guidance
      setShowIOSGuide(true);
      return;
    }
  }

  if (!show) return null;

  return (
    <>
      {/* Compact top banner under nav */}
      <div className="install-banner" style={{
        position: 'fixed',
        top: 'calc(var(--nav-height) + var(--safe-top))',
        left: 0, right: 0, zIndex: 99,
        height: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(1rem, 3vw, 2rem)',
        background: 'var(--surface-elevated)',
        borderBottom: '1px solid var(--border-light)',
        gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
          <span style={{ color: 'var(--marigold)', fontSize: 16 }}>★</span>
          <p style={{ fontSize: 'var(--small-size)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {platform === 'ios-chrome'
              ? 'Open in Safari to install Shippie'
              : 'Install Shippie to your home screen'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <button onClick={install} className="btn-primary" style={{ padding: '0.375rem 0.875rem', fontSize: 'var(--caption-size)', height: 32, minWidth: 0 }}>
            {platform === 'ios-chrome' ? 'How?' : 'Install'}
          </button>
          <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 16, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* iOS guide modal */}
      {showIOSGuide && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowIOSGuide(false)}>
          <div style={{ width: '100%', maxWidth: 400, padding: 24, background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              {platform === 'ios-chrome' ? 'Install from Safari' : 'Install Shippie'}
            </h3>
            {platform === 'ios-chrome' ? (
              <div style={{ fontSize: 'var(--small-size)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: 12 }}>Chrome on iOS can&apos;t install web apps. Open this page in Safari:</p>
                <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 2 }}>
                  <li>Copy this URL: <strong style={{ color: 'var(--text)' }}>shippie.app</strong></li>
                  <li>Open <strong style={{ color: 'var(--text)' }}>Safari</strong></li>
                  <li>Paste the URL and visit it</li>
                  <li>Tap <strong style={{ color: 'var(--text)' }}>Share</strong> → <strong style={{ color: 'var(--text)' }}>Add to Home Screen</strong></li>
                </ol>
              </div>
            ) : (
              <ol style={{ fontSize: 'var(--small-size)', color: 'var(--text-secondary)', paddingLeft: 20, margin: 0, lineHeight: 2.2 }}>
                <li>Tap the <strong style={{ color: 'var(--text)' }}>Share</strong> button (box with arrow)</li>
                <li>Scroll and tap <strong style={{ color: 'var(--text)' }}>&ldquo;Add to Home Screen&rdquo;</strong></li>
                <li>Tap <strong style={{ color: 'var(--text)' }}>&ldquo;Add&rdquo;</strong></li>
              </ol>
            )}
            <button onClick={() => setShowIOSGuide(false)} style={{
              marginTop: 20, width: '100%', height: 44, fontSize: 'var(--small-size)', fontWeight: 500,
              background: 'var(--border)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--text)',
            }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
