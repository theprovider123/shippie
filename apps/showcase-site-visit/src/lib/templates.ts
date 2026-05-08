/**
 * Built-in checklist templates. These are the patterns a field worker
 * reaches for before they bother typing their own. Each template is a
 * typed list of check labels — not a rigid form, just a starting list
 * the inspector can amend on site.
 *
 * Keep this list short and load-bearing. A bloated template library is
 * worse than no library at all — site staff need to read it on a phone
 * in a basement.
 */

export type TemplateId =
  | 'fire-safety'
  | 'boiler-service'
  | 'electrical'
  | 'move-in-survey'
  | 'snag-list';

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  /** Order matters — checks render top-to-bottom in this order. */
  checks: ReadonlyArray<string>;
}

export const TEMPLATES: ReadonlyArray<Template> = [
  {
    id: 'fire-safety',
    name: 'Annual fire-safety inspection',
    description: 'Alarm, extinguishers, signage, escape routes.',
    checks: [
      'Smoke alarm — main',
      'Smoke alarm — landing',
      'Heat alarm — kitchen',
      'CO alarm — boiler room',
      'Fire extinguisher — pressure + tag',
      'Escape route — clear',
      'Fire door — self-closing',
      'Emergency lighting',
      'Signage — exit + assembly',
      'Last drill date — recorded',
    ],
  },
  {
    id: 'boiler-service',
    name: 'Boiler annual service',
    description: 'Combustion, pressure, flue, gas tightness.',
    checks: [
      'Gas tightness test',
      'Combustion analysis',
      'Flue integrity',
      'System pressure',
      'Pump operation',
      'Expansion vessel charge',
      'Flame picture',
      'Safety devices — test',
      'Condensate trap — clear',
      'CP12 paperwork ready',
    ],
  },
  {
    id: 'electrical',
    name: 'Electrical periodic inspection',
    description: 'Consumer unit, RCDs, sockets, earthing.',
    checks: [
      'Consumer unit — labelled',
      'RCD trip test',
      'Sockets — visual',
      'Earth bonding — kitchen',
      'Earth bonding — bathroom',
      'Lighting circuits',
      'Cooker circuit',
      'Immersion / shower circuit',
      'Smoke alarm wiring',
      'Insulation resistance',
    ],
  },
  {
    id: 'move-in-survey',
    name: 'Move-in flat survey',
    description: 'Walls, floors, fixtures, meters, keys.',
    checks: [
      'Walls — marks + damage',
      'Floors + carpets',
      'Windows + locks',
      'Doors + hinges',
      'Kitchen — appliances + condition',
      'Bathroom — taps, seals, tiles',
      'Heating — radiators + thermostat',
      'Meter readings — gas / electric / water',
      'Smoke / CO alarms — present',
      'Keys handed over',
    ],
  },
  {
    id: 'snag-list',
    name: 'New-build snag list',
    description: 'First walk-through; everything that needs attention.',
    checks: [
      'Paintwork',
      'Skirting + architrave',
      'Doors — hang + close',
      'Windows — open + seal',
      'Sockets + switches',
      'Tiling + grout',
      'Sealant — kitchen + bath',
      'Appliances — installed',
      'External — render + drainage',
      'Garden + boundary',
    ],
  },
];

export function getTemplate(id: string): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function templateChecks(id: string): ReadonlyArray<string> {
  return getTemplate(id)?.checks ?? [];
}
