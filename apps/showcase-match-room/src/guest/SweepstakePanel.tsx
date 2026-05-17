import { useMemo, useState } from 'react';
import { createSweepstakeDraw } from '../lib/draw.ts';
import { randomDrawSeed, randomMemberPlaceholder } from '../host/host-controller.ts';

export function SweepstakePanel() {
  const [seed, setSeed] = useState(() => randomDrawSeed());
  const [members, setMembers] = useState(() => randomMemberPlaceholder());
  const draw = useMemo(() => createSweepstakeDraw(members.split(','), seed), [members, seed]);

  return (
    <section className="sweepstake-panel">
      <div className="panel-head">
        <h2>48-team draw</h2>
        <span>{draw.length} entries</span>
      </div>
      <div className="mini-form-grid">
        <label>
          Seed
          <input value={seed} onChange={(event) => setSeed(event.currentTarget.value)} />
        </label>
        <label>
          Names
          <input value={members} onChange={(event) => setMembers(event.currentTarget.value)} />
        </label>
      </div>
      <div className="draw-list">
        {draw.slice(0, 3).map((item) => (
          <div key={item.member} className="draw-row">
            <strong>{item.member}</strong>
            <span>{item.teams.slice(0, 5).join(', ')}{item.teams.length > 5 ? '…' : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
