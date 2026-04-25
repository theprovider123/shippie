'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '../theme-toggle';

interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

const LINKS: NavLink[] = [
  { href: '/apps', label: 'Explore' },
  { href: '/leaderboards', label: 'Leaderboards' },
  { href: '/why', label: 'Why Shippie' },
  { href: '/docs', label: 'Docs' },
  { href: 'https://github.com/shippie/shippie', label: 'Open Source', external: true },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="mobile-menu-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          className="mobile-menu-sheet"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <nav onClick={(e) => e.stopPropagation()}>
            {LINKS.map((l) =>
              l.external ? (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              ) : (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              ),
            )}

            <div className="mobile-menu-theme">
              <span>Appearance</span>
              <ThemeToggle />
            </div>

            <Link
              href="/auth/signin"
              className="mobile-menu-secondary"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
            <Link href="/new" className="mobile-menu-cta" onClick={() => setOpen(false)}>
              Deploy an app →
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
