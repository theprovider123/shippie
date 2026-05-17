/**
 * Built-in pitch templates. Each template names the section kinds in
 * the order a typical pitch of that type uses. Order matters — readers
 * (grant officers, RFP scorers, sponsorship managers, board members)
 * have strong expectations about flow.
 *
 * The kinds are reused across types where they make sense. A grant's
 * "team" section and a proposal's "team" section are the same kind;
 * different types just title and order them differently.
 */

export type PitchType =
  | 'grant'
  | 'rfp'
  | 'proposal'
  | 'sponsorship'
  | 'board-update'
  | 'custom';

export type SectionKind =
  | 'summary'
  | 'problem'
  | 'solution'
  | 'budget'
  | 'timeline'
  | 'team'
  | 'impact'
  | 'references'
  | 'custom';

export interface SectionTemplate {
  kind: SectionKind;
  title: string;
  /** Hint text shown in the empty editor. Sets expectations, doesn't draft anything. */
  hint: string;
}

export interface PitchTemplate {
  type: PitchType;
  name: string;
  /** One-line description of when to pick this template. */
  description: string;
  sections: SectionTemplate[];
}

/**
 * Grant proposals — for foundations, research grants, government
 * funding rounds. Heavy on impact and budget rationale.
 */
const GRANT: PitchTemplate = {
  type: 'grant',
  name: 'Grant proposal',
  description: 'Foundation, research, or government grant. Problem → approach → budget → impact.',
  sections: [
    { kind: 'problem', title: 'Problem statement', hint: 'Who is affected, how badly, what evidence?' },
    { kind: 'solution', title: 'Approach', hint: 'What you will do. Method, not aspiration.' },
    { kind: 'budget', title: 'Budget', hint: 'Line items with reasoning. Match the funder format.' },
    { kind: 'impact', title: 'Impact', hint: 'What changes if this works. Measurable where possible.' },
    { kind: 'team', title: 'Team', hint: 'Who is doing the work. One paragraph each.' },
    { kind: 'references', title: 'References', hint: 'Citations, prior work, supporting letters.' },
  ],
};

/**
 * RFP responses — competitive bidding for client work. The order is
 * load-bearing: executive summary first because evaluators read the
 * top of every page first when comparing bids.
 */
const RFP: PitchTemplate = {
  type: 'rfp',
  name: 'RFP response',
  description: 'Competitive bid. Exec summary → understanding → approach → pricing → timeline → quals.',
  sections: [
    { kind: 'summary', title: 'Executive summary', hint: 'Three sentences. What you propose, why you, the headline price.' },
    { kind: 'problem', title: 'Understanding', hint: 'Restate their need in your words. Shows you read the brief.' },
    { kind: 'solution', title: 'Approach', hint: 'How you will deliver. Phases, deliverables, decisions.' },
    { kind: 'budget', title: 'Pricing', hint: 'Fixed fee, T&M, or milestone breakdown. Match their RFP format.' },
    { kind: 'timeline', title: 'Timeline', hint: 'Calendar weeks, dependencies, key checkpoints.' },
    { kind: 'team', title: 'Qualifications', hint: 'Why this team. Relevant projects, named people.' },
  ],
};

/**
 * Freelance proposals — direct-to-client, less formal than RFP. About-you
 * first when the client doesn't already know you.
 */
const PROPOSAL: PitchTemplate = {
  type: 'proposal',
  name: 'Freelance proposal',
  description: 'Direct-to-client proposal. About-you → scope → deliverables → timeline → pricing → next steps.',
  sections: [
    { kind: 'team', title: 'About you', hint: 'One paragraph. What you do, who you do it for.' },
    { kind: 'solution', title: 'Scope', hint: 'What is in. What is explicitly out.' },
    { kind: 'impact', title: 'Deliverables', hint: 'A bulleted list the client can tick off.' },
    { kind: 'timeline', title: 'Timeline', hint: 'Start date, key checkpoints, end date.' },
    { kind: 'budget', title: 'Pricing', hint: 'Fixed fee or rate. Payment terms.' },
    { kind: 'custom', title: 'Next steps', hint: 'How to accept, what happens after they say yes.' },
  ],
};

/**
 * Sponsorship asks — selling reach + activation. Audience first because
 * sponsors buy audience, not your event.
 */
const SPONSORSHIP: PitchTemplate = {
  type: 'sponsorship',
  name: 'Sponsorship ask',
  description: 'Pitch to a sponsor. Audience → activation → value exchange → commercials.',
  sections: [
    { kind: 'summary', title: 'Audience', hint: 'Who attends, how many, demographics, why they care.' },
    { kind: 'solution', title: 'Activation', hint: 'What the sponsor gets to do. On-site, on-stream, in-comms.' },
    { kind: 'impact', title: 'Value exchange', hint: 'What they receive (impressions, leads, brand alignment) for what they give.' },
    { kind: 'budget', title: 'Commercials', hint: 'Tier pricing, deliverables per tier, deadlines.' },
  ],
};

/**
 * Board updates — internal pitches asking for capital, headcount, or
 * direction. Highlights/lowlights up top, asks at the end.
 */
const BOARD_UPDATE: PitchTemplate = {
  type: 'board-update',
  name: 'Board update',
  description: 'Quarterly or ad-hoc board update. Highlights → lowlights → asks → metrics.',
  sections: [
    { kind: 'summary', title: 'Highlights', hint: 'Three to five wins. Numbers where possible.' },
    { kind: 'problem', title: 'Lowlights', hint: 'What is broken or off-track. Honest, not catastrophising.' },
    { kind: 'custom', title: 'Asks', hint: 'What you need from the board. Decisions, intros, capital.' },
    { kind: 'impact', title: 'Metrics', hint: 'KPI table. This quarter vs last, this quarter vs plan.' },
  ],
};

/** Custom — empty template, user adds sections. */
const CUSTOM: PitchTemplate = {
  type: 'custom',
  name: 'Custom',
  description: 'Start blank. Add sections as you go.',
  sections: [
    { kind: 'summary', title: 'Summary', hint: 'A starting paragraph.' },
  ],
};

export const BUILTIN_TEMPLATES: PitchTemplate[] = [
  GRANT,
  RFP,
  PROPOSAL,
  SPONSORSHIP,
  BOARD_UPDATE,
  CUSTOM,
];

/** Look up a template by type. Falls back to custom if the type is unknown. */
export function templateFor(type: PitchType): PitchTemplate {
  return BUILTIN_TEMPLATES.find((t) => t.type === type) ?? CUSTOM;
}

export const PITCH_TYPE_LABEL: Record<PitchType, string> = {
  grant: 'Grant',
  rfp: 'RFP response',
  proposal: 'Proposal',
  sponsorship: 'Sponsorship',
  'board-update': 'Board update',
  custom: 'Custom',
};

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  summary: 'Summary',
  problem: 'Problem',
  solution: 'Solution',
  budget: 'Budget',
  timeline: 'Timeline',
  team: 'Team',
  impact: 'Impact',
  references: 'References',
  custom: 'Custom',
};
