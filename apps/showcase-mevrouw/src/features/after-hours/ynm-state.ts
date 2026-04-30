/**
 * Yes / No / Maybe — kink discovery list with mutual reveal.
 *
 * Each device privately marks each item: 'yes' | 'no' | 'maybe' | undefined.
 * The UI ONLY reveals items where both partners chose the same non-no
 * answer ("yes/yes" or "maybe/maybe"). Anything one-sided stays hidden,
 * so a "no" on one side never embarrasses anyone.
 *
 * Y.Map shape:
 *   <device_id> → Record<itemId, 'yes' | 'no' | 'maybe'>
 */
import * as Y from 'yjs';

export type YnmAnswer = 'yes' | 'no' | 'maybe';

export interface YnmItem {
  id: string;
  text: string;
  category: 'sweet' | 'playful' | 'spicy' | 'fantasy';
}

export const YNM_BANK: ReadonlyArray<YnmItem> = [
  // sweet
  { id: 'y1', category: 'sweet', text: 'Slow kissing for ten minutes, no further' },
  { id: 'y2', category: 'sweet', text: 'Cuddle naked, sleep that way' },
  { id: 'y3', category: 'sweet', text: 'Mutual massage with oil' },
  { id: 'y4', category: 'sweet', text: 'Read each other to sleep' },
  { id: 'y5', category: 'sweet', text: 'Shower together' },
  { id: 'y6', category: 'sweet', text: 'Long, slow undressing' },
  { id: 'y7', category: 'sweet', text: 'Eye contact the whole time' },
  // playful
  { id: 'y8', category: 'playful', text: 'Striptease for the other' },
  { id: 'y9', category: 'playful', text: 'Sex in the morning before anyone speaks' },
  { id: 'y10', category: 'playful', text: 'Try a position from a list neither of us has done' },
  { id: 'y11', category: 'playful', text: 'Voice notes while apart, only sounds' },
  { id: 'y12', category: 'playful', text: 'Send each other a selfie in something they\'d love' },
  { id: 'y13', category: 'playful', text: 'Roleplay first-meet — strangers in a bar' },
  { id: 'y14', category: 'playful', text: 'Blindfold one of us' },
  { id: 'y15', category: 'playful', text: 'Tie wrists with a soft scarf' },
  { id: 'y16', category: 'playful', text: 'Shower one of us with feathers / soft touch only' },
  { id: 'y17', category: 'playful', text: 'No-hands rule for one round' },
  { id: 'y18', category: 'playful', text: 'Watch something together until it tips us over' },
  { id: 'y19', category: 'playful', text: 'Take a photo together (just for us)' },
  { id: 'y20', category: 'playful', text: 'Try a new room of the house' },
  // spicy
  { id: 'y21', category: 'spicy', text: 'One of us takes the lead the entire time' },
  { id: 'y22', category: 'spicy', text: 'Light spanking, increasing' },
  { id: 'y23', category: 'spicy', text: 'Hair pulling (gentle)' },
  { id: 'y24', category: 'spicy', text: 'Bite — neck, shoulders' },
  { id: 'y25', category: 'spicy', text: 'Talk filthy, slowly, until we can\'t' },
  { id: 'y26', category: 'spicy', text: 'Edge each other — close to the edge, then back' },
  { id: 'y27', category: 'spicy', text: 'Use a toy together' },
  { id: 'y28', category: 'spicy', text: 'Hold our breath at the end on a count' },
  { id: 'y29', category: 'spicy', text: 'Anal play (giving)' },
  { id: 'y30', category: 'spicy', text: 'Anal play (receiving)' },
  { id: 'y31', category: 'spicy', text: 'Wax — low-temp, candle made for this' },
  { id: 'y32', category: 'spicy', text: 'Ice — running it everywhere' },
  // fantasy
  { id: 'y33', category: 'fantasy', text: 'Hotel room, one night, anything goes' },
  { id: 'y34', category: 'fantasy', text: 'Outside (private, somewhere we\'d never be caught)' },
  { id: 'y35', category: 'fantasy', text: 'Make a video — for us, deleted after' },
  { id: 'y36', category: 'fantasy', text: 'Take photos, keep them' },
  { id: 'y37', category: 'fantasy', text: 'Phone sex with one rule: only describing' },
  { id: 'y38', category: 'fantasy', text: 'Roleplay: stranger and themselves at a party' },
  { id: 'y39', category: 'fantasy', text: 'Roleplay: meeting in the back of a car' },
  { id: 'y40', category: 'fantasy', text: 'Roleplay: long-married, slow Sunday' },
  { id: 'y41', category: 'fantasy', text: 'A whole evening that ends nowhere — just want, no payoff' },
  { id: 'y42', category: 'fantasy', text: 'A whole evening that ends in everything' },
  { id: 'y43', category: 'fantasy', text: 'Read each other something we wrote' },
  { id: 'y44', category: 'fantasy', text: 'Mirror in the room, both watching' },
];

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('ynm');
}

export interface YnmState {
  byDevice: Record<string, Record<string, YnmAnswer>>;
}

export function readYnm(doc: Y.Doc): YnmState {
  const m = getMap(doc);
  const out: Record<string, Record<string, YnmAnswer>> = {};
  m.forEach((v, k) => {
    if (v && typeof v === 'object') {
      out[k] = { ...(v as Record<string, YnmAnswer>) };
    }
  });
  return { byDevice: out };
}

export function setYnm(doc: Y.Doc, deviceId: string, itemId: string, answer: YnmAnswer | null): void {
  const m = getMap(doc);
  const existing = ((m.get(deviceId) as Record<string, YnmAnswer> | undefined) ?? {});
  const next = { ...existing };
  if (answer === null) {
    delete next[itemId];
  } else {
    next[itemId] = answer;
  }
  m.set(deviceId, next);
}

/**
 * Items where both said yes (mutual yes) or both said maybe (mutual maybe).
 * Anything one-sided is hidden.
 */
export function mutualOverlap(state: YnmState, a: string, b: string): {
  bothYes: YnmItem[];
  bothMaybe: YnmItem[];
} {
  const ans = (deviceId: string, itemId: string) => state.byDevice[deviceId]?.[itemId];
  const bothYes: YnmItem[] = [];
  const bothMaybe: YnmItem[] = [];
  for (const item of YNM_BANK) {
    const av = ans(a, item.id);
    const bv = ans(b, item.id);
    if (av === 'yes' && bv === 'yes') bothYes.push(item);
    else if ((av === 'yes' || av === 'maybe') && (bv === 'yes' || bv === 'maybe')) {
      bothMaybe.push(item);
    }
  }
  return { bothYes, bothMaybe };
}

export function progressFor(state: YnmState, deviceId: string): { answered: number; total: number } {
  const my = state.byDevice[deviceId] ?? {};
  return { answered: Object.keys(my).length, total: YNM_BANK.length };
}
