import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  cutoffCushionSeconds,
  estimateArrivalSeconds,
  formatClockSeconds,
  formatDuration,
  formatPace,
  formatShortDuration,
  haversineKm,
  paceToSpeedMs,
  parseClockTime,
  projectedFinishSeconds,
  speedMsToPace,
} from './calculations.ts';
import {
  TOTAL_KM,
  infoSections,
  paceChart,
  participant,
  race,
  routeStops,
  stations,
  venueChecklist,
  waves,
  weather,
  type Station,
} from './race-data.ts';

const shippie = createShippieIframeSdk({ appId: 'app_race_demo' });

type Tab = 'home' | 'map' | 'aid' | 'race' | 'finish' | 'info';
type IconName =
  | 'home'
  | 'map'
  | 'aid'
  | 'user'
  | 'finish'
  | 'info'
  | 'pin'
  | 'gps'
  | 'water'
  | 'warn'
  | 'medical'
  | 'toilet'
  | 'bag'
  | 'clock'
  | 'target'
  | 'phone'
  | 'plus'
  | 'minus'
  | 'close'
  | 'flag'
  | 'star';

interface Telemetry {
  coveredKm: number;
  elapsedSeconds: number;
  paceSecondsPerKm: number;
  speedMs: number;
  source: 'demo' | 'waiting' | 'gps' | 'unavailable';
  status: string;
  lastFixAt: number | null;
}

interface RaceTelemetry extends Telemetry {
  enableGps(): void;
}

interface MapPoint {
  x: number;
  y: number;
}

interface MapMarker {
  id: string;
  kind: 'km' | 'start' | 'finish' | Station['kind'] | 'medical' | 'toilet';
  t: number;
  label: string;
  km?: number;
  station?: Station;
}

const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Today', icon: 'home' },
  { id: 'map', label: 'Route', icon: 'map' },
  { id: 'aid', label: 'Aid', icon: 'aid' },
  { id: 'race', label: 'My Race', icon: 'user' },
  { id: 'finish', label: 'Finish', icon: 'finish' },
];

const routeD =
  'M 68 610 C 66 544 116 536 142 496 C 170 452 108 416 136 372 C 164 330 254 350 282 302 C 314 248 224 224 236 172 C 244 130 304 136 314 94 C 324 52 284 38 252 46 C 210 58 198 96 148 96 C 98 96 62 72 60 120 C 58 166 122 168 124 210 C 126 258 62 262 64 314 C 66 360 130 360 142 400';
const routeTransform = 'translate(12 128) scale(0.76)';

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [infoOpen, setInfoOpen] = useState(false);
  const now = useNow();
  const telemetry = useTelemetry();
  const [finished, setFinished] = useState(false);

  const projectedSeconds = projectedFinishSeconds(
    telemetry.coveredKm,
    telemetry.elapsedSeconds,
    telemetry.paceSecondsPerKm,
  );
  const projectedDeltaPb = projectedSeconds - participant.personalBestSeconds;
  const status = projectedSeconds <= participant.targetSeconds ? 'On for sub 2:00' : 'Protect the cutoff';
  const startTarget = useMemo(() => new Date(Date.now() + 83 * 60_000), []);

  useEffect(() => {
    if (finished) setTab('finish');
  }, [finished]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [tab]);

  return (
    <main className="race-app">
      <div className="topline">
        <button className="offline-pill" type="button" onClick={() => shippie.feel.texture('confirm')}>
          <span className="live-dot" />
          Offline ready
        </button>
        <button className="icon-button" type="button" onClick={() => setInfoOpen(true)} aria-label="Open race info">
          <Icon name="info" />
        </button>
      </div>

      <section className="screen" aria-live="polite">
        {tab === 'home' && <HomeScreen now={now} startTarget={startTarget} telemetry={telemetry} />}
        {tab === 'map' && <MapScreen telemetry={telemetry} />}
        {tab === 'aid' && <AidScreen telemetry={telemetry} />}
        {tab === 'race' && (
          <MyRaceScreen
            telemetry={telemetry}
            projectedSeconds={projectedSeconds}
            projectedDeltaPb={projectedDeltaPb}
            status={status}
          />
        )}
        {tab === 'finish' && (
          <FinishScreen
            telemetry={telemetry}
            projectedSeconds={projectedSeconds}
            projectedDeltaPb={projectedDeltaPb}
            finished={finished}
            onFinish={() => {
              setFinished(true);
              vibrate([50, 20, 50, 20, 100]);
              shippie.feel.texture('milestone');
              shippie.intent.broadcast('race.finished', [
                {
                  slug: 'race-demo',
                  bib: participant.bib,
                  chipTimeSeconds: projectedSeconds,
                  projected: !finished,
                },
              ]);
            }}
          />
        )}
      </section>

      <nav className="bottom-nav" aria-label="Race sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => {
              setTab(item.id);
              shippie.feel.texture('navigate');
            }}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === 'finish' && finished ? <span className="nav-alert" /> : null}
          </button>
        ))}
      </nav>

      <InfoSheet open={infoOpen || tab === 'info'} onClose={() => setInfoOpen(false)} />
    </main>
  );
}

function HomeScreen({
  now,
  startTarget,
  telemetry,
}: {
  now: Date;
  startTarget: Date;
  telemetry: Telemetry;
}) {
  const countdown = formatCountdown(startTarget.getTime() - now.getTime());
  const currentWave = waves.find((wave) => wave.id === participant.wave);

  return (
    <div className="view stack">
      <header className="race-hero">
        <p className="eyebrow mono">{race.date}</p>
        <h1>
          HACKNEY HALF <span>2026</span>
        </h1>
        <p>{race.distanceMiles} miles from Hackney Marshes to Victoria Park.</p>
      </header>

      <section className="start-panel">
        <div className="section-kicker">Your Start</div>
        <div className="wave-line">
          <span>Wave {participant.wave}</span>
          <strong className="mono">{participant.waveStart}</strong>
        </div>
        <div className="bib-grid">
          <Stat label="Bib" value={participant.bib} />
          <Stat label="Corral" value="Green" />
        </div>
        <div className="countdown-box">
          <span className="mono">{countdown}</span>
          <small>to wave start</small>
        </div>
      </section>

      <section className="panel">
        <div className="section-kicker">Now At The Venue</div>
        <div className="checklist">
          {venueChecklist.map((item) => (
            <label key={item.label}>
              <input type="checkbox" />
              <span>{item.label}</span>
              <strong className="mono">{item.value}</strong>
            </label>
          ))}
        </div>
      </section>

      <section className="split-row">
        <div className="panel weather">
          <div className="section-kicker">Weather</div>
          <strong>{weather.temp}</strong>
          <p>{weather.sky}</p>
          <span className="mono">{weather.wind}</span>
        </div>
        <div className="panel">
          <div className="section-kicker">GPS</div>
          <strong>{telemetry.source === 'gps' ? 'Live fix' : 'Demo fix'}</strong>
          <p>{telemetry.status}</p>
          <span className="mono">KM {telemetry.coveredKm.toFixed(1)}</span>
        </div>
      </section>

      <section className="panel">
        <div className="section-kicker">Wave List</div>
        <div className="wave-list">
          {waves.map((wave) => (
            <div className={wave.id === currentWave?.id ? 'selected' : ''} key={wave.id}>
              <span>{wave.label}</span>
              <small>{wave.detail}</small>
              <strong className="mono">{wave.time}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MapScreen({ telemetry }: { telemetry: RaceTelemetry }) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [points, setPoints] = useState<Record<string, MapPoint>>({});
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [zoom, setZoom] = useState(1);
  const progress = Math.min(1, telemetry.coveredKm / TOTAL_KM);

  const markers = useMemo<MapMarker[]>(() => {
    const kmMarkers: MapMarker[] = Array.from({ length: 21 }, (_, index) => {
      const km = index + 1;
      return { id: `km-${km}`, kind: 'km', t: km / TOTAL_KM, km, label: `KM ${km}` };
    });
    const stationMarkers: MapMarker[] = stations.map((station) => ({
      id: station.id,
      kind: station.kind,
      t: station.km / TOTAL_KM,
      km: station.km,
      label: station.name,
      station,
    }));
    return [
      { id: 'start', kind: 'start', t: 0, label: 'Start line', km: 0 },
      ...kmMarkers,
      ...stationMarkers,
      { id: 'medical-start', kind: 'medical', t: 0.09, label: "St John's start medical" },
      { id: 'toilet-start', kind: 'toilet', t: 0.035, label: 'Start toilets' },
    ];
  }, []);

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    const next: Record<string, MapPoint> = {};
    for (const marker of markers) {
      const point = path.getPointAtLength(total * marker.t);
      next[marker.id] = { x: point.x, y: point.y };
    }
    const gps = path.getPointAtLength(total * progress);
    next.gps = { x: gps.x, y: gps.y };
    setPoints(next);
  }, [markers, progress]);

  return (
    <div className="map-view">
      <div className="map-title">
        <h2>Route Map</h2>
        <p className="mono">GPS works offline via satellite</p>
      </div>

      <div className="map-canvas">
        <svg viewBox="0 0 360 660" className="route-svg" style={{ transform: `scale(${zoom})` }}>
          <g transform={routeTransform}>
            <path d={routeD} className="route-shadow" />
            <path d={routeD} className="route-line" ref={pathRef} />
            {markers.map((marker) => {
              const point = points[marker.id];
              if (!point) return null;
              return <RouteMarker key={marker.id} marker={marker} point={point} onSelect={setSelected} />;
            })}
            {points.gps ? (
              <g transform={`translate(${points.gps.x} ${points.gps.y})`}>
                <circle r="20" className="gps-pulse" />
                <circle r="9" className="gps-dot" />
                <circle r="3" className="gps-core" />
              </g>
            ) : null}
            </g>
        </svg>
      </div>

      <div className="map-controls">
        <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.min(1.32, value + 0.08))} aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.max(0.86, value - 0.08))} aria-label="Zoom out">
          <Icon name="minus" />
        </button>
      </div>

      <div className="map-progress">
        <div>
          <Icon name="pin" />
          <span className="mono">
            KM {telemetry.coveredKm.toFixed(1)} of {TOTAL_KM.toFixed(1)}
          </span>
        </div>
        <strong className="mono">{Math.max(0, TOTAL_KM - telemetry.coveredKm).toFixed(1)} km to finish</strong>
        <button
          type="button"
          className="gps-button"
          data-state={telemetry.source}
          onClick={telemetry.enableGps}
          disabled={telemetry.source === 'gps' || telemetry.source === 'waiting' || telemetry.source === 'unavailable'}
        >
          <Icon name="gps" />
          <span>
            {telemetry.source === 'gps'
              ? 'GPS live'
              : telemetry.source === 'waiting'
                ? 'Locating…'
                : telemetry.source === 'unavailable'
                  ? 'GPS unavailable'
                  : 'Enable GPS'}
          </span>
        </button>
        <div className="meter">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {selected ? <MarkerSheet marker={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function RouteMarker({
  marker,
  point,
  onSelect,
}: {
  marker: MapMarker;
  point: MapPoint;
  onSelect(marker: MapMarker): void;
}) {
  if (marker.kind === 'km') {
    return (
      <g className="marker km-marker" transform={`translate(${point.x} ${point.y})`} onClick={() => onSelect(marker)}>
        <circle r="22" style={{ fill: 'transparent', stroke: 'none' }} />
        <circle r="10" />
        <text y="4">{marker.km}</text>
      </g>
    );
  }
  return (
    <g
      className={`marker marker-${marker.kind}`}
      transform={`translate(${point.x} ${point.y})`}
      onClick={() => onSelect(marker)}
    >
      <circle r="24" style={{ fill: 'transparent', stroke: 'none' }} />
      <circle r={marker.kind === 'start' || marker.kind === 'finish' ? 17 : 14} />
      <text y="5">{symbolForMarker(marker.kind)}</text>
    </g>
  );
}

function MarkerSheet({ marker, onClose }: { marker: MapMarker; onClose(): void }) {
  const station = marker.station;
  return (
    <aside className="marker-sheet">
      <button className="sheet-close" type="button" onClick={onClose} aria-label="Close marker">
        <Icon name="close" />
      </button>
      <div className="section-kicker">{marker.kind === 'km' ? 'Course Marker' : marker.kind}</div>
      <h3>{station?.name ?? marker.label}</h3>
      <p className="mono">KM {marker.km?.toFixed(marker.km % 1 === 0 ? 0 : 1) ?? '0.0'}</p>
      {station?.cutoffTime ? <strong className="cutoff-time mono">Reach by {station.cutoffTime}</strong> : null}
      {station ? (
        <>
          <div className="chips">
            {station.supplies.map((supply) => (
              <span key={supply}>{supply}</span>
            ))}
          </div>
          {station.medical ? <p>{station.medical}</p> : null}
          {station.note ? <p>{station.note}</p> : null}
        </>
      ) : (
        <p>{marker.kind === 'km' ? 'Distance marker. Use it to check watch drift and pace.' : 'Course support point.'}</p>
      )}
    </aside>
  );
}

function AidScreen({ telemetry }: { telemetry: Telemetry }) {
  const nextCutoff = stations.find((station) => {
    if (!station.cutoffTime) return false;
    const arrival = estimateArrivalSeconds(station.km, telemetry.coveredKm, telemetry.elapsedSeconds, telemetry.paceSecondsPerKm);
    return cutoffCushionSeconds(station.cutoffTime, participant.waveStart, arrival) < 0;
  });

  return (
    <div className="view stack">
      <header className="compact-header">
        <h2>Aid And Cutoffs</h2>
        <p>ETAs are calculated locally from GPS pace, wave start, and remaining distance.</p>
      </header>

      {nextCutoff ? (
        <section className="warning-banner">
          <Icon name="warn" />
          <span>At current pace: may miss {nextCutoff.name}</span>
        </section>
      ) : (
        <section className="ok-banner">
          <span className="live-dot" />
          Cutoff pace looks safe right now
        </section>
      )}

      <div className="station-list">
        {stations.map((station) => (
          <StationCard key={station.id} station={station} telemetry={telemetry} />
        ))}
      </div>
    </div>
  );
}

function StationCard({ station, telemetry }: { station: Station; telemetry: Telemetry }) {
  const arrival = estimateArrivalSeconds(station.km, telemetry.coveredKm, telemetry.elapsedSeconds, telemetry.paceSecondsPerKm);
  const eta = formatClockSeconds(parseClockTime(participant.waveStart) + arrival);
  const cushion = station.cutoffTime
    ? cutoffCushionSeconds(station.cutoffTime, participant.waveStart, arrival)
    : null;
  const risky = cushion !== null && cushion < 0;
  const soon = cushion !== null && cushion >= 0 && cushion < 15 * 60;

  return (
    <article className={`station-card ${station.kind} ${risky ? 'risky' : ''}`}>
      <div className="station-main">
        <Icon name={iconForStation(station)} />
        <div>
          <h3>{station.name}</h3>
          <p className="mono">KM {station.km.toFixed(station.km % 1 === 0 ? 0 : 1)} / ETA {eta}</p>
        </div>
        {station.cutoffTime ? <strong className="mono">{station.cutoffTime}</strong> : null}
      </div>
      {cushion !== null ? (
        <p className={risky ? 'danger-text mono' : soon ? 'warn-text mono' : 'safe-text mono'}>
          {risky ? 'Behind cutoff by ' : 'Cutoff cushion '}
          {formatShortDuration(Math.abs(cushion))}
        </p>
      ) : null}
      <div className="chips">
        {station.supplies.map((supply) => (
          <span key={supply}>{supply}</span>
        ))}
      </div>
      {station.medical ? <p className="station-note">{station.medical}</p> : null}
    </article>
  );
}

function MyRaceScreen({
  telemetry,
  projectedSeconds,
  projectedDeltaPb,
  status,
}: {
  telemetry: Telemetry;
  projectedSeconds: number;
  projectedDeltaPb: number;
  status: string;
}) {
  const [sliderPace, setSliderPace] = useState(330);
  const sliderProjected = projectedFinishSeconds(telemetry.coveredKm, telemetry.elapsedSeconds, sliderPace);
  const targetDelta = projectedSeconds - participant.targetSeconds;

  return (
    <div className="view stack">
      <header className="compact-header">
        <p className="eyebrow">Good luck, Alex</p>
        <h2>My Race</h2>
        <p>{participant.club} - {participant.category} - bib {participant.bib}</p>
      </header>

      <section className={`coach-panel ${targetDelta <= 0 ? 'positive' : 'urgent'}`}>
        <div className="section-kicker">Status</div>
        <h3>{status}</h3>
        <p className="mono">
          Projected {formatDuration(projectedSeconds)} - {targetDelta <= 0 ? 'ahead by ' : 'over by '}
          {formatShortDuration(Math.abs(targetDelta))}
        </p>
      </section>

      <section className="metric-grid">
        <Stat label="Current pace" value={`${formatPace(telemetry.paceSecondsPerKm)} /km`} />
        <Stat label="Projected" value={formatDuration(projectedSeconds)} />
        <Stat label="Elapsed" value={formatDuration(telemetry.elapsedSeconds)} />
        <Stat label="Distance" value={`${telemetry.coveredKm.toFixed(2)} km`} />
      </section>

      <section className="panel">
        <div className="section-kicker">PB Attempt</div>
        <div className="pb-line">
          <span>Personal best</span>
          <strong className="mono">{formatDuration(participant.personalBestSeconds)}</strong>
        </div>
        <div className="pb-line">
          <span>Against PB</span>
          <strong className={`mono ${projectedDeltaPb <= 0 ? 'safe-text' : 'warn-text'}`}>
            {formatShortDuration(projectedDeltaPb)}
          </strong>
        </div>
      </section>

      <section className="panel pace-calc">
        <div className="section-kicker">Pace Calculator</div>
        <label>
          <span>If I run the rest at</span>
          <strong className="mono">{formatPace(sliderPace)} /km</strong>
        </label>
        <input
          type="range"
          min={300}
          max={426}
          step={1}
          value={sliderPace}
          onChange={(event) => setSliderPace(Number(event.target.value))}
        />
        <p className="mono">
          Finish {formatDuration(sliderProjected)} {sliderProjected < participant.personalBestSeconds ? 'PB pace' : 'steady finish'}
        </p>
      </section>

      <section className="panel emergency">
        <div>
          <div className="section-kicker">Emergency Contact</div>
          <strong>{participant.emergencyName}</strong>
          <p className="mono">{participant.emergencyPhone}</p>
        </div>
        <a href={`tel:${participant.emergencyPhone.replace(/\s/g, '')}`} aria-label="Call emergency contact">
          <Icon name="phone" />
        </a>
      </section>
    </div>
  );
}

function FinishScreen({
  telemetry,
  projectedSeconds,
  projectedDeltaPb,
  finished,
  onFinish,
}: {
  telemetry: Telemetry;
  projectedSeconds: number;
  projectedDeltaPb: number;
  finished: boolean;
  onFinish(): void;
}) {
  return (
    <div className="view stack finish-view">
      <div className={finished ? 'confetti on' : 'confetti'} aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <header className="finish-hero">
        <Icon name="star" />
        <h2>{finished ? 'You Finished' : 'Finish Preview'}</h2>
        <p className="mono">{formatDuration(projectedSeconds)}</p>
        <span>{projectedDeltaPb <= 0 ? `New PB by ${formatShortDuration(Math.abs(projectedDeltaPb))}` : 'Strong finish projected'}</span>
      </header>

      <section className="share-card">
        <p>I FINISHED THE HACKNEY HALF 2026</p>
        <strong className="mono">{formatDuration(projectedSeconds)}</strong>
        <span>Hackney Marshes to Victoria Park</span>
        <small>shippie.app/race - No signal? No problem.</small>
      </section>

      <section className="metric-grid">
        <Stat label="Distance" value={`${Math.max(telemetry.coveredKm, TOTAL_KM).toFixed(1)} km`} />
        <Stat label="Avg pace" value={`${formatPace(projectedSeconds / TOTAL_KM)} /km`} />
        <Stat label="Weather" value="16C" />
        <Stat label="Elevation" value="82 m" />
      </section>

      <section className="panel replay">
        <div className="section-kicker">Route Replay</div>
        <svg viewBox="0 0 360 150" aria-hidden="true">
          <path d="M 20 118 C 80 22 150 134 214 54 C 260 10 300 66 340 34" />
          <circle cx="340" cy="34" r="8" />
        </svg>
      </section>

      <button className="primary-action" type="button" onClick={onFinish}>
        {finished ? 'Finished' : 'Mark Finished'}
      </button>
    </div>
  );
}

function InfoSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop">
      <button type="button" className="scrim" onClick={onClose} aria-label="Close info" />
      <aside className="info-sheet">
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Close info">
          <Icon name="close" />
        </button>
        <header>
          <p className="eyebrow">Race Info</p>
          <h2>Everything Saved Offline</h2>
        </header>
        {infoSections.map((section) => (
          <section key={section.title} className="panel">
            <div className="section-kicker">{section.title}</div>
            <div className="info-rows">
              {section.rows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
        <section className="panel">
          <div className="section-kicker">Pace Chart</div>
          <div className="pace-table">
            {paceChart.map((pace) => (
              <div key={pace.finish}>
                <span className="mono">{pace.finish}</span>
                <strong className="mono">{pace.perKm} /km</strong>
                <small className="mono">{pace.perMile} /mi</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-kicker">Route Detail</div>
          <div className="route-list">
            {routeStops.map((stop) => (
              <div key={stop.label}>
                <span className="mono">{stop.label}</span>
                <p>{stop.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), interval);
    return () => window.clearInterval(id);
  }, [interval]);
  return now;
}

function useTelemetry(): RaceTelemetry {
  const [telemetry, setTelemetry] = useState<Telemetry>(() => ({
    coveredKm: 6.82,
    elapsedSeconds: 6.82 * 338,
    paceSecondsPerKm: 338,
    speedMs: paceToSpeedMs(338),
    source: 'demo',
    status: 'Simulated GPS until live position is enabled',
    lastFixAt: null,
  }));
  const watchRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<GeolocationCoordinates | null>(null);
  const lastKmRef = useRef(6);

  useEffect(() => {
    if (telemetry.source !== 'demo') return;
    const id = window.setInterval(() => {
      setTelemetry((current) => {
        const wobble = Math.sin(Date.now() / 7000) * 7;
        const paceSecondsPerKm = 338 + wobble;
        const coveredKm = Math.min(TOTAL_KM, current.coveredKm + 1 / 60 / 6);
        return {
          ...current,
          coveredKm,
          elapsedSeconds: coveredKm * paceSecondsPerKm,
          paceSecondsPerKm,
          speedMs: paceToSpeedMs(paceSecondsPerKm),
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [telemetry.source]);

  useEffect(() => {
    const km = Math.floor(telemetry.coveredKm);
    if (km > lastKmRef.current) {
      lastKmRef.current = km;
      vibrate([20, 10, 20]);
    }
  }, [telemetry.coveredKm]);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  function enableGps() {
    if (!navigator.geolocation) {
      setTelemetry((current) => ({
        ...current,
        source: 'unavailable',
        status: 'GPS unavailable on this device',
      }));
      return;
    }
    if (watchRef.current !== null) return;
    setTelemetry((current) => ({ ...current, source: 'waiting', status: 'Waiting for GPS fix' }));
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setTelemetry((current) => {
          const last = lastCoordsRef.current;
          const movedKm = last ? haversineKm(last, position.coords) : 0;
          lastCoordsRef.current = position.coords;
          const speedPace = speedMsToPace(position.coords.speed);
          const paceSecondsPerKm = speedPace ?? current.paceSecondsPerKm;
          const coveredKm = Math.min(TOTAL_KM, current.coveredKm + movedKm);
          return {
            coveredKm,
            elapsedSeconds: coveredKm * paceSecondsPerKm,
            paceSecondsPerKm,
            speedMs: paceToSpeedMs(paceSecondsPerKm),
            source: 'gps',
            status: 'Live GPS fix',
            lastFixAt: position.timestamp,
          };
        });
      },
      () => {
        setTelemetry((current) => ({
          ...current,
          source: 'unavailable',
          status: 'GPS permission unavailable; demo fix remains active',
        }));
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    shippie.feel.texture('confirm');
  }

  return { ...telemetry, enableGps };
}

function formatCountdown(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function iconForStation(station: Station): IconName {
  if (station.kind === 'cutoff') return 'warn';
  if (station.kind === 'finish') return 'finish';
  if (station.medical) return 'medical';
  return 'water';
}

function symbolForMarker(kind: MapMarker['kind']) {
  if (kind === 'start') return 'S';
  if (kind === 'finish') return '*';
  if (kind === 'cutoff') return '!';
  if (kind === 'medical') return '+';
  if (kind === 'toilet') return 'T';
  if (kind === 'aid') return 'A';
  return 'W';
}

function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function Icon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'home' && <path {...common} d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z" />}
      {name === 'map' && <path {...common} d="m3 6 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 4v16M15 6v16" />}
      {name === 'aid' && <path {...common} d="M5 5h14M7 9h10M7 13h10M7 17h7" />}
      {name === 'user' && <path {...common} d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />}
      {name === 'finish' && <path {...common} d="M5 21V4h10l-1 4 1 4H5M15 4h4v8h-4" />}
      {name === 'info' && <path {...common} d="M12 17v-6M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
      {name === 'pin' && <path {...common} d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11ZM12 10h.01" />}
      {name === 'gps' && <path {...common} d="M12 2v3M12 19v3M2 12h3M19 12h3M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />}
      {name === 'water' && <path {...common} d="M12 3s6 6.4 6 11a6 6 0 1 1-12 0c0-4.6 6-11 6-11Z" />}
      {name === 'warn' && <path {...common} d="M12 3 2 21h20L12 3ZM12 9v5M12 17h.01" />}
      {name === 'medical' && <path {...common} d="M12 5v14M5 12h14" />}
      {name === 'toilet' && <path {...common} d="M8 4h8M9 8h6l1 13H8L9 8Z" />}
      {name === 'bag' && <path {...common} d="M8 7V6a4 4 0 0 1 8 0v1M5 7h14l-1 15H6Z" />}
      {name === 'clock' && <path {...common} d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
      {name === 'target' && <path {...common} d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />}
      {name === 'phone' && <path {...common} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-5.9-5.9A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />}
      {name === 'plus' && <path {...common} d="M12 5v14M5 12h14" />}
      {name === 'minus' && <path {...common} d="M5 12h14" />}
      {name === 'close' && <path {...common} d="m6 6 12 12M18 6 6 18" />}
      {name === 'flag' && <path {...common} d="M6 21V4h10l-1 4 1 4H6" />}
      {name === 'star' && <path {...common} d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9z" />}
    </svg>
  );
}
