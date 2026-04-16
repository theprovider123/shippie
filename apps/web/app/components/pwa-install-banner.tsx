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

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as DeferredPrompt;
      setMethod('one-tap');
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Show immediately
    setShow(true);
    track('banner_shown', { method: detected });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  function dismiss() {
    setShow(false);
    setShowGuide(false);
    localStorage.setItem('shippie-install-dismissed', String(Date.now()));
    track('install_prompt_dismissed', { method });
  }

  async function onInstallTap() {
    track('install_clicked', { method });

    // One-tap path (Android + Desktop Chrome/Edge)
    if (method === 'one-tap' && promptRef.current) {
      await promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      track(outcome === 'accepted' ? 'install_prompt_accepted' : 'install_prompt_dismissed', { method });
      if (outcome === 'accepted') dismiss();
      return;
    }

    // iOS or manual — show the guide
    setShowGuide(true);
  }

  if (!show) return null;

  // Determine if we have a guide to show
  const hasGuide = method === 'ios-safari' || method === 'ios-chrome';

  return (
    <>
      {/* ── Top banner — ABOVE the nav ─────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px 16px',
        background: 'var(--sunset)',
        color: '#14120F',
        gap: 12,
      }}>
        <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>
          Install Shippie on your phone
        </p>
        <button onClick={onInstallTap} style={{
          background: '#14120F', color: 'var(--sunset)', border: 'none',
          padding: '4px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
        }}>
          Install
        </button>
        <button onClick={dismiss} style={{
          background: 'none', border: 'none', color: '#14120F',
          fontSize: 16, cursor: 'pointer', padding: '2px 6px', lineHeight: 1, opacity: 0.6,
        }}>
          ✕
        </button>
      </div>

      {/* ── Install guide sheet ────────────────────────────────── */}
      {showGuide && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 400, margin: '0 12px 12px',
              padding: '28px 24px 24px', background: 'var(--surface-elevated)',
              border: '1px solid var(--border)', borderRadius: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 20, fontWeight: 600, margin: '0 0 24px', textAlign: 'center' }}>
              Install Shippie
            </p>

            {method === 'ios-safari' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Step n="1" icon={<ShareIcon />}>
                  Tap the <strong>Share</strong> button at the bottom of your screen
                </Step>
                <Step n="2" icon={<PlusSquareIcon />}>
                  Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>
                </Step>
                <Step n="3">
                  Tap <strong>&ldquo;Add&rdquo;</strong> — that&apos;s it!
                </Step>
              </div>
            )}

            {method === 'ios-chrome' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Step n="1" icon={<MenuDotsIcon />}>
                  Tap the <strong>⋯ menu</strong> at the bottom right of Chrome
                </Step>
                <Step n="2" icon={<PlusSquareIcon />}>
                  Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>
                </Step>
                <Step n="3">
                  Tap <strong>&ldquo;Add&rdquo;</strong> — that&apos;s it!
                </Step>
              </div>
            )}

            {!hasGuide && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 8px', lineHeight: 1.6 }}>
                Open your browser menu and look for<br /><strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home Screen&rdquo;</strong>
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
              <button onClick={() => setShowGuide(false)} style={{
                flex: 1, height: 48, fontSize: 15, fontWeight: 600,
                background: 'var(--border)', color: 'var(--text)', border: 'none',
                borderRadius: 8, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={() => { setShowGuide(false); dismiss(); }} style={{
                flex: 1, height: 48, fontSize: 15, fontWeight: 600,
                background: 'var(--sunset)', color: '#14120F', border: 'none',
                borderRadius: 8, cursor: 'pointer',
              }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, icon, children }: { n: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, color: 'var(--sunset)',
      }}>
        {n}
      </div>
      <div style={{ flex: 1, paddingTop: 6 }}>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{children}</p>
      </div>
      {icon && (
        <div style={{ flexShrink: 0, width: 32, height: 32, color: 'var(--text-secondary)', paddingTop: 2 }}>
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
