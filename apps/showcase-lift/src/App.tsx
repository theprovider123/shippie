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
        <p className="lift-loading">Lift</p>
        <p className="lift-loading-sub">Loading your workouts…</p>
      </div>
    );
  }
  return (
    <div className="lift-app">
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
