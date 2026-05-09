import { useEffect, useState } from 'react';
import { resolveLocalDb } from './db/runtime.ts';
import { seedIfEmpty } from './db/seed.ts';
import {
  chooseStartupBackupPrompt,
  dismissInstallNudge,
  hasRequestedPersistence,
  loadBackupMeta,
  loadPersistenceMeta,
  promptText,
  recordBlendSaveAndChoosePrompt,
  requestDurableSteepStorage,
  shouldNudgeInstall,
  type BackupPromptReason,
} from './db/data-safety.ts';
import { DisclaimerSheet } from './components/DisclaimerSheet.tsx';
import { SteepDataPanel } from './components/SteepDataPanel.tsx';
import { BlendsList } from './pages/BlendsList.tsx';
import { BlendDetail } from './pages/BlendDetail.tsx';
import { BlendEdit } from './pages/BlendEdit.tsx';
import { BrewMode } from './pages/BrewMode.tsx';
import { Library } from './pages/Library.tsx';
import { InventoryPage } from './pages/Inventory.tsx';
import { Journal } from './pages/Journal.tsx';
import { ShareSheet } from './share/ShareSheet.tsx';
import { ImportCard } from './share/ImportCard.tsx';
import { checkBlendImport, type BlendImportCheck } from './share/blend-import.ts';
import { readImportFragment } from '@shippie/share';
import type { BlendWithIngredients } from './db/schema.ts';

type Route =
  | { kind: 'list' }
  | { kind: 'detail'; blendId: string }
  | { kind: 'edit'; blendId: string | null }
  | { kind: 'brew'; blendId: string }
  | { kind: 'library' }
  | { kind: 'inventory' }
  | { kind: 'journal' };

export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'list' });
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [backupPrompt, setBackupPrompt] = useState<BackupPromptReason | null>(null);
  const [installNudge, setInstallNudge] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [sharing, setSharing] = useState<BlendWithIngredients | null>(null);
  const [pendingImport, setPendingImport] = useState<
    Extract<BlendImportCheck, { ok: true }> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const db = resolveLocalDb();
    (async () => {
      try {
        const seeded = await seedIfEmpty(db);
        if (cancelled) return;
        if (seeded.herbsAdded > 0 || seeded.blendsAdded > 0) {
          setSeedNote(
            `Seeded ${seeded.herbsAdded} herbs and ${seeded.blendsAdded} starter blends.`,
          );
          window.setTimeout(() => !cancelled && setSeedNote(null), 6000);
        }
        setRefreshKey((n) => n + 1);

        const stale = chooseStartupBackupPrompt(loadBackupMeta());
        if (!cancelled && stale) setBackupPrompt(stale);

        const meta = loadPersistenceMeta();
        if (!cancelled && meta && meta.granted === false) {
          void requestDurableSteepStorage(db);
        }

        if (!cancelled && shouldNudgeInstall()) setInstallNudge(true);
      } catch (err) {
        console.warn('[steep] seed failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect a #shippie-import=… fragment and surface the import card.
  // The fragment never reaches a server. The card verifies the
  // signature, previews the blend, then either imports or discards.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      const blob = await readImportFragment(window.location.href);
      if (!blob || cancelled) return;
      const check = await checkBlendImport(blob);
      if (!check.ok) return; // Wrong type/version — silently ignore.
      if (!cancelled) setPendingImport(check);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goTo = (next: Route) => {
    setMoreMenuOpen(false);
    setRoute(next);
  };
  const back = () => goTo({ kind: 'list' });

  const onBlendSaved = (id: string) => {
    setRefreshKey((n) => n + 1);
    if (!hasRequestedPersistence()) void requestDurableSteepStorage(resolveLocalDb());
    const prompt = recordBlendSaveAndChoosePrompt(loadBackupMeta());
    if (prompt && shouldNudgeInstall()) {
      setInstallNudge(true);
    } else if (prompt) {
      setBackupPrompt(prompt);
    }
    goTo({ kind: 'detail', blendId: id });
  };

  return (
    <div className="app">
      {seedNote ? <div className="banner" role="status">{seedNote}</div> : null}

      {installNudge ? (
        <div className="banner install-nudge-banner" role="status">
          <span>Install Steep on your Home Screen so iPhone doesn’t clear your blends.</span>
          <button type="button" onClick={() => setInstallHelpOpen(true)}>
            How to install
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              dismissInstallNudge();
              setInstallNudge(false);
            }}
            aria-label="Dismiss install nudge"
          >
            ×
          </button>
        </div>
      ) : null}

      {backupPrompt ? (
        <div className="banner backup-banner" role="status">
          <span>{promptText(backupPrompt)}</span>
          <button type="button" onClick={() => setDataPanelOpen(true)}>
            Back up
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setBackupPrompt(null)}
            aria-label="Dismiss backup prompt"
          >
            ×
          </button>
        </div>
      ) : null}

      {route.kind === 'list' ? (
        <BlendsList
          refreshKey={refreshKey}
          onOpen={(id) => goTo({ kind: 'detail', blendId: id })}
          onNew={() => goTo({ kind: 'edit', blendId: null })}
          onLibrary={() => goTo({ kind: 'library' })}
        />
      ) : null}
      {route.kind === 'detail' ? (
        <BlendDetail
          blendId={route.blendId}
          refreshKey={refreshKey}
          onEdit={() => goTo({ kind: 'edit', blendId: route.blendId })}
          onBrew={() => goTo({ kind: 'brew', blendId: route.blendId })}
          onShare={(blend) => setSharing(blend)}
          onClose={back}
          onDeleted={() => {
            setRefreshKey((n) => n + 1);
            back();
          }}
        />
      ) : null}
      {route.kind === 'edit' ? (
        <BlendEdit
          blendId={route.blendId}
          onSaved={onBlendSaved}
          onCancel={() => {
            if (route.blendId) {
              goTo({ kind: 'detail', blendId: route.blendId });
            } else {
              back();
            }
          }}
        />
      ) : null}
      {route.kind === 'brew' ? (
        <BrewMode
          blendId={route.blendId}
          onClose={() => {
            setRefreshKey((n) => n + 1);
            goTo({ kind: 'detail', blendId: route.blendId });
          }}
        />
      ) : null}
      {route.kind === 'library' ? <Library onClose={back} /> : null}
      {route.kind === 'inventory' ? <InventoryPage onClose={back} /> : null}
      {route.kind === 'journal' ? <Journal onClose={back} /> : null}

      <DisclaimerSheet />

      {route.kind === 'list' ? (
        <div className="floating-actions">
          <button
            type="button"
            className="floating-button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
          >
            More
          </button>
          {moreMenuOpen ? (
            <ul className="more-menu" role="menu">
              <li>
                <button type="button" role="menuitem" onClick={() => goTo({ kind: 'inventory' })}>
                  Inventory
                </button>
              </li>
              <li>
                <button type="button" role="menuitem" onClick={() => goTo({ kind: 'journal' })}>
                  Brew journal
                </button>
              </li>
              <li>
                <button type="button" role="menuitem" onClick={() => goTo({ kind: 'library' })}>
                  Herb library
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setDataPanelOpen(true);
                  }}
                >
                  Your Data
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}

      {installHelpOpen ? (
        <div
          className="install-help-backdrop"
          role="presentation"
          onClick={() => setInstallHelpOpen(false)}
        >
          <section
            className="install-help"
            role="dialog"
            aria-labelledby="install-help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2 id="install-help-title">Install Steep</h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setInstallHelpOpen(false)}
                aria-label="Close install help"
              >
                ×
              </button>
            </header>
            <ol>
              <li>Tap the Share button in Safari.</li>
              <li>Scroll down and tap "Add to Home Screen".</li>
              <li>Tap "Add" in the top right.</li>
            </ol>
            <p className="install-help-note">
              Installed apps stay even when iPhone clears website data after inactivity.
            </p>
          </section>
        </div>
      ) : null}

      {sharing ? (
        <ShareSheet blend={sharing} onClose={() => setSharing(null)} />
      ) : null}

      {pendingImport ? (
        <ImportCard
          check={pendingImport}
          onImported={(id) => {
            setPendingImport(null);
            setRefreshKey((n) => n + 1);
            goTo({ kind: 'detail', blendId: id });
          }}
          onDiscard={() => setPendingImport(null)}
        />
      ) : null}

      {dataPanelOpen ? (
        <SteepDataPanel
          db={resolveLocalDb()}
          onClose={() => setDataPanelOpen(false)}
          onChanged={() => setRefreshKey((n) => n + 1)}
          onBackupComplete={() => setBackupPrompt(null)}
        />
      ) : null}
    </div>
  );
}
