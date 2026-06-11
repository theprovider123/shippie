// palate. — shared type definitions

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';
export type TimerColour = 'green' | 'amber' | 'red';
export type FermentType = 'bulk' | 'proof' | 'levain' | 'kimchi' | 'miso' | 'kombucha';
export type FermentStatus = 'active' | 'done' | 'discarded';
export type ProbeUnit = 'C' | 'F';

export interface Timer {
  id: string;
  label: string;
  context?: string; // 'oven' | 'eggs' | etc.
  duration_s: number;
  started_at?: number; // epoch ms when started/resumed
  paused_at?: number;  // epoch ms when paused (for elapsed calc)
  elapsed_before_pause_s?: number; // accumulated elapsed before last pause
  status: TimerStatus;
  colour: TimerColour;
  created_at: number;
}

export interface Ferment {
  id: string;
  name: string;
  type: FermentType;
  started_at: number;
  target_duration_s: number;
  dough_temp_c?: number;
  room_temp_c?: number;
  status: FermentStatus;
  notes?: string;
  fed_at?: number;
  folds?: number[]; // epoch ms of each fold
  updated_at: number;
}

export interface FormulaIngredient {
  id: string;
  name: string;
  bakers_pct: number;
  is_prefermented?: boolean;
  hydration_pct?: number; // for preferments — their own hydration
  sort_order: number;
}

export interface Formula {
  id: string;
  name: string;
  version: number;
  total_dough_g: number;
  notes?: string;
  ingredients: FormulaIngredient[];
  created_at: number;
  updated_at: number;
}

export interface Bake {
  id: string;
  formula_id?: string;
  baked_at: number;
  crumb_score?: number; // avg × 2 (0–10)
  rise?: number;       // 1–5
  crumb?: number;      // 1–5
  crust?: number;      // 1–5
  flavour?: number;    // 1–5
  ease?: number;       // 1–5
  what_changed?: string;
  notes?: string;
  // photo stored in separate key shippie.palate.bake-photo.<id>
}

export interface KitchenNote {
  id: string;
  content: string;
  created_at: number;
}

export interface PalateState {
  version: 1;
  timers: Timer[];
  ferments: Ferment[];
  formulas: Formula[];
  bakes: Bake[];
  notes: KitchenNote[];
  probe: {
    cut: string;
    unit: ProbeUnit;
    current_c: number;
  };
  glance: {
    stepIndex: number;
    workflowId: string;
  };
  dial: {
    minutes: number;
    status: 'idle' | 'running' | 'done';
    started_at?: number;
    duration_s?: number;
  };
  tonightsNote: string;
}
