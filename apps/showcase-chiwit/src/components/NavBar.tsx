import type { Screen } from '../App';

interface NavBarProps {
  current: Screen;
  onChange: (s: Screen) => void;
}

const CORAL = '#A84136';
const INACTIVE = '#8F8A7C';

export function NavBar({ current, onChange }: NavBarProps) {
  const color = (s: Screen) => (current === s ? CORAL : INACTIVE);

  return (
    <nav className="chiwit-nav" aria-label="Main navigation">
      <button
        type="button"
        className="chiwit-nav__item"
        aria-current={current === 'today' ? 'page' : undefined}
        onClick={() => onChange('today')}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="4" stroke={color('today')} strokeWidth="1.5" />
          <line x1="11" y1="2" x2="11" y2="4.5" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="17.5" x2="11" y2="20" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2" y1="11" x2="4.5" y2="11" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="17.5" y1="11" x2="20" y2="11" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4.22" y1="4.22" x2="5.99" y2="5.99" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16.01" y1="16.01" x2="17.78" y2="17.78" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="17.78" y1="4.22" x2="16.01" y2="5.99" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5.99" y1="16.01" x2="4.22" y2="17.78" stroke={color('today')} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="chiwit-nav__label">Today</span>
      </button>

      <button
        type="button"
        className="chiwit-nav__item"
        aria-current={current === 'garden' ? 'page' : undefined}
        onClick={() => onChange('garden')}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M4.5 17.5 C4.5 8.5 11 4.5 18 4.5 C18 12.5 12.5 17.5 4.5 17.5 Z"
            stroke={color('garden')}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 16.5 C9 12.5 12 10 15 7.5"
            stroke={color('garden')}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="chiwit-nav__label">Garden</span>
      </button>

      <button
        type="button"
        className="chiwit-nav__item"
        aria-current={current === 'letter' ? 'page' : undefined}
        onClick={() => onChange('letter')}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="2.5" y="5.5" width="17" height="12" rx="2.5" stroke={color('letter')} strokeWidth="1.5" />
          <polyline
            points="2.5,6 11,13 19.5,6"
            stroke={color('letter')}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="chiwit-nav__label">Letter</span>
      </button>

      <button
        type="button"
        className="chiwit-nav__item"
        aria-current={current === 'data' ? 'page' : undefined}
        onClick={() => onChange('data')}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="8" stroke={color('data')} strokeWidth="1.5" />
          <circle cx="11" cy="11" r="2.25" fill={color('data')} />
        </svg>
        <span className="chiwit-nav__label">Data</span>
      </button>
    </nav>
  );
}
