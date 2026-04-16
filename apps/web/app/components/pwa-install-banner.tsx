'use client';

import { useEffect, useState, useRef } from 'react';
import { useIsStandalone } from './standalone-provider';
import { track } from '@/lib/track';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallMethod = 'one-tap' | 'ios-safari' | 'ios-chrome' | 'manual';

function detectMethod(): InstallMethod {
  if (typeof navigator === 'undefined') return 'manual';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (isIOS) {
    return /CriOS/.test(ua) ? 'ios-chrome' : 'ios-safari';
  }
  // Android + desktop Chrome/Edge will get beforeinstallprompt → 'one-tap'
  // but we start as 'manual' and upgrade when the event fires
  return 'manual';
}

export function PwaInstallBanner() {
  const isStandalone = useIsStandalone();
  const [show, setShow] = useState(false);
  const [method, setMethod] = useState<InstallMethod>('manual');
  const [showGuide, setShowGuide] = useState(false);
  const promptRef = useRef<DeferredPrompt | null>(null);

  useEffect(() => {
    if (isStandalone) return;

    const dismissed = localStorage.getItem('shippie-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86_400_000) return;

    const detected = detectMethod();
    setMethod(detected);

    // Android/desktop: capture beforeinstallprompt → upgrade to one-tap
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as DeferredPrompt;
      setMethod('one-tap');
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Show immediately on mobile, short delay on desktop
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      setShow(true);
      track('banner_shown', { method: detected });
    } else {
      const t = setTimeout(() => { setShow(true); track('banner_shown', { method: detected }); }, 15_000);
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler); };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  function dismiss() {
    setShow(false);
    localStorage.setItem('shippie-install-dismissed', String(Date.now()));
    track('install_prompt_dismissed', { method });
  }

  async function onInstallTap() {
    track('install_clicked', { method });

    if (method === 'one-tap' && promptRef.current) {
      await promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      track(outcome === 'accepted' ? 'install_prompt_accepted' : 'install_prompt_dismissed', { method });
      if (outcome === 'accepted') dismiss();
      return;
    }

    // iOS Safari or iOS Chrome — show the guide
    setShowGuide(true);
  }

  if (!show) return null;

  return (
    <>
      {/* ── Banner ─────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: 'calc(var(--nav-height) + var(--safe-top))',
        left: 0, right: 0, zIndex: 99,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px clamp(1rem, 3vw, 2rem)',
        background: 'var(--surface-elevated)',
        borderBottom: '1px solid var(--border-light)',
      }}>
        <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>
          Get the app
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onInstallTap} style={{
            background: 'var(--sunset)', color: '#14120F', border: 'none',
            padding: '6px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
          }}>
            Install
          </button>
          <button onClick={dismiss} style={{
            background: 'none', border: 'none', color: 'var(--text-light)',
            fontSize: 18, cursor: 'pointer', padding: '4px 4px', lineHeight: 1,
          }}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Install guide (iOS) ────────────────────────────────── */}
      {showGuide && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 400, margin: 16,
              padding: '28px 24px', background: 'var(--surface-elevated)',
              border: '1px solid var(--border)', borderRadius: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 20, fontWeight: 600, margin: '0 0 20px', textAlign: 'center' }}>
              Install Shippie
            </p>

            {method === 'ios-safari' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Step n="1" text="Tap the Share button at the bottom of Safari">
                  <ShareIcon />
                </Step>
                <Step n="2" text='Scroll down and tap "Add to Home Screen"'>
                  <PlusSquareIcon />
                </Step>
                <Step n="3" text='Tap "Add" in the top right' />
              </div>
            )}

            {method === 'ios-chrome' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Step n="1" text="Tap the menu button (⋯) at the bottom right">
                  <MenuDotsIcon />
                </Step>
                <Step n="2" text='Tap "Add to Home Screen"'>
                  <PlusSquareIcon />
                </Step>
                <Step n="3" text='Tap "Add" to confirm' />
              </div>
            )}

            {method === 'manual' && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                Open your browser menu and look for &ldquo;Add to Home Screen&rdquo; or &ldquo;Install app&rdquo;.
              </p>
            )}

            <button onClick={() => setShowGuide(false)} style={{
              marginTop: 24, width: '100%', height: 48, fontSize: 15, fontWeight: 600,
              background: 'var(--sunset)', color: '#14120F', border: 'none',
              borderRadius: 8, cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Subcomponents ──────────────────────────────────────────── */

function Step({ n, text, children }: { n: string; text: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, color: 'var(--sunset)',
      }}>
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{text}</p>
      </div>
      {children && (
        <div style={{ flexShrink: 0, width: 28, height: 28, color: 'var(--text-secondary)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function MenuDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
