import Link from 'next/link';
import { MobileMenu } from './mobile-menu';
import { ThemeToggle } from '../theme-toggle';

export function SiteNav() {
  return (
    <nav className="navbar">
      <div className="nav-bar-inner">
        <div className="nav-group-left">
          <Link href="/" className="nav-logo">
            <span className="nav-wordmark">shippie</span>
          </Link>
        </div>
        <div className="nav-group-center">
          <Link href="/apps" className="nav-link nav-desktop">Explore</Link>
          <Link href="/leaderboards" className="nav-link nav-desktop">Leaderboards</Link>
          <Link href="/why" className="nav-link nav-desktop">Why</Link>
          <Link href="/docs" className="nav-link nav-desktop">Docs</Link>
          <a href="https://github.com/shippie/shippie" className="nav-link nav-wide">Open Source</a>
        </div>
        <div className="nav-group-right">
          <Link href="/auth/signin" className="nav-signin nav-tablet">Sign in</Link>
          <Link href="/new" className="btn-primary nav-cta nav-cta-desktop">Deploy an app</Link>
          <div className="theme-toggle-desktop">
            <ThemeToggle />
          </div>
          <MobileMenu />
        </div>
      </div>
    </nav>
  );
}
