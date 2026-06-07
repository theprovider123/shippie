// uniti-app.jsx — main App + routing
const { useState: useAppState, useEffect: useAppEffect } = React;
const {
  AppShell, LoginScreen, HomeScreen, LessonScreen, PupilDrawer,
  AIScreen, TimelineScreen, LeadershipScreen, AdminScreen, AdaptationsScreen,
  useTweaks, TweaksPanel, TweakSection, TweakRadio
} = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{ "theme": "Sunrise" }/*EDITMODE-END*/;

function App() {
  const [loggedIn,   setLoggedIn]   = useAppState(false);
  const [screen,     setScreen]     = useAppState("home");
  const [lesson,     setLesson]     = useAppState(window.UnitiData.lessons[0]);
  const [feedback,   setFeedback]   = useAppState({ ...window.UnitiData.defaultFeedback });
  const [drawerOpen, setDrawerOpen] = useAppState(false);
  const [pupil,      setPupil]      = useAppState(null);
  const [syncStatus, setSyncStatus] = useAppState("synced");
  const [generating, setGenerating] = useAppState(false);

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Colour theme — reset light defaults then apply theme overrides
  useAppEffect(() => {
    const LIGHT = { "--surface":"#FFFFFF","--surface-2":"#F2F1EE","--border":"#E8E6E3","--text":"#1A1917","--text-muted":"#6B6864","--text-subtle":"#A39F9B" };
    const themes = {
      Sunrise: { "--primary":"#1B9B7A","--primary-light":"#E4F5F0","--primary-dark":"#137A60","--accent":"#E8953A","--accent-light":"#FEF0DC","--bg":"#F8F7F4" },
      Ocean:   { "--primary":"#00FF94","--primary-light":"rgba(0,255,148,0.15)","--primary-dark":"#00D97C","--accent":"#FF3D9A","--accent-light":"rgba(255,61,154,0.15)","--bg":"#0A0A1A","--surface":"#131228","--surface-2":"#1C1A35","--border":"#252340","--text":"#F0EEFF","--text-muted":"#9990C0","--text-subtle":"#5E5880" },
      Forest:  { "--primary":"#16A34A","--primary-light":"#F0FDF4","--primary-dark":"#15803D","--accent":"#CA8A04","--accent-light":"#FEFCE8","--bg":"#F6FAF6" }
    };
    const vars = { ...LIGHT, ...(themes[t.theme] || themes.Sunrise) };
    Object.entries(vars).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
  }, [t.theme]);

  const handlePupilClick = (p) => { setPupil(p); setDrawerOpen(true); };

  const handleFeedbackSave = (pupilId, status, note) => {
    setFeedback(prev => ({ ...prev, [pupilId]: status }));
    setDrawerOpen(false);
    setPupil(null);
    setSyncStatus("syncing");
    setTimeout(() => setSyncStatus("synced"), 1400);
  };

  // When a lesson is saved with a file upload → go to Adaptations + trigger generating
  const handleLessonSave = (data) => {
    if (data?.hasFile) {
      setScreen("timeline");
      setGenerating(true);
    }
  };

  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)}/>;

  const screens = {
    home:        <HomeScreen setScreen={setScreen} setLesson={setLesson} onLessonSave={handleLessonSave}/>,
    lesson:      <LessonScreen lesson={lesson} feedback={feedback} setScreen={setScreen} onPupilClick={handlePupilClick}/>,
    ai:          <AIScreen feedback={feedback} lesson={lesson} setScreen={setScreen}/>,
    adaptations: <AdaptationsScreen generating={generating} setGenerating={setGenerating}/>,
    timeline:    <TimelineScreen/>,
    leadership:  <LeadershipScreen/>,
    admin:       <AdminScreen/>
  };

  return (
    <>
      <AppShell screen={screen} setScreen={setScreen} lesson={lesson} syncStatus={syncStatus} lastSync="3 mins ago">
        {screens[screen] || screens.home}
        {drawerOpen && pupil && (
          <PupilDrawer
            pupil={pupil} lesson={lesson} status={feedback[pupil.id]}
            onClose={() => { setDrawerOpen(false); setPupil(null); }}
            onSave={handleFeedbackSave}/>
        )}
      </AppShell>
      <TweaksPanel title="Design Options">
        <TweakSection label="Colour theme"/>
        <TweakRadio label="Theme" value={t.theme} options={["Sunrise","Ocean","Forest"]} onChange={v => setTweak("theme",v)}/>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
