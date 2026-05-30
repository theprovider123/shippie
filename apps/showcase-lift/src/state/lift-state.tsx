/**
 * Top-level state context. Loads the local DB, seeds first-run data,
 * exposes the current workout, and emits intents to the platform host
 * via the iframe SDK (Phase 4 wires this fully — Phase 1 just stubs).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createLocalNavigation, migrateLocalDbTablesToDocument } from '@shippie/sdk/wrapper';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { resolveLocalDb } from '../db/runtime.ts';
import {
  ensureSchema,
  getOpenWorkout,
  listExercises,
  listLineages,
  listPlateInventories,
  listPrograms,
  listRecentWorkouts,
  listSetsForWorkout,
  listTemplates,
  listVariants,
  listWorkoutSteps,
} from '../db/queries.ts';
import { seedIfEmpty } from '../data/seed.ts';
import type {
  Exercise,
  Lineage,
  PlateInventory,
  Program,
  SetRow,
  Template,
  Unit,
  Variant,
  Workout,
  WorkoutStep,
} from '../db/schema.ts';
import {
  EXERCISES_TABLE,
  LINEAGES_TABLE,
  PLATE_INVENTORIES_TABLE,
  PRS_TABLE,
  SETS_TABLE,
  STEPS_TABLE,
  TEMPLATES_TABLE,
  TEMPLATE_STEPS_TABLE,
  VARIANTS_TABLE,
  WORKOUTS_TABLE,
  PROGRAMS_TABLE,
  PROGRAM_WEEKS_TABLE,
  PROGRAM_SESSIONS_TABLE,
  exercisesSchema,
  lineagesSchema,
  plateInventoriesSchema,
  prsSchema,
  setsSchema,
  stepsSchema,
  templatesSchema,
  templateStepsSchema,
  variantsSchema,
  workoutsSchema,
  programsSchema,
  programWeeksSchema,
  programSessionsSchema,
} from '../db/schema.ts';

export type ThemeName = 'iron' | 'chalk' | 'clay' | 'signal';
export type Tab =
  | 'today'
  | 'library'
  | 'progression'
  | 'history'
  | 'settings'
  | 'print'
  | 'template-edit';

interface LiftStateValue {
  db: ShippieLocalDb;
  ready: boolean;
  exercises: Exercise[];
  lineages: Lineage[];
  variants: Variant[];
  templates: Template[];
  programs: Program[];
  inventories: PlateInventory[];
  openWorkout: Workout | null;
  openWorkoutSteps: WorkoutStep[];
  openWorkoutSets: SetRow[];
  recentWorkouts: Workout[];
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  defaultUnit: Unit;
  setDefaultUnit: (u: Unit) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedExerciseId: string | null;
  setSelectedExerciseId: (id: string | null) => void;
  /** When non-null, the TemplateEditor opens forking this template id; null = blank. */
  templateForkOf: string | null;
  setTemplateForkOf: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<LiftStateValue | null>(null);

const THEME_KEY = 'shippie:lift:theme';
const UNIT_KEY = 'shippie:lift:default-unit';
const SCHEMA_VERSION = 2;

export function LiftStateProvider({ children }: { children: ReactNode }) {
  const dbRef = useRef<ShippieLocalDb | null>(null);
  const [ready, setReady] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [lineages, setLineages] = useState<Lineage[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [inventories, setInventories] = useState<PlateInventory[]>([]);
  const [openWorkout, setOpenWorkout] = useState<Workout | null>(null);
  const [openWorkoutSteps, setOpenWorkoutSteps] = useState<WorkoutStep[]>([]);
  const [openWorkoutSets, setOpenWorkoutSets] = useState<SetRow[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [theme, setThemeInner] = useState<ThemeName>('iron');
  const [defaultUnit, setDefaultUnitInner] = useState<Unit>('kg');
  const [tab, setTabState] = useState<Tab>('today');
  const localNavigation = useMemo(
    () => createLocalNavigation<Tab>('today', setTabState),
    [],
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [templateForkOf, setTemplateForkOf] = useState<string | null>(null);

  if (!dbRef.current) dbRef.current = resolveLocalDb();
  const db = dbRef.current;

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeInner(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore — private mode
    }
  }, []);

  const setDefaultUnit = useCallback((next: Unit) => {
    setDefaultUnitInner(next);
    try {
      localStorage.setItem(UNIT_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const setTab = useCallback(
    (next: Tab) => {
      void localNavigation.navigate(next, { kind: 'crossfade' });
    },
    [localNavigation],
  );

  const refresh = useCallback(async () => {
    const [
      exs,
      lins,
      vars,
      tpls,
      progs,
      invs,
      open,
      recents,
    ] = await Promise.all([
      listExercises(db),
      listLineages(db),
      listVariants(db),
      listTemplates(db),
      listPrograms(db),
      listPlateInventories(db),
      getOpenWorkout(db),
      listRecentWorkouts(db, 30),
    ]);
    setExercises(exs);
    setLineages(lins);
    setVariants(vars);
    setTemplates(tpls);
    setPrograms(progs);
    setInventories(invs);
    setOpenWorkout(open);
    if (open) {
      const [steps, sets] = await Promise.all([
        listWorkoutSteps(db, open.id),
        listSetsForWorkout(db, open.id),
      ]);
      setOpenWorkoutSteps(steps);
      setOpenWorkoutSets(sets);
    } else {
      setOpenWorkoutSteps([]);
      setOpenWorkoutSets([]);
    }
    setRecentWorkouts(recents);
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSchema(db);
      await seedIfEmpty(db);
      await migrateLocalDbTablesToDocument(db, {
        appSlug: 'lift',
        tables: [
          { name: LINEAGES_TABLE, schema: lineagesSchema },
          { name: VARIANTS_TABLE, schema: variantsSchema },
          { name: EXERCISES_TABLE, schema: exercisesSchema },
          { name: WORKOUTS_TABLE, schema: workoutsSchema },
          { name: STEPS_TABLE, schema: stepsSchema },
          { name: SETS_TABLE, schema: setsSchema },
          { name: TEMPLATES_TABLE, schema: templatesSchema },
          { name: TEMPLATE_STEPS_TABLE, schema: templateStepsSchema },
          { name: PRS_TABLE, schema: prsSchema },
          { name: PLATE_INVENTORIES_TABLE, schema: plateInventoriesSchema },
          { name: PROGRAMS_TABLE, schema: programsSchema },
          { name: PROGRAM_WEEKS_TABLE, schema: programWeeksSchema },
          { name: PROGRAM_SESSIONS_TABLE, schema: programSessionsSchema },
        ],
      });
      if (cancelled) return;
      await refresh();
      try {
        const stored = localStorage.getItem(THEME_KEY) as ThemeName | null;
        if (stored && ['iron', 'chalk', 'clay', 'signal'].includes(stored)) {
          setThemeInner(stored);
        }
        const unit = localStorage.getItem(UNIT_KEY) as Unit | null;
        if (unit === 'kg' || unit === 'lb') {
          setDefaultUnitInner(unit);
        }
      } catch {
        // ignore
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refresh]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.schemaVersion = String(SCHEMA_VERSION);
    }
  }, [theme]);

  const value = useMemo<LiftStateValue>(
    () => ({
      db,
      ready,
      exercises,
      lineages,
      variants,
      templates,
      programs,
      inventories,
      openWorkout,
      openWorkoutSteps,
      openWorkoutSets,
      recentWorkouts,
      theme,
      setTheme,
      defaultUnit,
      setDefaultUnit,
      tab,
      setTab,
      selectedExerciseId,
      setSelectedExerciseId,
      templateForkOf,
      setTemplateForkOf,
      refresh,
    }),
    [
      db,
      ready,
      exercises,
      lineages,
      variants,
      templates,
      programs,
      inventories,
      openWorkout,
      openWorkoutSteps,
      openWorkoutSets,
      recentWorkouts,
      theme,
      setTheme,
      defaultUnit,
      setDefaultUnit,
      tab,
      setTab,
      selectedExerciseId,
      templateForkOf,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLift(): LiftStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLift outside LiftStateProvider');
  return v;
}
