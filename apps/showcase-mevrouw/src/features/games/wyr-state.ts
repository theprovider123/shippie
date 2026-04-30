/**
 * Would-You-Rather game state. Stored under Y.Map 'wyr' inside the
 * couple doc.
 *
 * Shape:
 *   currentQuestionId: string
 *   answers: Record<questionId, Record<deviceId, 'a' | 'b'>>
 *   answeredCount: number  (total questions both have answered)
 */
import * as Y from 'yjs';

export type Choice = 'a' | 'b';

export interface WYRQuestion {
  id: string;
  a: string;
  b: string;
}

export const WYR_BANK: ReadonlyArray<WYRQuestion> = [
  { id: 'q1', a: 'A weekend in the mountains', b: 'A weekend by the sea' },
  { id: 'q2', a: 'Cook for them every night', b: 'Be cooked for every night' },
  { id: 'q3', a: "Always know what they're thinking", b: 'Always be a tiny mystery to them' },
  { id: 'q4', a: 'Slow morning', b: 'Slow evening' },
  { id: 'q5', a: 'Live in a city we know', b: "Live in a city we don't" },
  { id: 'q6', a: 'A long letter', b: 'A long phone call' },
  { id: 'q7', a: 'Read the same book together', b: 'Watch the same show together' },
  { id: 'q8', a: 'Beach holiday', b: 'Road trip' },
  { id: 'q9', a: 'Plan everything', b: 'Plan nothing' },
  { id: 'q10', a: 'Cosy night in', b: 'Big night out' },
  { id: 'q11', a: 'A small house', b: 'A big garden' },
  { id: 'q12', a: 'Wake up early together', b: 'Stay up late together' },
  { id: 'q13', a: 'Sun on skin', b: 'Cold rain through a window' },
  { id: 'q14', a: 'A kitchen full of plants', b: 'A bedroom full of books' },
  { id: 'q15', a: 'Their hands always warm', b: 'Their hands always cool' },
  { id: 'q16', a: 'Travel the world for a year', b: 'Renovate one home together' },
  { id: 'q17', a: 'A pet cat', b: 'A pet dog' },
  { id: 'q18', a: 'Camping under stars', b: 'A nice hotel with a view' },
  { id: 'q19', a: 'Always remember the song', b: 'Always remember the smell' },
  { id: 'q20', a: 'Surprise me', b: 'Tell me everything in advance' },
  { id: 'q21', a: 'A long meal with new wine', b: 'A long walk with old stories' },
  { id: 'q22', a: 'Live near the train station', b: 'Live near the harbour' },
  { id: 'q23', a: 'Coffee in bed', b: 'Tea on the balcony' },
  { id: 'q24', a: 'Always pick the music', b: 'Always be surprised by it' },
  { id: 'q25', a: 'A handwritten note in your bag', b: "A voice note when you've landed" },
  { id: 'q26', a: 'Holiday somewhere quiet', b: 'Holiday somewhere loud' },
  { id: 'q27', a: 'A movie at home', b: 'A movie at the cinema' },
  { id: 'q28', a: 'Cook from a recipe', b: 'Cook from memory' },
  { id: 'q29', a: 'Big window, no curtains', b: 'Heavy curtains, soft lamps' },
  { id: 'q30', a: 'Sunday market run', b: 'Sunday in pyjamas' },
  { id: 'q31', a: 'A dance neither of us know', b: 'A dance we both grew up with' },
  { id: 'q32', a: 'Their feet on you on the sofa', b: 'Your head on them on the sofa' },
  { id: 'q33', a: 'A house full of friends', b: 'A house just for us' },
  { id: 'q34', a: 'Rain on the tent', b: 'Rain on the window' },
  { id: 'q35', a: 'A long Christmas', b: 'A long summer' },
  { id: 'q36', a: 'A photo together once a week', b: 'A voice memo once a day' },
  { id: 'q37', a: 'Learn a language together', b: 'Learn an instrument together' },
  { id: 'q38', a: 'Same flight, middle seats', b: 'Different flights, same hotel' },
  { id: 'q39', a: 'Tell every secret', b: 'Save one for the day before forever' },
  { id: 'q40', a: 'A long bath together', b: 'A long shower together' },
  { id: 'q41', a: 'Forehead kiss', b: 'Hand on the back of your neck' },
  { id: 'q42', a: 'Their cooking on a Tuesday', b: 'Their cooking on a Saturday' },
  { id: 'q43', a: 'A fire in winter', b: 'A breeze in summer' },
  { id: 'q44', a: 'Dance in the kitchen', b: 'Dance in the dark' },
  { id: 'q45', a: 'A morning text every day', b: 'A long call once a week' },
  { id: 'q46', a: "Always finish each other's sentences", b: 'Always be slightly surprised' },
  { id: 'q47', a: 'Christmas at theirs', b: 'Christmas at ours' },
  { id: 'q48', a: 'A garden of vegetables', b: 'A garden of flowers' },
  { id: 'q49', a: 'A long honeymoon, simple wedding', b: 'A big wedding, weekend honeymoon' },
  { id: 'q50', a: 'A balcony', b: 'A back garden' },
  { id: 'q51', a: 'Their playlist on a long drive', b: 'Silence on a long drive' },
  { id: 'q52', a: 'Wake to their voice', b: 'Wake to birds' },
  { id: 'q53', a: 'A handwritten card', b: 'A perfect text' },
  { id: 'q54', a: 'Cook from one cookbook for a year', b: 'Eat at a different place every week' },
  { id: 'q55', a: 'Train across Europe', b: 'Sail down a coastline' },
  { id: 'q56', a: 'They keep all your photos', b: 'You keep all theirs' },
  { id: 'q57', a: 'Watch the same sunrise from different cities', b: 'Watch the same sunset side by side' },
  { id: 'q58', a: 'A song you both know by heart', b: 'A song that becomes yours over time' },
  { id: 'q59', a: 'Buy each other books', b: 'Buy each other plants' },
  { id: 'q60', a: 'Always be early together', b: 'Always be late together' },
];

interface WYRRecord {
  current: string;
  answers: Record<string, Record<string, Choice>>;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('wyr');
}

export function readWYR(doc: Y.Doc): WYRRecord {
  const m = getMap(doc);
  const current = (m.get('current') as string | undefined) ?? WYR_BANK[0]!.id;
  const answers = (m.get('answers') as Record<string, Record<string, Choice>> | undefined) ?? {};
  return { current, answers };
}

export function answerWYR(doc: Y.Doc, deviceId: string, choice: Choice): void {
  const m = getMap(doc);
  const current = (m.get('current') as string | undefined) ?? WYR_BANK[0]!.id;
  const answers = { ...((m.get('answers') as Record<string, Record<string, Choice>> | undefined) ?? {}) };
  const forQ = { ...(answers[current] ?? {}) };
  forQ[deviceId] = choice;
  answers[current] = forQ;
  m.set('answers', answers);
}

export function nextWYR(doc: Y.Doc): void {
  const m = getMap(doc);
  const currentId = (m.get('current') as string | undefined) ?? WYR_BANK[0]!.id;
  const idx = WYR_BANK.findIndex((q) => q.id === currentId);
  const next = WYR_BANK[(idx + 1) % WYR_BANK.length]!;
  m.set('current', next.id);
}

export function questionFor(id: string): WYRQuestion {
  return WYR_BANK.find((q) => q.id === id) ?? WYR_BANK[0]!;
}

export function bothAnswered(rec: WYRRecord, myDeviceId: string, partnerDeviceId: string | null): boolean {
  if (!partnerDeviceId) return false;
  const a = rec.answers[rec.current] ?? {};
  return !!a[myDeviceId] && !!a[partnerDeviceId];
}
