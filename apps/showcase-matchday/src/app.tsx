import { useMemo, useState } from 'react';
import { HostMatchday } from './host/HostMatchday.tsx';
import { GuestMatchday } from './guest/GuestMatchday.tsx';
import { DisplayMatchday } from './display/DisplayMatchday.tsx';
import { JoinForm } from './guest/JoinForm.tsx';
import { getStablePeerId, randomId } from './shared/peer-id.ts';
import { matchdayUrl, readRoomParams } from './shared/signal-config.ts';

export function App() {
  const [params, setParams] = useState(() => readRoomParams());
  const peerId = useMemo(() => getStablePeerId(), []);

  const startHost = () => {
    const roomId = randomId('match').replace(/^match_/, 'match-');
    const roomKey = randomId('key').replace(/^key_/, '');
    window.history.replaceState(null, '', matchdayUrl({ role: 'host', roomId, roomKey }));
    setParams(readRoomParams());
  };

  if (!params.role || !params.roomId || !params.roomKey) {
    return (
      <main className="start-screen">
        <section className="stadium-mark" aria-hidden="true">
          <div className="pitch">
            <span />
            <span />
            <span />
          </div>
        </section>
        <section className="start-panel">
          <p className="eyebrow">Shippie Matchday</p>
          <h1>Run the poll when the network does not.</h1>
          <div className="start-actions">
            <button className="primary-action" onClick={startHost}>Start host board</button>
          </div>
          <JoinForm />
        </section>
      </main>
    );
  }

  if (params.role === 'host') {
    return (
      <HostMatchday
        roomId={params.roomId}
        roomKey={params.roomKey}
        signalBase={params.signalBase}
        peerId={peerId}
      />
    );
  }

  if (params.role === 'display') {
    return (
      <DisplayMatchday
        roomId={params.roomId}
        roomKey={params.roomKey}
        signalBase={params.signalBase}
        peerId={peerId}
      />
    );
  }

  return (
    <GuestMatchday
      roomId={params.roomId}
      roomKey={params.roomKey}
      signalBase={params.signalBase}
      peerId={peerId}
    />
  );
}
