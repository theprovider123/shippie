import { useEffect, useMemo, useState } from 'react';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { Home } from './home.tsx';
import { HostRoom } from './host/HostRoom.tsx';
import { GuestRoom } from './guest/GuestRoom.tsx';
import { JoinForm } from './guest/JoinForm.tsx';

type View =
  | { kind: 'home' }
  | { kind: 'host' }
  | { kind: 'guest'; joinCode?: string };

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'guest' && b.kind === 'guest') return a.joinCode === b.joinCode;
  return true;
}

function readUrlCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  return code ? code.toUpperCase() : undefined;
}

export function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<View>(
        { kind: 'home' },
        setView,
        { isEqual: sameView },
      ),
    [],
  );

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  useEffect(() => {
    const prefill = readUrlCode();
    if (prefill && prefill.length === 6) {
      void localNavigation.replace({ kind: 'guest', joinCode: prefill }, { kind: 'crossfade' });
    }
  }, [localNavigation]);

  if (view.kind === 'home') {
    return (
      <Home
        onPickHost={() => void localNavigation.navigate({ kind: 'host' }, { kind: 'rise' })}
        onPickGuest={() => void localNavigation.navigate({ kind: 'guest' }, { kind: 'rise' })}
      />
    );
  }
  if (view.kind === 'host') {
    return <HostRoom />;
  }
  if (!view.joinCode) {
    return (
      <JoinForm
        onSubmit={(code) =>
          void localNavigation.navigate({ kind: 'guest', joinCode: code }, { kind: 'rise' })
        }
      />
    );
  }
  return <GuestRoom joinCode={view.joinCode} />;
}
