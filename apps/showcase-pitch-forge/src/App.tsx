import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { HomePage } from './pages/Home.tsx';
import { NewPitchPage, type NewPitchPayload } from './pages/NewPitch.tsx';
import { PitchPage } from './pages/Pitch.tsx';
import { ComparePage } from './pages/Compare.tsx';
import { PrintViewPage } from './pages/PrintView.tsx';
import { TemplatesPage } from './pages/Templates.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import {
  addVersion,
  briefFor,
  clearAll,
  insertPitch,
  load,
  newId,
  removePitch,
  removeSection,
  reorderSections,
  save,
  sectionsFor,
  setIdentity,
  updatePitch,
  upsertBrief,
  upsertSection,
  versionsFor,
  type Brief,
  type Identity,
  type Persisted,
  type Pitch,
  type Section,
} from './lib/store.ts';
import { templateFor, type SectionKind } from './lib/templates.ts';
import { snapshot, restore as restoreSnapshot } from './lib/versions.ts';

const shippie = createShippieIframeSdk({ appId: 'app_pitch_forge' });

type Screen =
  | { kind: 'home' }
  | { kind: 'new' }
  | { kind: 'pitch'; pitchId: string }
  | { kind: 'compare'; pitchId: string; before: string | null; after: string | null }
  | { kind: 'print'; pitchId: string }
  | { kind: 'templates' }
  | { kind: 'settings' };

const NAV: Array<{ id: 'home' | 'templates' | 'settings'; label: string }> = [
  { id: 'home', label: 'Pitches' },
  { id: 'templates', label: 'Templates' },
  { id: 'settings', label: 'Settings' },
];

function sameScreen(a: Screen, b: Screen): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'pitch' && b.kind === 'pitch') return a.pitchId === b.pitchId;
  if (a.kind === 'print' && b.kind === 'print') return a.pitchId === b.pitchId;
  if (a.kind === 'compare' && b.kind === 'compare') {
    return (
      a.pitchId === b.pitchId &&
      a.before === b.before &&
      a.after === b.after
    );
  }
  return true;
}

export function App() {
  const [state, setState] = useState<Persisted>(() => load());
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Screen>(
        { kind: 'home' },
        setScreen,
        { isEqual: sameScreen },
      ),
    [],
  );

  useEffect(() => {
    save(state);
  }, [state]);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigate(next: Screen, kind: 'crossfade' | 'rise' = 'crossfade'): void {
    void localNavigation.navigate(next, { kind });
  }

  function closeTo(fallback: Screen): void {
    void localNavigation.backOrReplace(fallback, { kind: 'crossfade' });
  }

  const activePitch = useMemo(() => {
    if (screen.kind === 'pitch' || screen.kind === 'compare' || screen.kind === 'print') {
      return state.pitches.find((p) => p.id === screen.pitchId) ?? null;
    }
    return null;
  }, [screen, state.pitches]);

  const activeSections = useMemo(() => {
    if (!activePitch) return [];
    return sectionsFor(state, activePitch.id);
  }, [state, activePitch]);

  const activeBriefBody = useMemo(() => {
    if (!activePitch) return '';
    return briefFor(state, activePitch.id)?.body ?? '';
  }, [state, activePitch]);

  function createPitch(payload: NewPitchPayload) {
    const now = new Date().toISOString();
    const tmpl = templateFor(payload.type);
    const pitch: Pitch = {
      id: newId('pitch'),
      type: payload.type,
      title: payload.title,
      target: payload.target,
      deadline: payload.deadline,
      status: 'drafting',
      created_at: now,
      updated_at: now,
    };
    const sections: Section[] = tmpl.sections.map((s, i) => ({
      id: newId('sec'),
      pitch_id: pitch.id,
      kind: s.kind,
      title: s.title,
      body_md: '',
      order: i,
    }));
    setState((prev) => {
      let next = insertPitch(prev, pitch, sections);
      if (payload.brief.trim().length > 0) {
        const brief: Brief = {
          id: newId('brief'),
          pitch_id: pitch.id,
          body: payload.brief,
          captured_at: now,
        };
        next = upsertBrief(next, brief);
      }
      return next;
    });
    shippie.feel.texture('milestone');
    navigate({ kind: 'pitch', pitchId: pitch.id }, 'rise');
  }

  function patchPitch(id: string, patch: Partial<Pitch>) {
    setState((prev) => updatePitch(prev, id, patch));
  }

  function patchSection(id: string, patch: Partial<Section>) {
    setState((prev) => {
      const existing = prev.sections.find((s) => s.id === id);
      if (!existing) return prev;
      return upsertSection(prev, { ...existing, ...patch });
    });
  }

  function addSection(pitchId: string, title: string, kind: SectionKind) {
    const order = sectionsFor(state, pitchId).length;
    const sec: Section = {
      id: newId('sec'),
      pitch_id: pitchId,
      kind,
      title,
      body_md: '',
      order,
    };
    setState((prev) => upsertSection(prev, sec));
  }

  function deleteSection(id: string) {
    setState((prev) => removeSection(prev, id));
  }

  function reorderSecs(pitchId: string, orderedIds: string[]) {
    setState((prev) => reorderSections(prev, pitchId, orderedIds));
  }

  function saveBrief(pitchId: string, body: string) {
    const trimmed = body;
    const existing = briefFor(state, pitchId);
    const brief: Brief = {
      id: existing?.id ?? newId('brief'),
      pitch_id: pitchId,
      body: trimmed,
      captured_at: new Date().toISOString(),
    };
    setState((prev) => upsertBrief(prev, brief));
    shippie.feel.texture('confirm');
  }

  function snapshotVersion(pitchId: string, label?: string) {
    const sections = sectionsFor(state, pitchId);
    const version = snapshot(pitchId, sections, label);
    setState((prev) => addVersion(prev, version));
    shippie.feel.texture('confirm');
    // Cross-app signal: a new draft has been captured. Useful for /today.
    const pitch = state.pitches.find((p) => p.id === pitchId);
    if (pitch) {
      shippie.intent.broadcast('pitch-drafted', [
        {
          pitch_id: pitchId,
          type: pitch.type,
          title: pitch.title,
          target: pitch.target,
          version_id: version.id,
          drafted_at: version.created_at,
        },
      ]);
    }
  }

  function restoreVersion(versionId: string) {
    const version = state.versions.find((v) => v.id === versionId);
    if (!version) return;
    const restored = restoreSnapshot(version);
    setState((prev) => {
      // Replace every section for this pitch with the snapshot's sections.
      const others = prev.sections.filter((s) => s.pitch_id !== version.pitch_id);
      return { ...prev, sections: [...others, ...restored] };
    });
    shippie.feel.texture('milestone');
  }

  function markSent(pitchId: string) {
    const pitch = state.pitches.find((p) => p.id === pitchId);
    if (!pitch) return;
    shippie.intent.broadcast('pitch-sent', [
      {
        pitch_id: pitchId,
        type: pitch.type,
        title: pitch.title,
        target: pitch.target,
        deadline: pitch.deadline,
        sent_at: new Date().toISOString(),
      },
    ]);
    shippie.feel.texture('milestone');
  }

  function deletePitch(pitchId: string) {
    setState((prev) => removePitch(prev, pitchId));
    void localNavigation.replace({ kind: 'home' }, { kind: 'crossfade' });
  }

  function saveIdentity(identity: Identity) {
    setState((prev) => setIdentity(prev, identity));
    shippie.feel.texture('confirm');
  }

  function clearAllData() {
    clearAll();
    setState(load());
    shippie.feel.texture('milestone');
  }

  // Top-level nav target derived from current screen.
  const navTarget: 'home' | 'templates' | 'settings' | null =
    screen.kind === 'home'
      ? 'home'
      : screen.kind === 'templates'
        ? 'templates'
        : screen.kind === 'settings'
          ? 'settings'
          : null;

  return (
    <div className="app">
      <header className="app-header no-print">
        <h1>Pitch Forge</h1>
        <p className="subtitle">draft · review · submit</p>
      </header>

      {navTarget ? (
        <nav className="tabs no-print" role="tablist">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              role="tab"
              aria-selected={navTarget === n.id}
              className={`tab ${navTarget === n.id ? 'active' : ''}`}
              onClick={() => navigate({ kind: n.id })}
            >
              {n.label}
            </button>
          ))}
        </nav>
      ) : null}

      {screen.kind === 'home' ? (
        <HomePage
          pitches={state.pitches}
          onOpen={(id) => navigate({ kind: 'pitch', pitchId: id }, 'rise')}
          onNew={() => navigate({ kind: 'new' }, 'rise')}
        />
      ) : screen.kind === 'new' ? (
        <NewPitchPage
          onCreate={createPitch}
          onCancel={() => closeTo({ kind: 'home' })}
        />
      ) : screen.kind === 'templates' ? (
        <TemplatesPage onBack={() => closeTo({ kind: 'home' })} />
      ) : screen.kind === 'settings' ? (
        <SettingsPage
          identity={state.identity}
          pitches={state.pitches}
          onSaveIdentity={saveIdentity}
          onClearAll={clearAllData}
        />
      ) : screen.kind === 'pitch' && activePitch ? (
        <PitchPage
          pitch={activePitch}
          sections={activeSections}
          brief={activeBriefBody}
          onUpdatePitch={(p) => patchPitch(activePitch.id, p)}
          onUpdateSection={patchSection}
          onAddSection={(title, kind) => addSection(activePitch.id, title, kind)}
          onRemoveSection={deleteSection}
          onReorderSections={(ids) => reorderSecs(activePitch.id, ids)}
          onSaveBrief={(body) => saveBrief(activePitch.id, body)}
          onSnapshot={(label) => snapshotVersion(activePitch.id, label)}
          onPrint={() => navigate({ kind: 'print', pitchId: activePitch.id }, 'rise')}
          onVersions={() =>
            navigate({
              kind: 'compare',
              pitchId: activePitch.id,
              before: null,
              after: null,
            }, 'rise')
          }
          onSent={() => markSent(activePitch.id)}
          onBack={() => {
            // Optional cleanup hook for empty pitches in the future.
            void deletePitch;
            closeTo({ kind: 'home' });
          }}
        />
      ) : screen.kind === 'compare' && activePitch ? (
        <ComparePage
          versions={versionsFor(state, activePitch.id)}
          initialBeforeId={screen.before}
          initialAfterId={screen.after}
          currentSections={activeSections}
          onRestore={(versionId) => {
            restoreVersion(versionId);
            void localNavigation.replace({ kind: 'pitch', pitchId: activePitch.id }, { kind: 'crossfade' });
          }}
          onBack={() => closeTo({ kind: 'pitch', pitchId: activePitch.id })}
        />
      ) : screen.kind === 'print' && activePitch ? (
        <PrintViewPage
          pitch={activePitch}
          sections={activeSections}
          identity={state.identity}
          onClose={() => closeTo({ kind: 'pitch', pitchId: activePitch.id })}
        />
      ) : (
        <HomePage
          pitches={state.pitches}
          onOpen={(id) => navigate({ kind: 'pitch', pitchId: id }, 'rise')}
          onNew={() => navigate({ kind: 'new' }, 'rise')}
        />
      )}

    </div>
  );
}
