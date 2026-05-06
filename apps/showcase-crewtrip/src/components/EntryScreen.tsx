import type { CSSProperties } from 'react';

export function EntryScreen(props: {
  themeStyle: CSSProperties;
  eventName: string;
  description: string;
  eventCode: string;
  onHost: () => void;
  onCrew: () => void;
}) {
  return (
    <main className="entry-shell" style={props.themeStyle}>
      <section className="entry-card">
        <p className="eyebrow">Crewtrip / {props.eventCode}</p>
        <h1>{props.eventName || 'Crewtrip'}</h1>
        <p>{props.description}</p>
        <div className="entry-actions" aria-label="Choose your Crewtrip role">
          <button onClick={props.onHost}>
            <strong>I am the host</strong>
            <span>Set up, invite, and manage the trip.</span>
          </button>
          <button onClick={props.onCrew}>
            <strong>I am crew</strong>
            <span>Join, vote, request, play, and save memories.</span>
          </button>
        </div>
      </section>
    </main>
  );
}
