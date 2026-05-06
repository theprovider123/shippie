import { useState } from 'react';
import type { CSSProperties } from 'react';

interface EntryScreenProps {
  themeStyle: CSSProperties;
  /** If true, the EntryScreen offers a "Continue your trip" path. */
  hasExistingTrip: boolean;
  existingTripName?: string;
  /** Host starts a fresh trip. The name is optional; we'll fall back to "Crewtrip". */
  onStartNew: (name: string) => void;
  /** Crew joins by typing the trip code (e.g. OLIVE-PORCH-07). */
  onJoinCode: (code: string) => void;
  /** Host enters their existing trip from localStorage. */
  onContinue: () => void;
  /** "See the demo" — opt-in path into the seeded showcase trip. */
  onTryDemo: () => void;
}

type Mode = 'choose' | 'host-new' | 'crew-join';

const CODE_PATTERN = /^[A-Z]+-[A-Z]+-\d{1,3}$/;

export function EntryScreen(props: EntryScreenProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [tripName, setTripName] = useState('');
  const [code, setCode] = useState('');

  if (mode === 'choose') {
    return (
      <main className="entry-shell" style={props.themeStyle}>
        <section className="entry-card">
          <p className="eyebrow">Crewtrip</p>
          <h1>The trip is <em>what you make of it.</em></h1>
          <p>
            A shared hub for the days you'll talk about for years. Plans, votes,
            games, requests, and the moments worth keeping — owned by the host
            and the crew.
          </p>
          <div className="entry-actions">
            {props.hasExistingTrip ? (
              <button onClick={props.onContinue}>
                <strong>Continue {props.existingTripName || 'your trip'}</strong>
                <span>Pick up right where the crew left off.</span>
              </button>
            ) : null}
            <button onClick={() => setMode('host-new')}>
              <strong>Start a new trip</strong>
              <span>You're hosting. Set the vibe and invite the crew.</span>
            </button>
            <button onClick={() => setMode('crew-join')}>
              <strong>Join with a code</strong>
              <span>Someone shared a code like OLIVE-PORCH-07.</span>
            </button>
            <button className="entry-quiet" onClick={props.onTryDemo}>
              <strong>See the demo trip</strong>
              <span>Browse a sample trip with seeded plans and memories.</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (mode === 'host-new') {
    return (
      <main className="entry-shell" style={props.themeStyle}>
        <section className="entry-card">
          <p className="eyebrow">Hosting</p>
          <h1>What are we calling it?</h1>
          <p>You can change this any time. Anything works — "Sam's 30th",
            "August Lake Weekend", "Sicily 2026".</p>
          <input
            className="entry-input"
            type="text"
            value={tripName}
            placeholder="Trip name"
            onChange={(event) => setTripName(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onStartNew(tripName.trim());
            }}
          />
          <div className="entry-actions">
            <button onClick={() => props.onStartNew(tripName.trim())}>
              <strong>Start the trip</strong>
              <span>You'll get a join code to share with the crew.</span>
            </button>
            <button className="entry-quiet" onClick={() => setMode('choose')}>
              <strong>Back</strong>
              <span>Pick a different way in.</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  // mode === 'crew-join'
  const trimmed = code.trim().toUpperCase();
  const valid = CODE_PATTERN.test(trimmed);
  return (
    <main className="entry-shell" style={props.themeStyle}>
      <section className="entry-card">
        <p className="eyebrow">Joining</p>
        <h1>What's the code?</h1>
        <p>The host shared something like <em>OLIVE-PORCH-07</em>.</p>
        <input
          className="entry-input mono"
          type="text"
          value={code}
          placeholder="OLIVE-PORCH-07"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid) props.onJoinCode(trimmed);
          }}
        />
        <div className="entry-actions">
          <button disabled={!valid} onClick={() => props.onJoinCode(trimmed)}>
            <strong>Join the crew</strong>
            <span>{valid ? "We'll connect you to the host's trip." : 'Type the full code to continue.'}</span>
          </button>
          <button className="entry-quiet" onClick={() => setMode('choose')}>
            <strong>Back</strong>
            <span>Pick a different way in.</span>
          </button>
        </div>
      </section>
    </main>
  );
}
