import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { prepareGuide } from './guide.ts';
import { PRESENCE_LEVELS, nextPresenceLevel, presenceLabel } from './presence.ts';
import {
  SUBSTANCE_LABELS,
  afterglowStart,
  displayFor,
  formatClock,
  patternInsight,
  phaseAtElapsed,
  safetyWarnings,
  timelineFor,
  type Phase,
} from './phase.ts';
import { getPreparationGuidance } from './readiness.ts';
import { loadState, newId, saveState } from './store.ts';
import {
  APP_NAME,
  type ChecklistKey,
  type CompanionState,
  type FeltState,
  type Mode,
  type PrepState,
  type SafetyFlag,
  type SafetyGateState,
  type Substance,
  type TripSession,
} from './types.ts';
import { createTripSession, replaceActiveSession, shellPresenceLevel } from './session.ts';

const shippie = createShippieIframeSdk({ appId: 'app_companion' });

const CHECKLIST: Array<{ id: ChecklistKey; title: string; detail: string }> = [
  { id: 'space', title: 'Safe place', detail: 'Somewhere familiar where you can stay.' },
  { id: 'water', title: 'Water nearby', detail: 'A bottle or glass within reach.' },
  { id: 'music', title: 'Music ready', detail: 'One settled option, queued now.' },
  { id: 'dnd', title: 'Phone quiet', detail: 'Only your trusted person can break through.' },
  { id: 'charged', title: 'Battery sorted', detail: 'Charged or plugged in.' },
];

const SAFETY: Array<{ id: SafetyFlag; title: string; detail: string }> = [
  { id: 'ssri-snri', title: 'SSRI or SNRI', detail: 'Can change or blunt effects.' },
  { id: 'maoi', title: 'MAOI', detail: 'Interactions can be unpredictable.' },
  { id: 'lithium', title: 'Lithium', detail: 'Linked with severe reactions in reports.' },
  { id: 'tramadol', title: 'Tramadol', detail: 'Serotonergic and seizure-risk concerns.' },
  { id: 'heart', title: 'Heart condition', detail: 'Chest pain or blood pressure concerns.' },
  { id: 'psychosis', title: 'Psychosis history', detail: 'Personal or family history needs caution.' },
  { id: 'mixed', title: 'Mixed substances', detail: 'Combinations raise uncertainty.' },
];

const FELT_OPTIONS: Array<{ id: FeltState; label: string; detail: string }> = [
  { id: 'gentle', label: 'Gentle', detail: 'soft' },
  { id: 'intense', label: 'Intense', detail: 'big' },
  { id: 'hard', label: 'Hard', detail: 'too much' },
];

const FALLBACK_ANCHOR =
  'You are here. You do not need to solve anything. Breathe out slowly, sip water if you can, and let time pass.';

export function App() {
  const [state, setState] = useState<CompanionState>(() => loadState());
  const [mode, setMode] = useState<Mode>('prepare');
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const activeSession = state.sessions.find((session) => session.status === 'active') ?? null;
  const latestSession = state.sessions[0] ?? null;
  const completedSessions = state.sessions.filter((session) => session.status === 'completed');
  const timeline = useMemo(() => timelineFor(state.prep), [state.prep]);
  const preparationGuidance = getPreparationGuidance(state.prep);
  const safetyGateComplete =
    state.safetyGate.ageConfirmed &&
    state.safetyGate.harmReductionAccepted &&
    state.safetyGate.emergencyAccepted &&
    typeof state.safetyGate.completedAt === 'number';

  useEffect(() => saveState(state), [state]);

  useEffect(() => {
    if (!safetyGateComplete || !activeSession) return;
    setMode('during');
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSession?.id]);

  function patchPrep(patch: Partial<PrepState>) {
    setState((previous) => ({ ...previous, prep: { ...previous.prep, ...patch } }));
  }

  function patchContact(patch: Partial<PrepState['contact']>) {
    setState((previous) => ({
      ...previous,
      prep: {
        ...previous.prep,
        contact: { ...previous.prep.contact, ...patch },
      },
    }));
  }

  function patchSafetyGate(patch: Partial<SafetyGateState>) {
    setState((previous) => ({
      ...previous,
      safetyGate: { ...previous.safetyGate, ...patch },
    }));
  }

  function toggleChecklist(id: ChecklistKey) {
    setState((previous) => ({
      ...previous,
      prep: {
        ...previous.prep,
        checklist: { ...previous.prep.checklist, [id]: !previous.prep.checklist[id] },
      },
    }));
    shippie.feel.texture('toggle');
  }

  function toggleSafety(flag: SafetyFlag) {
    setState((previous) => {
      const flags = new Set(previous.prep.safetyFlags);
      if (flags.has(flag)) flags.delete(flag);
      else flags.add(flag);
      return {
        ...previous,
        prep: { ...previous.prep, safetyFlags: Array.from(flags), safetyAcknowledged: false },
      };
    });
    shippie.feel.texture('toggle');
  }

  function startSession() {
    setState((previous) => ({
      ...previous,
      sessions: replaceActiveSession(previous.sessions, createTripSession(previous.prep, newId('trip'))),
    }));
    setMode('during');
    setSheet(null);
    shippie.feel.texture('confirm');
  }

  function updateSession(id: string, update: (session: TripSession) => TripSession) {
    setState((previous) => ({
      ...previous,
      sessions: previous.sessions.map((session) => (session.id === id ? update(session) : session)),
    }));
  }

  function logMood(felt: FeltState) {
    if (!activeSession) return;
    const activeTimeline = timelineFor(activeSession.prep);
    const elapsedMs = Date.now() - activeSession.startedAt;
    const phase = phaseAtElapsed(activeTimeline, elapsedMs);
    const entry = {
      id: newId('mood'),
      felt,
      phaseId: phase.id,
      elapsedMin: Math.max(0, Math.floor(elapsedMs / 60000)),
      createdAt: Date.now(),
    };
    updateSession(activeSession.id, (session) => ({
      ...session,
      moodLog: [...session.moodLog, entry],
    }));
    if (felt === 'hard') window.setTimeout(() => setSheet('anchor'), 700);
    shippie.feel.texture(felt === 'hard' ? 'toggle' : 'confirm');
  }

  function patchSessionNotes(patch: Partial<Pick<TripSession, 'journal' | 'carryForward'>>) {
    const target = activeSession ?? latestSession;
    if (!target) return;
    updateSession(target.id, (session) => ({ ...session, ...patch }));
  }

  function completeActive() {
    if (!activeSession) return;
    updateSession(activeSession.id, (session) => ({
      ...session,
      status: 'completed',
      closedAt: Date.now(),
    }));
    setSheet(null);
    setMode('integrate');
    shippie.feel.texture('milestone');
  }

  function cycleActivePresenceLevel() {
    setState((previous) => {
      const activeId = previous.sessions.find((session) => session.status === 'active')?.id;
      if (!activeId) return previous;
      return {
        ...previous,
        sessions: previous.sessions.map((session) =>
          session.id === activeId
            ? {
                ...session,
                prep: {
                  ...session.prep,
                  presenceLevel: nextPresenceLevel(session.prep.presenceLevel),
                },
              }
            : session,
        ),
      };
    });
    shippie.feel.texture('toggle');
  }

  const shellPresence = shellPresenceLevel({
    mode,
    prep: state.prep,
    activeSession,
    latestSession,
  });
  const shellClass = `app-shell mode-${mode} presence-${shellPresence}`;

  return (
    <div
      className={shellClass}
      {...(activeSession && mode === 'during' ? { 'data-shippie-wakelock': true } : {})}
    >
      {!safetyGateComplete ? (
        <SafetyGateView
          gate={state.safetyGate}
          patchSafetyGate={patchSafetyGate}
          accept={() => patchSafetyGate({ completedAt: Date.now() })}
        />
      ) : (
        <>
          {mode !== 'during' ? (
            <ShellHeader mode={mode} setMode={setMode} activeSession={activeSession} latestSession={latestSession} />
          ) : null}

          {mode === 'prepare' ? (
            <PrepareView
              prep={state.prep}
              timeline={timeline}
              preparationGuidance={preparationGuidance}
              patchPrep={patchPrep}
              patchContact={patchContact}
              toggleChecklist={toggleChecklist}
              toggleSafety={toggleSafety}
              startSession={startSession}
            />
          ) : null}

          {mode === 'during' ? (
            activeSession ? (
              <DuringView
                session={activeSession}
                now={now}
                sheet={sheet}
                setSheet={setSheet}
                logMood={logMood}
                cyclePresenceLevel={cycleActivePresenceLevel}
                completeActive={completeActive}
                goIntegrate={() => setMode('integrate')}
              />
            ) : (
              <EmptyMode title="No active session" action="Prepare first" onAction={() => setMode('prepare')} />
            )
          ) : null}

          {mode === 'integrate' ? (
            <IntegrateView
              session={activeSession ?? latestSession}
              active={Boolean(activeSession)}
              patchSessionNotes={patchSessionNotes}
              completeActive={completeActive}
              goHistory={() => setMode('history')}
            />
          ) : null}

          {mode === 'history' ? (
            <HistoryView sessions={completedSessions} startNew={() => setMode('prepare')} />
          ) : null}
        </>
      )}
    </div>
  );
}

function ShellHeader({
  mode,
  setMode,
  activeSession,
  latestSession,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  activeSession: TripSession | null;
  latestSession: TripSession | null;
}) {
  const tabs: Array<{ id: Mode; label: string; disabled?: boolean }> = [
    { id: 'prepare', label: 'Prepare' },
    { id: 'during', label: 'Now', disabled: !activeSession },
    { id: 'integrate', label: 'Back', disabled: !activeSession && !latestSession },
    { id: 'history', label: 'Past' },
  ];
  return (
    <header className="shell-header">
      <p className="wordmark">{APP_NAME}</p>
      <nav className="mode-tabs" aria-label="Companion screens">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={mode === tab.id ? 'page' : undefined}
            disabled={tab.disabled}
            onClick={() => setMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function SafetyGateView({
  gate,
  patchSafetyGate,
  accept,
}: {
  gate: SafetyGateState;
  patchSafetyGate: (patch: Partial<SafetyGateState>) => void;
  accept: () => void;
}) {
  const ready = gate.ageConfirmed && gate.harmReductionAccepted && gate.emergencyAccepted;

  return (
    <main className="gate-screen">
      <section className="gate-panel" aria-labelledby="gate-title">
        <div className="mini-orb" aria-hidden />
        <p className="eyebrow">Before you start</p>
        <h1 id="gate-title">{APP_NAME}</h1>
        <p className="gate-copy">Private grounding support. Not medical care, and not encouragement to use anything.</p>
        <div className="gate-checks">
          <AckRow
            name="age-confirmed"
            checked={gate.ageConfirmed}
            onChange={(checked) => patchSafetyGate({ ageConfirmed: checked })}
          >
            I am of legal age where I am.
          </AckRow>
          <AckRow
            name="harm-reduction-accepted"
            checked={gate.harmReductionAccepted}
            onChange={(checked) => patchSafetyGate({ harmReductionAccepted: checked })}
          >
            I know this is support, not medical advice or a safety guarantee.
          </AckRow>
          <AckRow
            name="emergency-accepted"
            checked={gate.emergencyAccepted}
            onChange={(checked) => patchSafetyGate({ emergencyAccepted: checked })}
          >
            If danger signs appear, I will contact real-world help.
          </AckRow>
        </div>
        <button type="button" className="primary-action wide" disabled={!ready} onClick={accept}>
          Enter
        </button>
      </section>
    </main>
  );
}

function PrepareView({
  prep,
  timeline,
  preparationGuidance,
  patchPrep,
  patchContact,
  toggleChecklist,
  toggleSafety,
  startSession,
}: {
  prep: PrepState;
  timeline: Phase[];
  preparationGuidance: string[];
  patchPrep: (patch: Partial<PrepState>) => void;
  patchContact: (patch: Partial<PrepState['contact']>) => void;
  toggleChecklist: (id: ChecklistKey) => void;
  toggleSafety: (flag: SafetyFlag) => void;
  startSession: () => void;
}) {
  const warnings = safetyWarnings(prep.safetyFlags);
  const guide = prepareGuide(prep, warnings);
  const completeCount = CHECKLIST.filter((item) => prep.checklist[item.id]).length;
  const hasGuidance = preparationGuidance.length > 0;

  return (
    <main className="workspace prepare-workspace">
      <section className="prepare-hero">
        <p className="eyebrow">Prepare</p>
        <h1>Set up gently.</h1>
        <p>Pick a mode. Everything else is optional.</p>
      </section>

      <section className="section-block presence-block">
        <div className="section-heading">
          <p className="eyebrow">Presence</p>
          <span>{presenceLabel(prep.presenceLevel)}</span>
        </div>
        <div className="presence-options" role="radiogroup" aria-label="Companion presence level">
          {PRESENCE_LEVELS.map((item) => (
            <label
              key={item.id}
              className={prep.presenceLevel === item.id ? 'selected' : ''}
            >
              <input
                className="sr-only"
                type="radio"
                name="presence-level"
                value={item.id}
                checked={prep.presenceLevel === item.id}
                onChange={() => patchPrep({ presenceLevel: item.id })}
              />
              <span className={`presence-swatch ${item.id}`} aria-hidden />
              <strong>{item.label}</strong>
              <small>{item.short}</small>
            </label>
          ))}
        </div>
        <p className="soft-note">{PRESENCE_LEVELS.find((item) => item.id === prep.presenceLevel)?.description}</p>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Room</p>
          <span>{completeCount}/5</span>
        </div>
        <div className="check-grid">
          {CHECKLIST.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`check-row ${prep.checklist[item.id] ? 'selected' : ''}`}
              onClick={() => toggleChecklist(item.id)}
            >
              <span className="check-dot" aria-hidden />
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="section-block anchor-block">
        <div className="section-heading">
          <p className="eyebrow">Anchor</p>
          <span>optional note</span>
        </div>
        <p className="prompt">A short note can help later. You can leave it blank.</p>
        <label className="field">
          <span className="sr-only">Anchor message</span>
          <textarea
            name="anchor-message"
            value={prep.anchor}
            rows={5}
            maxLength={520}
              placeholder="If it gets big: lie down, breathe out slowly, sip water, call your person if you need to."
            onChange={(event) => patchPrep({ anchor: event.currentTarget.value })}
          />
        </label>
        <button type="button" className="secondary-action compact-action" onClick={() => patchPrep({ anchor: guide.anchorDraft })}>
          Use a calm draft
        </button>
      </section>

      <section className="section-block help-setup">
        <div className="section-heading">
          <p className="eyebrow">Help</p>
          <span>optional contacts</span>
        </div>
        <div className="contact-grid">
          <label className="field">
            <span>Trusted person</span>
            <input
              name="trusted-person"
              value={prep.contact.name}
              placeholder="Name"
              onChange={(event) => patchContact({ name: event.currentTarget.value })}
            />
          </label>
          <label className="field">
            <span>Their number</span>
            <input
              name="trusted-person-phone"
              value={prep.contact.phone}
              placeholder="Tap-to-call number"
              inputMode="tel"
              onChange={(event) => patchContact({ phone: event.currentTarget.value })}
            />
          </label>
          <label className="field">
            <span>Emergency number</span>
            <input
              name="emergency-number"
              value={prep.contact.emergencyNumber}
              placeholder="999 / 112 / 911"
              inputMode="tel"
              onChange={(event) => patchContact({ emergencyNumber: event.currentTarget.value })}
            />
          </label>
        </div>
      </section>

      <details className="more-setup">
        <summary>More setup</summary>
        <section className="section-block split">
          <label className="field">
            <span>Intention</span>
            <textarea
              name="intention"
              value={prep.intention}
              rows={3}
              maxLength={360}
              placeholder="Optional. What do you want to remember?"
              onChange={(event) => patchPrep({ intention: event.currentTarget.value })}
            />
          </label>
        </section>
        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Timeline</p>
            <span>logging only</span>
          </div>
          <div className="segmented" role="group" aria-label="Substance">
            {(Object.keys(SUBSTANCE_LABELS) as Substance[]).map((substance) => (
              <button
                key={substance}
                type="button"
                aria-pressed={prep.substance === substance}
                onClick={() => patchPrep({ substance })}
              >
                {SUBSTANCE_LABELS[substance]}
              </button>
            ))}
          </div>
          <label className="field amount-field">
            <span>Amount or note</span>
            <input
              name="amount-note"
              value={prep.amount}
              maxLength={24}
              placeholder="Optional note"
              onChange={(event) => patchPrep({ amount: event.currentTarget.value })}
            />
          </label>
          <PhaseTimeline phases={timeline} />
        </section>
        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Cautions</p>
            <span>optional</span>
          </div>
          <div className="safety-grid">
            {SAFETY.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`safety-chip ${prep.safetyFlags.includes(item.id) ? 'selected' : ''}`}
                onClick={() => toggleSafety(item.id)}
              >
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
          {warnings.length > 0 ? (
            <div className="warning-panel" role="status">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <AckRow
                name="safety-cautions-acknowledged"
                checked={prep.safetyAcknowledged}
                onChange={(checked) => patchPrep({ safetyAcknowledged: checked })}
              >
                I understand these cautions mean I should involve real-world support.
              </AckRow>
            </div>
          ) : (
            <p className="quiet-note">No selected cautions. This is not proof of safety or medical clearance.</p>
          )}
        </section>
      </details>

      <section className="start-panel ready optional-start">
        <div>
          <p className="eyebrow">Begin anytime</p>
          {hasGuidance ? (
            <>
              <p>Begin in {presenceLabel(prep.presenceLevel)}. Setup can stay empty.</p>
              <ul>
                {preparationGuidance.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Begin in {presenceLabel(prep.presenceLevel)}. Saved only here.</p>
          )}
        </div>
        <button type="button" className="primary-action" onClick={startSession}>
          Begin now
        </button>
      </section>
    </main>
  );
}

function DuringView({
  session,
  now,
  sheet,
  setSheet,
  logMood,
  cyclePresenceLevel,
  completeActive,
  goIntegrate,
}: {
  session: TripSession;
  now: number;
  sheet: SheetName | null;
  setSheet: (sheet: SheetName | null) => void;
  logMood: (felt: FeltState) => void;
  cyclePresenceLevel: () => void;
  completeActive: () => void;
  goIntegrate: () => void;
}) {
  const phases = timelineFor(session.prep);
  const elapsedMs = now - session.startedAt;
  const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000));
  const phase = phaseAtElapsed(phases, elapsedMs);
  const lastMood = session.moodLog[session.moodLog.length - 1] ?? null;
  const display = displayFor(lastMood?.felt ?? null, phase);
  const afterglow = afterglowStart(phases);
  const showAfterglowCheck = elapsedMin >= afterglow && !session.moodLog.some((entry) => entry.elapsedMin >= afterglow);
  const orbStyle = { '--orb-core': display.core, '--orb-glow': display.glow } as CSSProperties;
  const presence = session.prep.presenceLevel;
  const isMinimal = presence === 'minimal';

  return (
    <main className={`during-screen during-${presence} state-${lastMood?.felt ?? 'phase'}`} style={orbStyle}>
      {presence === 'vivid' ? <div className="vivid-field" aria-hidden /> : null}
      {!isMinimal ? <div className="grain" aria-hidden /> : null}

      <div className="during-top">
        {!isMinimal ? <span>{phase.name}</span> : <span aria-hidden />}
        <button
          type="button"
          className="presence-cycle"
          aria-label={`Switch from ${presenceLabel(presence)} mode`}
          onClick={cyclePresenceLevel}
        >
          {presenceLabel(presence)}
        </button>
      </div>

      <section className="presence-stage" aria-live="polite">
        {isMinimal ? null : (
          <span className={presence === 'vivid' ? 'orb vivid-orb' : 'orb'} aria-hidden />
        )}
        <h1>{display.line}</h1>
        {!isMinimal ? (
          <>
            <p>{display.normal}</p>
            <small>{formatClock(elapsedMin)} since start</small>
          </>
        ) : null}
      </section>

      {showAfterglowCheck && !isMinimal ? (
        <section className="afterglow-check">
          <span>You doing okay?</span>
          <div>
            <button type="button" onClick={() => logMood('gentle')}>Okay</button>
            <button type="button" onClick={() => setSheet('anchor')}>Anchor</button>
          </div>
        </section>
      ) : null}

      <section className={`felt-tap ${isMinimal ? 'minimal-felt' : ''}`} aria-label="How it feels right now">
        {!isMinimal ? <p>How is it right now?</p> : null}
        <div>
          {FELT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={lastMood?.felt === option.id ? 'selected' : ''}
              onClick={() => logMood(option.id)}
            >
              <strong>{option.label}</strong>
              {!isMinimal ? <small>{option.detail}</small> : null}
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="finish-action" onClick={goIntegrate}>
        Finish
      </button>

      <nav className={`thumb-rail ${isMinimal ? 'minimal-tools' : ''}`} aria-label="Grounding tools">
        <button type="button" onClick={() => setSheet('ground')}>Ground</button>
        <button type="button" onClick={() => setSheet('breathe')}>Breathe</button>
        <button type="button" onClick={() => setSheet('anchor')}>Anchor</button>
        <button type="button" onClick={() => setSheet('help')}>Help</button>
      </nav>

      <BottomSheet open={sheet === 'ground'} title="Come back to the room" onClose={() => setSheet(null)}>
        <Grounding />
      </BottomSheet>
      <BottomSheet open={sheet === 'breathe'} title="Breathe with me" onClose={() => setSheet(null)}>
        <BreathingPacer />
      </BottomSheet>
      <BottomSheet open={sheet === 'anchor'} title="From you, to you" onClose={() => setSheet(null)}>
        <p className="sheet-sub">
          {session.prep.anchor.trim() ? 'Your note.' : 'A steady fallback for right now.'}
        </p>
        <blockquote className="anchor-quote">{session.prep.anchor.trim() || FALLBACK_ANCHOR}</blockquote>
      </BottomSheet>
      <BottomSheet open={sheet === 'help'} title="Help" onClose={() => setSheet(null)} tall>
        <HelpPanel session={session} />
        <button type="button" className="secondary-action" onClick={completeActive}>End session and come back</button>
      </BottomSheet>
    </main>
  );
}

function IntegrateView({
  session,
  active,
  patchSessionNotes,
  completeActive,
  goHistory,
}: {
  session: TripSession | null;
  active: boolean;
  patchSessionNotes: (patch: Partial<Pick<TripSession, 'journal' | 'carryForward'>>) => void;
  completeActive: () => void;
  goHistory: () => void;
}) {
  if (!session) return <EmptyMode title="Nothing to integrate yet" action="Prepare" onAction={goHistory} />;

  return (
    <main className="workspace integrate-workspace">
      <section className="prepare-hero integrate-hero">
        <p className="eyebrow">{active ? 'When ready' : 'Integration'}</p>
        <h1>Come back slowly.</h1>
        <p>A few words are enough. You can also leave this blank.</p>
      </section>

      <section className="section-block quiet-recap">
        <p className="eyebrow">You set out with</p>
        <blockquote>{session.prep.intention || 'No note saved.'}</blockquote>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Mood trail</p>
          <span>{session.moodLog.length} check-ins</span>
        </div>
        <MoodBar entries={session.moodLog} />
      </section>

      <section className="section-block split">
        <label className="field">
          <span>What came up?</span>
          <textarea
            name="journal"
            rows={7}
            value={session.journal}
            placeholder="Fragments, images, emotions, phrases. It does not need to be neat."
            onChange={(event) => patchSessionNotes({ journal: event.currentTarget.value })}
          />
        </label>
        <label className="field">
          <span>One small thing</span>
          <textarea
            name="carry-forward"
            rows={4}
            value={session.carryForward}
            placeholder="A message, a walk, a meal, sleep, or nothing yet."
            onChange={(event) => patchSessionNotes({ carryForward: event.currentTarget.value })}
          />
        </label>
      </section>

      <section className="start-panel ready">
        <div>
          <p className="eyebrow">Private journal</p>
          <p>Stored only on this device.</p>
        </div>
        {active ? (
          <button type="button" className="primary-action" onClick={completeActive}>Close and save</button>
        ) : (
          <button type="button" className="primary-action" onClick={goHistory}>Past sessions</button>
        )}
      </section>
    </main>
  );
}

function HistoryView({ sessions, startNew }: { sessions: TripSession[]; startNew: () => void }) {
  const insight = patternInsight(sessions.map((session) => session.prep.intention));
  const hasSessions = sessions.length > 0;

  return (
    <main className="workspace history-workspace">
      <section className="prepare-hero">
        {hasSessions ? <p className="eyebrow">Past</p> : null}
        <h1>{hasSessions ? (sessions.length === 1 ? 'One session saved.' : `${sessions.length} sessions saved.`) : 'No sessions yet.'}</h1>
        <p>{hasSessions ? 'Private notes stay on this device.' : 'When you close a session, your notes will appear here.'}</p>
      </section>

      {insight && hasSessions ? <section className="insight-panel">{insight}</section> : null}

      {hasSessions ? (
        <section className="journey-list">
          {sessions.map((session) => (
            <article key={session.id} className="journey-row">
              <div>
                <h3>{session.prep.intention || `${presenceLabel(session.prep.presenceLevel)} session`}</h3>
                <small>{new Date(session.startedAt).toLocaleDateString()}</small>
              </div>
              <MoodBar entries={session.moodLog} />
              <p>{session.carryForward || session.journal || 'No reflection saved yet.'}</p>
            </article>
          ))}
        </section>
      ) : null}

      <button type="button" className="primary-action wide" onClick={startNew}>
        {hasSessions ? 'Prepare another session' : 'Prepare a session'}
      </button>
    </main>
  );
}

type SheetName = 'ground' | 'breathe' | 'anchor' | 'help';

function AckRow({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="ack-row">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function BottomSheet({
  open,
  title,
  tall,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  tall?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="sheet-shell open">
      <button type="button" className="sheet-scrim" onClick={onClose}>Close</button>
      <section className={`bottom-sheet ${tall ? 'tall' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" aria-hidden />
        <header>
          <h2>{title}</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Grounding() {
  const rows = [
    ['5', 'Things you can see', 'Name them slowly.'],
    ['4', 'Things you can feel', 'Floor, blanket, clothes, hands.'],
    ['3', 'Sounds you can hear', 'Let them be ordinary.'],
    ['2', 'Things you can smell', 'No need to search hard.'],
    ['1', 'Slow breath out', 'You are here. This will change.'],
  ] as const;
  return (
    <div className="ground-list">
      <p>Do one line at a time. No hurry.</p>
      {rows.map(([count, label, detail]) => (
        <div key={count}>
          <strong>{count}</strong>
          <span>
            {label}
            <small>{detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function BreathingPacer() {
  return (
    <div className="breathe-panel">
      <div className="pacer" aria-hidden />
      <p>In as it grows. Out as it softens. Longer out than in.</p>
    </div>
  );
}

function HelpPanel({ session }: { session: TripSession }) {
  const contactHref = toTelHref(session.prep.contact.phone);
  const emergencyHref = toTelHref(session.prep.contact.emergencyNumber);
  const trustedPerson = session.prep.contact.name.trim() || 'your person';
  const calmStep = contactHref
    ? `Lower the lights, change the music, lie down, sip water, open Anchor, or call ${trustedPerson}.`
    : 'Lower the lights, change the music, lie down, sip water, open Anchor, or call someone you trust from your phone.';

  return (
    <div className="help-panel">
      <p>
        First, breathe out slowly. Strong fear, crying, strange thoughts, and time feeling distorted can happen without
        being an emergency.
      </p>
      <div className="help-kind calm">
        <strong>Try this first</strong>
        <span>{calmStep}</span>
      </div>
      <div className="help-kind danger">
        <strong>Get help now for</strong>
        <span>Chest pain, trouble breathing, seizure, fainting, dangerous mixing, or any urge to harm yourself or someone else.</span>
      </div>
      <div className="help-actions">
        {contactHref ? <a href={contactHref}>Call {trustedPerson}</a> : <span>Call someone you trust from your phone if you can.</span>}
        {emergencyHref ? <a className="danger-link" href={emergencyHref}>Call emergency help</a> : <span>Use local emergency services if danger signs appear.</span>}
      </div>
    </div>
  );
}

function PhaseTimeline({ phases }: { phases: readonly Phase[] }) {
  return (
    <div className="phase-timeline">
      {phases.map((phase) => (
        <div key={phase.id} style={{ '--phase': phase.core } as CSSProperties}>
          <span aria-hidden />
          <strong>{phase.name}</strong>
          <small>{formatClock(phase.startMin)}</small>
        </div>
      ))}
    </div>
  );
}

function MoodBar({ entries }: { entries: readonly { felt: FeltState; elapsedMin: number }[] }) {
  if (entries.length === 0) return <p className="quiet-note">No check-ins logged.</p>;
  return (
    <div className="mood-bar" aria-label={`${entries.length} mood check-ins`}>
      {entries.map((entry, index) => (
        <span key={`${entry.felt}-${entry.elapsedMin}-${index}`} className={entry.felt} title={`${entry.felt} at ${formatClock(entry.elapsedMin)}`} />
      ))}
    </div>
  );
}

function EmptyMode({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <main className="workspace">
      <section className="empty-mode">
        <div className="mini-orb" aria-hidden />
        <h1>{title}</h1>
        <button type="button" className="primary-action" onClick={onAction}>{action}</button>
      </section>
    </main>
  );
}

function toTelHref(value: string): string | null {
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned.length >= 2 ? `tel:${cleaned}` : null;
}
