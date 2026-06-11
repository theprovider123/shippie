/**
 * App shell. Four tabs — Now, Matches, Terrace, Squad — over the matchday
 * state machine. Deep links: ?m=<matchId> opens a match, ?p=<playerId> a
 * player, ?tab=<id> a tab. Desktop is a deliberate two-pane programme
 * spread (content + Terrace rail), not a stretched phone.
 */
import { useEffect, useMemo, useState } from 'react';
import { Masthead, TabBar, type TabId } from './components/chrome';
import { FEEDS, useFeed } from './lib/feeds';
import { MatchesScreen } from './screens/MatchesScreen';
import { NowScreen } from './screens/NowScreen';
import { SquadScreen } from './screens/SquadScreen';
import { TerraceScreen } from './screens/TerraceScreen';

const TABS: TabId[] = ['now', 'matches', 'terrace', 'squad'];
const TAB_KEY = 'cannon_tab';

function initialState(): { tab: TabId; matchId: string | null; playerId: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('m');
    const p = params.get('p');
    if (m) return { tab: 'matches', matchId: m, playerId: null };
    if (p) return { tab: 'squad', matchId: null, playerId: p };
    const t = params.get('tab') as TabId | null;
    if (t && TABS.includes(t)) return { tab: t, matchId: null, playerId: null };
    const saved = localStorage.getItem(TAB_KEY) as TabId | null;
    return { tab: saved && TABS.includes(saved) ? saved : 'now', matchId: null, playerId: null };
  } catch {
    return { tab: 'now', matchId: null, playerId: null };
  }
}

export const App = () => {
  const initial = useMemo(initialState, []);
  const [activeTab, setActiveTab] = useState<TabId>(initial.tab);
  const [openMatchId, setOpenMatchId] = useState<string | null>(initial.matchId);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(initial.playerId);
  const [terraceThread, setTerraceThread] = useState<string | null>(null);

  const match = useFeed(FEEDS.match);
  const liveNow = match.data.phase === 'live' || match.data.phase === 'ht';

  const navigate = (tab: TabId) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* private mode */
    }
  };

  // Keep ?m=/?p= shareable as the user browses (replaceState, no history spam).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('m');
      url.searchParams.delete('p');
      url.searchParams.delete('tab');
      if (activeTab === 'matches' && openMatchId) url.searchParams.set('m', openMatchId);
      else if (activeTab === 'squad' && openPlayerId) url.searchParams.set('p', openPlayerId);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* sandboxed iframe without history access */
    }
  }, [activeTab, openMatchId, openPlayerId]);

  const openMatch = (matchId: string) => {
    setOpenMatchId(matchId);
    navigate('matches');
  };

  const openThread = (matchId: string) => {
    setTerraceThread(matchId);
    navigate('terrace');
  };

  const mainScreen = (() => {
    switch (activeTab) {
      case 'matches':
        return (
          <MatchesScreen
            openMatchId={openMatchId}
            onOpenMatch={setOpenMatchId}
            onCloseMatch={() => setOpenMatchId(null)}
            onOpenThread={openThread}
          />
        );
      case 'squad':
        return (
          <SquadScreen
            openPlayerId={openPlayerId}
            onOpenPlayer={setOpenPlayerId}
            onClosePlayer={() => setOpenPlayerId(null)}
          />
        );
      case 'terrace':
        return <TerraceScreen threadMatchId={terraceThread} />;
      default:
        return <NowScreen onOpenMatch={openMatch} onOpenTerrace={() => navigate('terrace')} />;
    }
  })();

  return (
    <div className={`app-frame${liveNow ? ' app-frame--live' : ''}`}>
      <Masthead live={liveNow} />
      <div className="app-body">
        <main className="app-main" key={activeTab}>
          {mainScreen}
        </main>
        {/* Desktop rail: the Terrace is always on. Hidden on mobile via CSS;
            suppressed when the Terrace is already the main screen. */}
        {activeTab !== 'terrace' && (
          <aside className="terrace-rail" aria-label="Terrace">
            <TerraceScreen threadMatchId={terraceThread} />
          </aside>
        )}
      </div>
      <TabBar active={activeTab} onNav={navigate} />
    </div>
  );
};
