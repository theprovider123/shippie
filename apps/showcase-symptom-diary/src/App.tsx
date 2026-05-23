/**
 * Symptom Diary — top-level shell.
 *
 * Tabs: Today / History / Symptoms / Medications / Print.
 * State lives in two places: React (current view + form state) and the
 * local DB (entries / meds / doses). Cross-app intents (mood-logged,
 * sleep-logged, cooked-meal, body-metrics-logged) bubble up via the
 * iframe SDK and surface as a soft "Log a symptom?" prompt — never
 * pushy, dismissible, no auto-log.
 *
 * Voice rule (VOICE.md): clinical-but-kind. Patterns, not predictions.
 * The app records what the user types. It doesn't interpret.
 */
import { useEffect, useMemo, useState } from 'react';
import { createLocalNavigation, migrateLocalDbTablesToDocument } from '@shippie/sdk/wrapper';
import { Today } from './pages/Today.tsx';
import { History } from './pages/History.tsx';
import { Symptoms } from './pages/Symptoms.tsx';
import { Medications } from './pages/Medications.tsx';
import { PrintView } from './pages/PrintView.tsx';
import { resolveLocalDb } from './db/runtime.ts';
import {
  createEntry,
  createMedication,
  createSymptom,
  deleteMedication,
  deleteSymptom,
  dosesInRange,
  entriesInRange,
  listMedications,
  listSymptoms,
  recordMedDose,
  reorderSymptoms,
  updateMedication,
} from './db/queries.ts';
import { seedIfEmpty } from './db/seed.ts';
import type { Medication, Symptom, SymptomScale } from './db/schema.ts';
import {
  ENTRIES_TABLE,
  MEDICATIONS_TABLE,
  MED_DOSES_TABLE,
  SYMPTOMS_TABLE,
  entriesSchema,
  medDosesSchema,
  medicationsSchema,
  symptomsSchema,
} from './db/schema.ts';
import { createShippieIframeSdk, type IntentBroadcast } from '@shippie/iframe-sdk';

type Tab = 'today' | 'history' | 'symptoms' | 'medications' | 'print';

const shippie = createShippieIframeSdk({ appId: 'app_symptom_diary' });

export function App() {
  const db = useMemo(() => resolveLocalDb(), []);

  const [tab, setTab] = useState<Tab>('today');
  const localNavigation = useMemo(
    () => createLocalNavigation<Tab>('today', setTab),
    [],
  );
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [softPrompt, setSoftPrompt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigate(next: Tab): void {
    void localNavigation.navigate(next, { kind: 'crossfade' });
  }

  function closeTo(fallback: Tab): void {
    void localNavigation.backOrReplace(fallback, { kind: 'crossfade' });
  }

  // First-load: seed default symptoms if empty, then read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedIfEmpty(db);
        await migrateLocalDbTablesToDocument(db, {
          appSlug: 'symptom-diary',
          tables: [
            { name: SYMPTOMS_TABLE, schema: symptomsSchema },
            { name: ENTRIES_TABLE, schema: entriesSchema },
            { name: MEDICATIONS_TABLE, schema: medicationsSchema },
            { name: MED_DOSES_TABLE, schema: medDosesSchema },
          ],
        });
      } catch (err) {
        // Empty DB is the recoverable state; seed failure shouldn't block.
        console.warn('[symptom-diary] seed failed', err);
      }
      if (cancelled) return;
      const [s, m] = await Promise.all([listSymptoms(db), listMedications(db)]);
      if (cancelled) return;
      setSymptoms(s);
      setMedications(m);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Subscribe to upstream intents — mood-logged + sleep-logged surface a
  // soft prompt. Never auto-log; the app records what the user types.
  useEffect(() => {
    const unsubscribers = [
      shippie.intent.subscribe('mood-logged', handleMood),
      shippie.intent.subscribe('sleep-logged', handleSleep),
    ];
    // Ask the container for permission. Outside the container this is a
    // no-op — the SDK swallows postMessage when there's no parent.
    shippie.requestIntent('mood-logged');
    shippie.requestIntent('sleep-logged');
    return () => {
      for (const fn of unsubscribers) fn();
    };
  }, []);

  const handleMood = (broadcast: IntentBroadcast) => {
    // Heuristic: if any row reports a low mood (score <= 3 on a 1-10
    // scale, or text contains "low"/"down"/"tired"), nudge once.
    const isLow = broadcast.rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const r = row as { score?: number; mood?: string; rating?: number };
      const score = typeof r.score === 'number' ? r.score : typeof r.rating === 'number' ? r.rating : null;
      if (score !== null && score <= 3) return true;
      const text = typeof r.mood === 'string' ? r.mood.toLowerCase() : '';
      return /\b(low|down|tired|rough)\b/.test(text);
    });
    if (isLow) {
      setSoftPrompt('Mood was low today. Log a symptom?');
    }
  };

  const handleSleep = (broadcast: IntentBroadcast) => {
    const isShort = broadcast.rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const r = row as { hours?: number; minutes?: number; quality?: number };
      if (typeof r.hours === 'number' && r.hours < 6) return true;
      if (typeof r.quality === 'number' && r.quality <= 2) return true;
      return false;
    });
    if (isShort) {
      setSoftPrompt('Sleep was short. Log a symptom?');
    }
  };

  // ─── Mutations ──────────────────────────────────────────────────

  const refreshSymptoms = async () => setSymptoms(await listSymptoms(db));
  const refreshMedications = async () => setMedications(await listMedications(db));

  const onLogSymptom = async (input: {
    symptom_id: string;
    intensity: number;
    note?: string;
    trigger_text?: string;
  }) => {
    const entry = await createEntry(db, input);
    shippie.intent.broadcast('symptom-logged', [
      {
        id: entry.id,
        symptom_id: entry.symptom_id,
        symptom_name: symptoms.find((s) => s.id === entry.symptom_id)?.name ?? null,
        intensity: entry.intensity,
        occurred_at: entry.occurred_at,
        note: entry.note,
        trigger_text: entry.trigger_text,
      },
    ]);
    shippie.feel.texture('confirm');
  };

  const onLogMedDose = async (medicationId: string) => {
    const dose = await recordMedDose(db, { medication_id: medicationId });
    const med = medications.find((m) => m.id === medicationId);
    shippie.intent.broadcast('med-taken', [
      {
        id: dose.id,
        medication_id: dose.medication_id,
        medication_name: med?.name ?? null,
        taken_at: dose.taken_at,
      },
    ]);
    shippie.feel.texture('confirm');
  };

  const onCreateSymptom = async (input: { name: string; default_scale: SymptomScale }) => {
    await createSymptom(db, input);
    await refreshSymptoms();
  };

  const onDeleteSymptom = async (id: string) => {
    await deleteSymptom(db, id);
    await refreshSymptoms();
  };

  const onReorderSymptoms = async (idsInOrder: string[]) => {
    await reorderSymptoms(db, idsInOrder);
    await refreshSymptoms();
  };

  const onCreateMedication = async (input: { name: string; dose?: string; schedule_text?: string }) => {
    await createMedication(db, input);
    await refreshMedications();
  };

  const onUpdateMedication = async (id: string, patch: Partial<Omit<Medication, 'id' | 'created_at'>>) => {
    await updateMedication(db, id, patch);
    await refreshMedications();
  };

  const onDeleteMedication = async (id: string) => {
    await deleteMedication(db, id);
    await refreshMedications();
  };

  const loadEntries = useMemo(() => {
    return (fromIso: string, toIso: string) => entriesInRange(db, fromIso, toIso);
  }, [db]);

  const loadDoses = useMemo(() => {
    return (fromIso: string, toIso: string) => dosesInRange(db, fromIso, toIso);
  }, [db]);

  const activeMedications = useMemo(
    () => medications.filter((m) => m.active === 1),
    [medications],
  );

  if (!ready) {
    return (
      <div className="app-loading" aria-busy="true">
        <div className="app-loading-skeleton" aria-hidden="true">
          <span className="app-loading-skeleton-bar app-loading-skeleton-bar-title" />
          <span className="app-loading-skeleton-bar app-loading-skeleton-bar-row" />
          <span className="app-loading-skeleton-bar app-loading-skeleton-bar-row" />
        </div>
        <p className="muted">Opening Symptom Diary…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="app-main">
        {tab === 'today' ? (
          <Today
            symptoms={symptoms}
            medications={activeMedications}
            onLogSymptom={onLogSymptom}
            onLogMedDose={onLogMedDose}
            softPrompt={softPrompt}
            onDismissPrompt={() => setSoftPrompt(null)}
            onManageSymptoms={() => navigate('symptoms')}
            onManageMedications={() => navigate('medications')}
          />
        ) : null}

        {tab === 'history' ? (
          <History
            symptoms={symptoms}
            medications={activeMedications}
            loadEntries={loadEntries}
            loadDoses={loadDoses}
            onPrint={() => navigate('print')}
          />
        ) : null}

        {tab === 'symptoms' ? (
          <Symptoms
            symptoms={symptoms}
            onCreate={onCreateSymptom}
            onDelete={onDeleteSymptom}
            onReorder={onReorderSymptoms}
            onClose={() => closeTo('today')}
          />
        ) : null}

        {tab === 'medications' ? (
          <Medications
            medications={medications}
            onCreate={onCreateMedication}
            onUpdate={onUpdateMedication}
            onDelete={onDeleteMedication}
            onClose={() => closeTo('today')}
          />
        ) : null}

        {tab === 'print' ? (
          <PrintView
            symptoms={symptoms}
            medications={medications}
            loadEntries={loadEntries}
            loadDoses={loadDoses}
            onClose={() => closeTo('history')}
          />
        ) : null}
      </main>

      {tab === 'print' ? (
        <p className="privacy-note" role="note">
          Symptom Diary stays on this phone. The PDF you generate is yours to share — or not.
        </p>
      ) : null}

      {tab !== 'print' ? (
        <nav className="app-nav" aria-label="Primary">
          <button
            type="button"
            className={`nav-btn ${tab === 'today' ? 'nav-btn-active' : ''}`}
            onClick={() => navigate('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`nav-btn ${tab === 'history' ? 'nav-btn-active' : ''}`}
            onClick={() => navigate('history')}
          >
            History
          </button>
          <button
            type="button"
            className={`nav-btn ${tab === 'symptoms' ? 'nav-btn-active' : ''}`}
            onClick={() => navigate('symptoms')}
          >
            Symptoms
          </button>
          <button
            type="button"
            className={`nav-btn ${tab === 'medications' ? 'nav-btn-active' : ''}`}
            onClick={() => navigate('medications')}
          >
            Meds
          </button>
        </nav>
      ) : null}
    </div>
  );
}
