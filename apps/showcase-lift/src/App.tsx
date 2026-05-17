import { LiftStateProvider, useLift } from './state/lift-state.tsx';
import { TodayPage } from './pages/Today.tsx';
import { LibraryPage } from './pages/Library.tsx';
import { HistoryPage } from './pages/History.tsx';
import { ProgressionPage } from './pages/Progression.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { PrintView } from './pages/PrintView.tsx';
import { TemplateEditor } from './pages/TemplateEditor.tsx';
import { BottomNav } from './components/BottomNav.tsx';

export function App() {
  return (
    <LiftStateProvider>
      <Shell />
    </LiftStateProvider>
  );
}

function Shell() {
  const lift = useLift();
  if (!lift.ready) {
    return (
      <div className="lift-app lift-app--loading">
        <p className="lift-loading">Lift…</p>
      </div>
    );
  }
  return (
    <div className="lift-app">
      <SettingsCog />
      <main className="lift-main">
        {lift.tab === 'today' ? <TodayPage /> : null}
        {lift.tab === 'library' ? <LibraryPage /> : null}
        {lift.tab === 'progression' ? <ProgressionPage /> : null}
        {lift.tab === 'history' ? <HistoryPage /> : null}
        {lift.tab === 'settings' ? <SettingsPage /> : null}
        {lift.tab === 'print' ? <PrintView /> : null}
        {lift.tab === 'template-edit' ? (
          <TemplateEditor
            forkOf={lift.templateForkOf}
            onClose={() => {
              lift.setTemplateForkOf(null);
              lift.setTab('library');
            }}
          />
        ) : null}
      </main>
      <BottomNav
        active={lift.tab}
        onChange={lift.setTab}
        hasOpenWorkout={Boolean(lift.openWorkout)}
      />
    </div>
  );
}

function SettingsCog() {
  const lift = useLift();
  const NAV_TABS = new Set(['today', 'library', 'progression', 'history']);
  if (!NAV_TABS.has(lift.tab)) return null;
  const open = lift.tab === 'settings';
  return (
    <button
      type="button"
      className="lift-settings-cog"
      aria-label={open ? 'Close settings' : 'Open settings'}
      onClick={() => lift.setTab(open ? 'today' : 'settings')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
