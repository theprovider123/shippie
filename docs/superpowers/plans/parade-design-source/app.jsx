// app.jsx — Lays out all 5 screens on the DesignCanvas
// Each mobile screen sits in a 380×800 artboard. The share card sits at
// 1080×1920 (Instagram Story). The Celebrate screen has two variants
// (resting + tapped) so the user can compare states side-by-side.

const PHONE_W = 380;
const PHONE_H = 800;

function ScreenLabel({ children, subtitle }) {
  return (
    <div style={{
      position: 'absolute', top: 8, left: 10,
      fontFamily: 'var(--mono)', fontSize: 9.5,
      color: 'var(--ink-mute)', letterSpacing: '0.14em',
      textTransform: 'uppercase', zIndex: 50,
      pointerEvents: 'none',
    }}>
      <span style={{ color: 'var(--gold)' }}>● </span>
      {children}
      {subtitle && (
        <div style={{
          marginTop: 2, fontSize: 9, color: 'var(--ink-faint)',
          letterSpacing: '0.06em', textTransform: 'none',
        }}>{subtitle}</div>
      )}
    </div>
  );
}

function App() {
  return (
    <>
      <div className="canvas-readme">
        <strong>Arsenal Victory Parade · Shippie</strong><br/>
        offline parade companion · 5 screens · cream paper, red rules, gold trophy moments<br/>
        <span style={{ opacity: 0.7 }}>pan with two fingers · pinch to zoom · click any label to focus</span>
      </div>
      <DesignCanvas>
        <DCSection id="parade" title="Arsenal Victory Parade · 2025"
                   subtitle="Offline-first companion. One primary action per screen. Built on Shippie.">
          <DCArtboard id="map" label="01 · Home / Map (hero)" width={PHONE_W} height={PHONE_H}>
            <MapScreen />
          </DCArtboard>

          <DCArtboard id="group" label="02 · Group plan (swipe left)" width={PHONE_W} height={PHONE_H}>
            <GroupScreen />
          </DCArtboard>

          <DCArtboard id="celebrate" label="03 · Celebrate · resting" width={PHONE_W} height={PHONE_H}>
            <CelebrateScreen tapped={false} count={847} />
          </DCArtboard>

          <DCArtboard id="celebrate-tap" label="03b · Celebrate · tapped" width={PHONE_W} height={PHONE_H}>
            <CelebrateScreen tapped={true} count={848} />
          </DCArtboard>

          <DCArtboard id="info" label="04 · Info" width={PHONE_W} height={PHONE_H}>
            <InfoScreen />
          </DCArtboard>
        </DCSection>

        <DCSection id="share" title="Shareable card · 1080 × 1920"
                   subtitle="Instagram Story format. Generated after the parade.">
          <DCArtboard id="card" label="05 · Share card" width={1080} height={1920}>
            <ShareCard />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
