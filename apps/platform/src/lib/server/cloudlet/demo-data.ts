/**
 * Demo school data — ported verbatim from the Phase-0 prototype
 * (`docs/uniti-design-reference/uniti-data.js`). `seedDemoSchool()` loads this
 * into a freshly provisioned workspace so a school is demoable without a real
 * MIS sync. It is deliberately a plain data module (no runtime deps) so both
 * the Node-side `WorkspaceStore` test and the DO can consume it.
 *
 * English is modelled as a PARENT subject with three child strands
 * (reading / writing / spag) per the locked design (USER INSTRUCTION 2026-06-07).
 */

export interface DemoSubject {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
}

export interface DemoClass {
  id: string;
  name: string; // "4M"
  yearGroup: string; // "Year 4"
  room: string;
}

export interface DemoPupil {
  id: string;
  name: string;
  initials: string;
  send: number;
  eal: number;
  fsm: number;
}

export interface DemoLesson {
  id: string;
  classId: string;
  subjectId: string;
  topic: string;
  objective: string;
  time: string;
  status: 'in-progress' | 'upcoming' | 'done';
}

export interface DemoAdaptationCard {
  id: string;
  lessonId: string | null;
  subjectId: string;
  objective: string;
  typeLabel: string;
  emoji: string;
  target: string; // forLabel — who it's for
  need: string;
  teacherAction: string; // "try"
  why: string;
  evidence: string;
  confidence: number;
  reviewState: 'planned' | 'done' | 'skipped';
  outcome: 'worked' | 'partly' | 'didnt' | null;
}

export const DEMO_SCHOOL = {
  name: "St Jude's & St Paul's",
  subtitle: 'CE Primary Academy · London NW3',
  initials: 'SJ&P',
  term: 'Summer Term 2026',
  week: 'Week 8',
};

export const DEMO_SUBJECTS: DemoSubject[] = [
  { id: 'maths', name: 'Maths', parentId: null, color: '#2EAD73' },
  // English parent + the three strands (roll up to "English", drill down to strands).
  { id: 'english', name: 'English', parentId: null, color: '#3A8FCC' },
  { id: 'english.reading', name: 'Reading', parentId: 'english', color: '#3A8FCC' },
  { id: 'english.writing', name: 'Writing', parentId: 'english', color: '#2D7DB8' },
  { id: 'english.spag', name: 'SPaG', parentId: 'english', color: '#1F6DA3' },
  { id: 'science', name: 'Science', parentId: null, color: '#8B6BD6' },
  { id: 'history', name: 'History', parentId: null, color: '#E8953A' },
  { id: 'pshe', name: 'PSHE', parentId: null, color: '#D95A57' },
];

export const DEMO_CLASSES: DemoClass[] = [
  { id: 'c-4m', name: '4M', yearGroup: 'Year 4', room: '12' },
  { id: 'c-3h', name: '3H', yearGroup: 'Year 3', room: '8' },
];

const RAW_PUPILS: Array<[string, string, string, ('SEND' | 'EAL' | 'FSM')[]]> = [
  ['p1', 'Aisha J.', 'AJ', ['SEND']],
  ['p2', 'Ben C.', 'BC', []],
  ['p3', 'Chloe P.', 'CP', []],
  ['p4', 'Darius M.', 'DM', ['EAL']],
  ['p5', 'Ella T.', 'ET', []],
  ['p6', 'Felix N.', 'FN', []],
  ['p7', 'Grace W.', 'GW', []],
  ['p8', 'Harry S.', 'HS', []],
  ['p9', 'Isla B.', 'IB', ['SEND']],
  ['p10', 'Jax R.', 'JR', []],
  ['p11', 'Kira L.', 'KL', []],
  ['p12', 'Leo D.', 'LD', ['FSM']],
  ['p13', 'Maya K.', 'MK', []],
  ['p14', 'Noah F.', 'NF', []],
  ['p15', 'Olive H.', 'OH', []],
  ['p16', 'Phoebe A.', 'PA', []],
  ['p17', 'Quinn O.', 'QO', ['FSM']],
  ['p18', 'Ravi S.', 'RS', ['EAL']],
  ['p19', 'Sophie K.', 'SK', []],
  ['p20', 'Theo W.', 'TW', []],
  ['p21', 'Uma C.', 'UC', []],
  ['p22', 'Viktor B.', 'VB', ['EAL']],
  ['p23', 'Willow E.', 'WE', []],
  ['p24', 'Xander P.', 'XP', []],
  ['p25', 'Yasmin I.', 'YI', ['SEND']],
  ['p26', 'Zara M.', 'ZM', []],
  ['p27', 'Alfie T.', 'AT', []],
  ['p28', 'Beatrice L.', 'BL', []],
];

export const DEMO_PUPILS: DemoPupil[] = RAW_PUPILS.map(([id, name, initials, groups]) => ({
  id,
  name,
  initials,
  send: groups.includes('SEND') ? 1 : 0,
  eal: groups.includes('EAL') ? 1 : 0,
  fsm: groups.includes('FSM') ? 1 : 0,
}));

export const DEMO_LESSONS: DemoLesson[] = [
  {
    id: 'l1',
    classId: 'c-4m',
    subjectId: 'maths',
    topic: 'Fractions – Equivalent Fractions',
    objective: 'Recognise and show equivalent fractions using diagrams',
    time: '9:00 – 9:45am',
    status: 'in-progress',
  },
  {
    id: 'l2',
    classId: 'c-4m',
    subjectId: 'english.writing',
    topic: 'Persuasive Writing – Climate Change',
    objective: 'Write to persuade using rhetorical questions and emotive language',
    time: '10:30 – 11:15am',
    status: 'upcoming',
  },
  {
    id: 'l3',
    classId: 'c-3h',
    subjectId: 'science',
    topic: 'Forces – Push, Pull & Gravity',
    objective: 'Identify and describe how forces change shape and movement',
    time: '1:00 – 1:45pm',
    status: 'upcoming',
  },
];

/** Seed feedback for lesson l1 (so Class Map + Leadership are immediately rich). */
export const DEMO_FEEDBACK: Record<string, string> = {
  p1: 'support_worked',
  p2: 'got_it',
  p3: 'got_it',
  p4: 'nearly_there',
  p5: 'got_it',
  p6: 'nearly_there',
  p7: 'got_it',
  p8: 'needs_revisit',
  p9: 'support_not_worked',
  p10: 'got_it',
  p11: 'got_it',
  p12: 'nearly_there',
  p13: 'got_it',
  p14: 'got_it',
  p15: 'nearly_there',
  p16: 'got_it',
  p17: 'support_worked',
  p18: 'nearly_there',
  p19: 'got_it',
  p20: 'needs_revisit',
  p21: 'absent',
  p22: 'nearly_there',
  p23: 'got_it',
  p24: 'got_it',
  p25: 'needs_revisit',
  p26: 'got_it',
  p27: 'nearly_there',
  p28: 'got_it',
};

export const DEMO_NOTES: Record<string, string> = {
  p8: 'Struggled with cross-multiplication. Wants to use fingers.',
  p9: 'Tried visual method but got confused. Follow up 1:1.',
  p20: 'Lost focus after 15 mins — check table arrangement.',
};

export const DEMO_ADAPTATION_CARDS: DemoAdaptationCard[] = [
  {
    id: 'ad1',
    lessonId: 'l1',
    subjectId: 'maths',
    objective: 'Equivalent Fractions',
    typeLabel: 'Vocabulary support',
    emoji: '📖',
    target: 'Amira J., Leo D., Ravi S. + 1',
    need: 'Vocabulary gap — fraction language not secure',
    teacherAction:
      'Pre-teach 4 words before independent work: numerator, denominator, equivalent, simplify. Use picture cards at the front.',
    why: 'Last lesson feedback + EAL profile',
    evidence: "3 pupils coded 'nearly there'; all made vocabulary errors in verbal responses",
    confidence: 81,
    reviewState: 'planned',
    outcome: null,
  },
  {
    id: 'ad2',
    lessonId: 'l1',
    subjectId: 'maths',
    objective: 'Equivalent Fractions',
    typeLabel: 'Concrete resources',
    emoji: '🧱',
    target: 'Table 2 — Harry S., Isla B., Theo W. + 2',
    need: 'Abstract → concrete bridge needed',
    teacherAction:
      'Use fraction wall manipulatives before any written work. Let pupils build 1/2 = 2/4 physically before recording it.',
    why: 'Last lesson — 5 pupils needed revisit',
    evidence: "Harry S., Isla B., Theo W. and 2 others all scored 'Needs revisit' on the same objective",
    confidence: 84,
    reviewState: 'planned',
    outcome: null,
  },
  {
    id: 'ad3',
    lessonId: 'l1',
    subjectId: 'maths',
    objective: 'Equivalent Fractions',
    typeLabel: 'Worked example',
    emoji: '📋',
    target: 'Harry S.',
    need: 'Reduced cognitive load — too many steps at once',
    teacherAction:
      'Give Harry the first 2 problems fully worked. Gradually remove scaffolds. Let him watch then try — do not ask him to copy.',
    why: "SEND plan + 3 consecutive 'needs revisit'",
    evidence:
      "Harry has scored 'Needs revisit' in Maths for 3 of the last 4 lessons. Scaffolded examples worked well in literacy.",
    confidence: 88,
    reviewState: 'planned',
    outcome: null,
  },
  {
    id: 'ad4',
    lessonId: 'l1',
    subjectId: 'maths',
    objective: 'Equivalent Fractions',
    typeLabel: 'Stretch challenge',
    emoji: '⭐',
    target: 'Grace W., Ella T., Chloe P.',
    need: 'Ready to deepen — beyond the objective',
    teacherAction:
      "Ask: 'Can 1/3 and 2/5 ever be equivalent? Why not?' Then write a hint card for a classmate who is stuck.",
    why: "All 3 scored 'Got it' in the last 4 consecutive lessons",
    evidence:
      'These pupils consistently master objectives in the first lesson — stretch keeps them engaged and builds near-peer capacity.',
    confidence: 91,
    reviewState: 'planned',
    outcome: null,
  },
  {
    id: 'ad5',
    lessonId: null,
    subjectId: 'maths',
    objective: 'Add & Subtract Fractions',
    typeLabel: 'Concrete resources',
    emoji: '🧱',
    target: '5 pupils — Table 2',
    need: 'Abstract → concrete bridge needed',
    teacherAction: 'Fraction number line with laminated strips — place fractions before adding.',
    why: 'Previous lesson data',
    evidence: '5 pupils struggled placing fractions on a number line before adding',
    confidence: 80,
    reviewState: 'done',
    outcome: 'worked',
  },
  {
    id: 'ad6',
    lessonId: 'l2',
    subjectId: 'english.writing',
    objective: 'Persuasive Writing',
    typeLabel: 'Peer grouping',
    emoji: '👥',
    target: 'Darius M., Viktor B. + 2',
    need: 'Modelled language — EAL pupils need oral rehearsal first',
    teacherAction:
      'Pair with confident writers during drafting only. Keep planning stage independent so EAL pupils think first in their own language.',
    why: 'EAL profile + last lesson gaps',
    evidence: "4 pupils had strong ideas but thin persuasive language in last lesson's drafts",
    confidence: 79,
    reviewState: 'done',
    outcome: 'partly',
  },
  {
    id: 'ad7',
    lessonId: 'l3',
    subjectId: 'science',
    objective: 'Forces — Push & Pull',
    typeLabel: 'Early check-in',
    emoji: '🔍',
    target: 'Isla B., Yasmin I., Noah F.',
    need: 'Catch misconceptions early before they embed',
    teacherAction:
      "At the 8-minute mark, check in before the class moves on. Ask: 'What is the difference between a push and a pull?' If unsure, use the demo objects.",
    why: "SEND targets + last lesson 'needs revisit'",
    evidence: 'All 3 struggled to distinguish types of forces in the previous lesson',
    confidence: 72,
    reviewState: 'skipped',
    outcome: null,
  },
];

/** Feedback config — the 6 states (the product's core verbs). */
export const FEEDBACK_CONFIG = {
  got_it: { label: 'Got it', color: '#2EAD73', bg: '#E8F6EF', emoji: '✓' },
  nearly_there: { label: 'Nearly there', color: '#E8953A', bg: '#FEF0DC', emoji: '◑' },
  needs_revisit: { label: 'Needs revisit', color: '#D95A57', bg: '#FDECEB', emoji: '↩' },
  absent: { label: 'Absent', color: '#8B93A1', bg: '#F1F3F6', emoji: '–' },
  support_worked: { label: 'Support worked', color: '#3A8FCC', bg: '#E3F2FB', emoji: '+' },
  support_not_worked: { label: "Didn't work", color: '#8B6BD6', bg: '#F0ECFD', emoji: '!' },
} as const;
