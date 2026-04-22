'use client';

import { useEffect, useState, useRef } from 'react';
import { useIsStandalone } from './standalone-provider';
import { track } from '@/lib/track';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallMethod = 'one-tap' | 'ios-safari' | 'ios-chrome' | 'ios-other' | 'manual';

function detectMethod(): InstallMethod {
  if (typeof navigator === 'undefined') return 'manual';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (isIOS) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/Safari/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua)) return 'ios-safari';
    return 'ios-other'; // Firefox, Opera, etc on iOS
  }
  return 'manual'; // will upgrade to 'one-tap' if beforeinstallprompt fires
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

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as DeferredPrompt;
      setMethod('one-tap');
    };
    window.addEventListener('beforeinstallprompt', handler);

    setShow(true);
    track('banner_shown', { method: detected });

    // Push the nav down by setting a CSS variable on <html>
    document.documentElement.style.setProperty('--install-banner-offset', '40px');

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [isStandalone]);

  function dismiss() {
    setShow(false);
    setShowGuide(false);
    localStorage.setItem('shippie-install-dismissed', String(Date.now()));
    document.documentElement.style.setProperty('--install-banner-offset', '0px');
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

    // All other methods: show the guide
    setShowGuide(true);
  }

  if (!show) return null;

  return (
    <>
      {/* ── Banner: fixed at very top, z above nav ──────────────── */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 150,
        height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--sunset)',
        color: '#14120F',
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
      }}>
        <span>Install Shippie</span>
        <button onClick={onInstallTap} style={{
          background: '#14120F', color: '#EDE4D3', border: 'none',
          padding: '3px 12px', fontSize: 11, fontWeight: 700,
          borderRadius: 3, cursor: 'pointer', letterSpacing: '0.02em',
        }}>
          INSTALL
        </button>
        <button onClick={dismiss} style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: '#14120F',
          fontSize: 15, cursor: 'pointer', lineHeight: 1, opacity: 0.5, padding: 4,
        }}>
          ✕
        </button>
      </div>

      {/* ── Guide sheet ────────────────────────────────────────── */}
      {showGuide && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'calc(20px + var(--safe-bottom, 0px))',
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 360,
              padding: '32px 28px 28px',
              background: '#2A2520',
              border: '1px solid #3D3530',
              borderRadius: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', textAlign: 'center', color: 'var(--text)' }}>
              Install Shippie
            </p>
            <p style={{ fontSize: 13, margin: '0 0 28px', textAlign: 'center', color: 'var(--text-light)' }}>
              Add to your home screen in 3 taps
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {method === 'ios-safari' && (
                <>
                  <Step n="1" icon={<ShareIcon />} text='Tap the Share button at the bottom' />
                  <Step n="2" icon={<PlusIcon />} text='Tap "Add to Home Screen"' />
                  <Step n="3" text="Tap Add — you're done!" />
                </>
              )}

              {(method === 'ios-chrome' || method === 'ios-other') && (
                <>
                  <Step n="1" icon={<DotsIcon />} text='Tap ⋯ menu at the bottom right' />
                  <Step n="2" icon={<PlusIcon />} text='Tap "Add to Home Screen"' />
                  <Step n="3" text="Tap Add — you're done!" />
                </>
              )}

              {(method === 'manual') && (
                <>
                  <Step n="1" icon={<DotsIcon />} text="Open your browser menu" />
                  <Step n="2" icon={<PlusIcon />} text='Look for "Install app" or "Add to Home Screen"' />
                  <Step n="3" text="Confirm the install" />
                </>
              )}
            </div>

            <button onClick={() => setShowGuide(false)} style={{
              marginTop: 32, width: '100%', height: 50, fontSize: 16, fontWeight: 600,
              background: 'var(--sunset)', color: '#14120F', border: 'none',
              borderRadius: 10, cursor: 'pointer',
            }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, icon, text }: { n: string; icon?: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(232, 96, 60, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: 'var(--sunset)',
      }}>
        {n}
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, flex: 1, color: 'var(--text)' }}>{text}</p>
      {icon && (
        <div style={{ flexShrink: 0, width: 28, height: 28, color: 'var(--text-light)' }}>
          {icon}
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
