import { useEffect, useState } from 'react';
import { Home } from './home.tsx';
import { HostRoom } from './host/HostRoom.tsx';
import { GuestRoom } from './guest/GuestRoom.tsx';
import { JoinForm } from './guest/JoinForm.tsx';

type View =
  | { kind: 'home' }
  | { kind: 'host' }
  | { kind: 'guest'; joinCode?: string };

function readUrlCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  return code ? code.toUpperCase() : undefined;
}

export function App() {
  const [view, setView] = useState<View>({ kind: 'home' });

  useEffect(() => {
    const prefill = readUrlCode();
    if (prefill && prefill.length === 6) {
      setView({ kind: 'guest', joinCode: prefill });
    }
  }, []);

  if (view.kind === 'home') {
    return (
      <Home
        onPickHost={() => setView({ kind: 'host' })}
        onPickGuest={() => setView({ kind: 'guest' })}
      />
    );
  }
  if (view.kind === 'host') {
    return <HostRoom />;
  }
  if (!view.joinCode) {
    return <JoinForm onSubmit={(code) => setView({ kind: 'guest', joinCode: code })} />;
  }
  return <GuestRoom joinCode={view.joinCode} />;
}
