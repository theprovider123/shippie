'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useIsStandalone } from './standalone-provider';

const TABS = [
  { href: '/', label: 'Home', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )},
  { href: '/apps', label: 'Explore', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )},
  { href: '/new', label: 'Deploy', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )},
  { href: '/dashboard', label: 'Profile', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )},
];

export function BottomTabs() {
  const isStandalone = useIsStandalone();
  const pathname = usePathname();

  if (!isStandalone) return null;

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function haptic() {
    if ('vibrate' in navigator) navigator.vibrate(10);
  }

  return (
    <nav className="bottom-tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href as `/${string}`}
          className={`bottom-tab ${isActive(tab.href) ? 'active' : ''}`}
          onClick={haptic}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
