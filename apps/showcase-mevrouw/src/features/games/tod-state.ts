/**
 * Truth or Dare. Both phones see the same prompt via a shared
 * "current roll" in the Y.Doc. Heart-rated difficulty.
 *
 * Y.Map shape:
 *   current: { id, kind, text, level, for, ts } | null
 *   history: array (last 50)
 */
import * as Y from 'yjs';

export type TodKind = 'truth' | 'dare';
export type TodLevel = 1 | 2 | 3; // 🤍 / 💛 / 🌶
export type TodFor = 'me' | 'them' | 'both';

export interface TodPrompt {
  id: string;
  kind: TodKind;
  text: string;
  level: TodLevel;
  for: TodFor;
}

export interface TodRoll extends TodPrompt {
  rolledAt: string;
  rolledBy: string; // device id
}

const TRUTHS: ReadonlyArray<TodPrompt> = [
  { id: 't1', kind: 'truth', level: 1, for: 'me', text: 'What was the moment today you wanted me there?' },
  { id: 't2', kind: 'truth', level: 1, for: 'me', text: 'A small thing about me you never want to forget.' },
  { id: 't3', kind: 'truth', level: 1, for: 'them', text: 'When did you last laugh at me, fondly?' },
  { id: 't4', kind: 'truth', level: 1, for: 'both', text: 'Pick a moment from this month neither of us should ever forget.' },
  { id: 't5', kind: 'truth', level: 2, for: 'me', text: 'A compliment you wish I gave you more often.' },
  { id: 't6', kind: 'truth', level: 2, for: 'me', text: 'When did you most want me to come home?' },
  { id: 't7', kind: 'truth', level: 2, for: 'them', text: "What's something I do that you've never told me you love?" },
  { id: 't8', kind: 'truth', level: 2, for: 'them', text: 'When were you last embarrassed in front of me?' },
  { id: 't9', kind: 'truth', level: 2, for: 'both', text: 'A jealous moment you remember.' },
  { id: 't10', kind: 'truth', level: 3, for: 'me', text: 'Where on me would you kiss first if I walked in right now?' },
  { id: 't11', kind: 'truth', level: 3, for: 'them', text: 'A specific moment with me you replay in your head.' },
  { id: 't12', kind: 'truth', level: 3, for: 'them', text: 'A fantasy you have but never said.' },
  { id: 't13', kind: 'truth', level: 3, for: 'both', text: 'The best kiss we ever had — describe it.' },
  { id: 't14', kind: 'truth', level: 3, for: 'me', text: "What's the one thing I do in bed that you'd never want to lose?" },
  { id: 't15', kind: 'truth', level: 2, for: 'me', text: 'A song you can\'t hear without thinking of me.' },
  { id: 't16', kind: 'truth', level: 1, for: 'them', text: 'Three things you packed in your imaginary bag for our next visit.' },
  { id: 't17', kind: 'truth', level: 2, for: 'me', text: 'When were you last proud of me?' },
  { id: 't18', kind: 'truth', level: 2, for: 'both', text: 'A moment from our story that should be a chapter title.' },
  { id: 't19', kind: 'truth', level: 3, for: 'them', text: "What's a small touch I do that ruins you?" },
  { id: 't20', kind: 'truth', level: 1, for: 'me', text: 'A photo of yours I should ask for.' },
];

const DARES: ReadonlyArray<TodPrompt> = [
  { id: 'd1', kind: 'dare', level: 1, for: 'me', text: 'Send a voice note saying their name three different ways.' },
  { id: 'd2', kind: 'dare', level: 1, for: 'me', text: 'Send a photo of where you are right now, no caption.' },
  { id: 'd3', kind: 'dare', level: 1, for: 'them', text: 'Tell them, in 10 words or fewer, why today is better with them in it.' },
  { id: 'd4', kind: 'dare', level: 1, for: 'both', text: 'Pull up the same song on both phones and start it at the same time.' },
  { id: 'd5', kind: 'dare', level: 2, for: 'me', text: 'Take a picture of one of your hands. Send it.' },
  { id: 'd6', kind: 'dare', level: 2, for: 'me', text: 'Sing one line of a love song to them on a voice note.' },
  { id: 'd7', kind: 'dare', level: 2, for: 'them', text: 'Send them a photo of what you\'re wearing right now.' },
  { id: 'd8', kind: 'dare', level: 2, for: 'them', text: "Read them a paragraph from whatever's on your bedside table." },
  { id: 'd9', kind: 'dare', level: 2, for: 'both', text: 'On a count of three, both type the first word that comes to mind. Compare.' },
  { id: 'd10', kind: 'dare', level: 3, for: 'me', text: 'Voice-note them describing a kiss you\'d give them right now.' },
  { id: 'd11', kind: 'dare', level: 3, for: 'them', text: 'Tell them in detail what you\'d do first when you next see them.' },
  { id: 'd12', kind: 'dare', level: 3, for: 'me', text: "Send a picture of one part of your body you wish they could touch right now." },
  { id: 'd13', kind: 'dare', level: 3, for: 'them', text: 'A 30-second voice note of what you\'re thinking when the lights go off.' },
  { id: 'd14', kind: 'dare', level: 3, for: 'both', text: 'Both write one fantasy each. Trade.' },
  { id: 'd15', kind: 'dare', level: 1, for: 'them', text: 'Write the corniest love note you can manage. Send it.' },
  { id: 'd16', kind: 'dare', level: 2, for: 'me', text: "Open your camera roll, pick a picture of them you've never sent back. Send it." },
  { id: 'd17', kind: 'dare', level: 2, for: 'both', text: 'Each pick a memory. Tell it from your side. Compare.' },
  { id: 'd18', kind: 'dare', level: 1, for: 'them', text: 'Tell them three things you noticed about them this week.' },
  { id: 'd19', kind: 'dare', level: 3, for: 'me', text: 'A voice note in your softest voice saying their name + one sentence.' },
  { id: 'd20', kind: 'dare', level: 2, for: 'them', text: 'Open your messages, find their oldest text in your thread, screenshot it, send it back.' },
];

export const TOD_BANK = { truths: TRUTHS, dares: DARES };

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('tod');
}

export function readTod(doc: Y.Doc): { current: TodRoll | null; history: TodRoll[] } {
  const m = getMap(doc);
  return {
    current: (m.get('current') as TodRoll | null | undefined) ?? null,
    history: (m.get('history') as TodRoll[] | undefined) ?? [],
  };
}

export function rollTod(
  doc: Y.Doc,
  rolledBy: string,
  opts: { level?: TodLevel; kind?: TodKind } = {},
): TodRoll {
  const kind = opts.kind ?? (Math.random() < 0.5 ? 'truth' : 'dare');
  const pool = (kind === 'truth' ? TRUTHS : DARES).filter(
    (p) => !opts.level || p.level === opts.level,
  );
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
  const roll: TodRoll = {
    ...pick,
    rolledAt: new Date().toISOString(),
    rolledBy,
  };
  const m = getMap(doc);
  const history = ((m.get('history') as TodRoll[] | undefined) ?? []).slice(-49);
  m.set('current', roll);
  m.set('history', [...history, roll]);
  return roll;
}

export function clearTod(doc: Y.Doc): void {
  getMap(doc).set('current', null);
}
