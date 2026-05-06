import { useState } from 'react';
import { saveSettings } from '../sync/pairing.ts';

interface Props {
  onDone: (kidName: string) => void;
}

export function SetupPage({ onDone }: Props) {
  const [kidName, setKidName] = useState('');
  return (
    <section className="ss-setup">
      <h1>Story Studio</h1>
      <p>
        Tell us your child's name. Story Studio uses it to title their stories
        ("Lily made a story").
      </p>
      <input
        autoFocus
        value={kidName}
        onChange={(e) => setKidName(e.target.value)}
        placeholder="e.g. Lily"
        className="ss-input"
      />
      <button
        type="button"
        className="ss-btn ss-btn-primary"
        disabled={!kidName.trim()}
        onClick={() => {
          const name = kidName.trim();
          saveSettings({ kidName: name, deviceId: '' });
          onDone(name);
        }}
      >
        Done
      </button>
      <p className="ss-foot-note">
        Stories are saved on this phone. Sharing to a grandparent's phone is opt-in
        — set up below once a child has made their first story.
      </p>
    </section>
  );
}
