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
        <p className="eyebrow">Crewtrip · {props.eventCode}</p>
        <h1>
          {props.eventName && props.eventName !== 'Crewtrip'
            ? props.eventName
            : (
                <>
                  The trip is <em>what you make of it.</em>
                </>
              )}
        </h1>
        <p>
          A shared hub for the days you'll talk about for years. Plans, votes,
          games, requests, and the moments worth keeping — owned by the host
          and the crew.
        </p>
        <div className="entry-actions" aria-label="Choose your Crewtrip role">
          <button onClick={props.onHost}>
            <strong>I'm hosting</strong>
            <span>Set the vibe, invite the crew, steer lightly.</span>
          </button>
          <button onClick={props.onCrew}>
            <strong>I'm along for the ride</strong>
            <span>Join, vote, request, play, save the moments.</span>
          </button>
        </div>
      </section>
    </main>
  );
}
