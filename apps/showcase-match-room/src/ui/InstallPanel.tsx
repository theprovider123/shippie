import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallPanel() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <section className="install-panel">
      <div>
        <span>{installed ? 'Shippie is installed' : 'Ready for Shippie'}</span>
        <strong>{installed ? 'Match Room is saved in your Shippie shell.' : 'Add Match Room to My Tools.'}</strong>
        <p>{installed ? 'Bottom tabs, safe-area spacing, offline-friendly tournament content, and room links are ready.' : 'Best for pubs, sofas, offices, and family tables: one tap inside Shippie, full-screen, no account.'}</p>
      </div>
      {promptEvent && !installed ? (
        <button type="button" className="primary-action" onClick={() => void install()}>Install Shippie</button>
      ) : (
        <small>{installed ? 'Standalone Shippie shell detected' : 'Open from Shippie or add the Shippie shell to your home screen'}</small>
      )}
    </section>
  );
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
