import { cn } from '@/lib/cn.ts';
import type { Route } from '@/router.ts';

interface Tab {
  key: Route;
  label: string;
  icon: string; // emoji glyph for now; SVG icons later
}

const TABS: readonly Tab[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'schedule', label: 'Schedule', icon: '◫' },
  { key: 'journal', label: 'Journal', icon: '✎' },
  { key: 'surprises', label: 'Surprises', icon: '✦' },
  { key: 'more', label: 'More', icon: '⋯' },
];

interface Props {
  current: Route;
  onChange: (route: Route) => void;
  partnerName: string | null;
  unreadCount?: number;
}

export function TabNav({ current, onChange, unreadCount = 0 }: Props) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <ul className="flex justify-between max-w-md mx-auto px-2">
        {TABS.map((tab) => {
          const active = current === tab.key;
          const showBadge = tab.key === 'surprises' && unreadCount > 0;
          return (
            <li key={tab.key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(tab.key)}
                className={cn(
                  'w-full flex flex-col items-center gap-1 py-2 px-1 transition-colors relative',
                  active
                    ? 'text-[var(--gold)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                )}
                aria-current={active ? 'page' : undefined}
                aria-label={tab.label}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider">
                  {tab.label}
                </span>
                {showBadge && (
                  <span className="absolute top-1.5 right-1/3 w-2 h-2 rounded-full bg-[var(--gold)]" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
