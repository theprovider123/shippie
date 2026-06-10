// App root — ties all screens together (ported from cannon-app.jsx).
import { useMemo, useState } from 'react';
import { BottomNav, StatusBar, type TabId } from './components/chrome';
import { HomeScreen } from './screens/HomeScreen';
import { TerraceScreen } from './screens/TerraceScreen';
import { GaugeScreen } from './screens/GaugeScreen';
import { FixturesScreen } from './screens/FixturesScreen';
import { ClubScreen } from './screens/ClubScreen';

const TABS: TabId[] = ['home', 'terrace', 'gauge', 'fixtures', 'archive'];

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem('cannon_tab') as TabId | null;
      return saved && TABS.includes(saved) ? saved : 'home';
    } catch {
      return 'home';
    }
  });

  const navigate = (tab: TabId) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('cannon_tab', tab);
    } catch {
      /* private mode */
    }
  };

  const screen = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen />;
      case 'terrace':
        return <TerraceScreen />;
      case 'gauge':
        return <GaugeScreen />;
      case 'fixtures':
        return <FixturesScreen />;
      case 'archive':
        return <ClubScreen />;
      default:
        return <HomeScreen />;
    }
  }, [activeTab]);

  return (
    <div className="app-shell">
      <StatusBar />
      <div className="screen-scroll" key={activeTab}>
        {screen}
      </div>
      <BottomNav active={activeTab} onNav={navigate} />
    </div>
  );
};
