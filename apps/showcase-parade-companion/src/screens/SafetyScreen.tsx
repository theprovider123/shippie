import type { RoutePack } from '../data/parade-2026';
import { packFreshnessLabel } from '../lib/route-pack';

interface SafetyScreenProps {
  pack: RoutePack;
}

export function SafetyScreen({ pack }: SafetyScreenProps) {
  const medicalPois = pack.pois.filter((poi) => poi.kind === 'medical' || poi.kind === 'stewards' || poi.kind === 'exit');

  return (
    <section className="screen safety-screen">
      <div className="screen-heading">
        <p className="eyebrow">Static pack</p>
        <h1>Safety & Transport</h1>
        <p>Saved to your phone. Follow stewards and official announcements over this pack.</p>
      </div>

      <div className="panel">
        <h2>Crowd basics</h2>
        <div className="stacked-list">
          {pack.safety.map((item) => (
            <article key={item.heading}>
              <strong>{item.heading}</strong>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Stations</h2>
        <div className="station-list">
          {pack.transport.stations.map((station) => (
            <article key={station.name} className={`station ${station.status}`}>
              <strong>{station.name}</strong>
              <span>{station.status === 'open-check' ? 'check before travel' : station.status}</span>
              <p>{station.note}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Step-free ways out</h2>
        <div className="stacked-list">
          {pack.transport.stepFreeRoutesOut.map((route) => (
            <article key={route.label}>
              <strong>{route.label}</strong>
              <p>{route.via}</p>
              <small>{route.note}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Closures and help points</h2>
        <div className="stacked-list">
          {pack.closures.map((closure) => (
            <article key={closure.label}>
              <strong>{closure.label}</strong>
              <p>{closure.note}</p>
            </article>
          ))}
          {medicalPois.map((poi) => (
            <article key={poi.id}>
              <strong>{poi.name}</strong>
              <p>{poi.note}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="source-block">
        <span>Info as of {packFreshnessLabel(pack)}</span>
        <small>Links need signal; the guidance above is the offline copy.</small>
        {pack.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
            {source.label}
          </a>
        ))}
      </div>
    </section>
  );
}
