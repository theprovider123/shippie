import type { H2HRecord } from '../lib/types';

export const RES_COLOR: Record<'W' | 'D' | 'L', string> = {
  W: '#4ADE80',
  D: '#FCD34D',
  L: '#FF5555',
};

export const H2H_DATA: Record<string, H2HRecord> = {
  'Man City': {
    record: { w: 9, d: 5, l: 11 },
    recent: [
      { date: 'May 2025', home: true, score: '2–0', r: 'W' },
      { date: 'Sep 2024', home: false, score: '2–2', r: 'D' },
      { date: 'Mar 2024', home: true, score: '0–0', r: 'D' },
      { date: 'Oct 2023', home: false, score: '0–1', r: 'L' },
      { date: 'Apr 2023', home: true, score: '3–3', r: 'D' },
    ],
    insight:
      "Haaland has yet to score at the Emirates. Arsenal unbeaten in 3. City's press will be the true test of the title defence.",
  },
  Chelsea: {
    record: { w: 14, d: 8, l: 9 },
    recent: [
      { date: 'Mar 2025', home: true, score: '1–1', r: 'D' },
      { date: 'Oct 2024', home: false, score: '2–1', r: 'W' },
      { date: 'Apr 2024', home: true, score: '5–0', r: 'W' },
      { date: 'Nov 2023', home: false, score: '0–1', r: 'L' },
      { date: 'May 2023', home: true, score: '3–1', r: 'W' },
    ],
    insight:
      'Saka has scored 5 goals in the last 6 meetings. The 5–0 at the Emirates was special. Chelsea come into this motivated.',
  },
  Liverpool: {
    record: { w: 12, d: 9, l: 14 },
    recent: [
      { date: 'Mar 2025', home: false, score: '2–2', r: 'D' },
      { date: 'Oct 2024', home: true, score: '2–0', r: 'W' },
      { date: 'Mar 2024', home: false, score: '3–2', r: 'W' },
      { date: 'Dec 2023', home: true, score: '1–1', r: 'D' },
      { date: 'Apr 2023', home: false, score: '0–4', r: 'L' },
    ],
    insight:
      '4 of the last 6 decided by a single goal. Anfield away is the hardest fixture on the calendar. Expect nothing easy.',
  },
  Spurs: {
    record: { w: 18, d: 8, l: 9 },
    recent: [
      { date: 'Apr 2025', home: true, score: '4–1', r: 'W' },
      { date: 'Nov 2024', home: false, score: '0–0', r: 'D' },
      { date: 'Apr 2024', home: true, score: '3–2', r: 'W' },
      { date: 'Sep 2023', home: false, score: '2–2', r: 'D' },
      { date: 'Jan 2023', home: true, score: '2–0', r: 'W' },
    ],
    insight:
      "Arsenal unbeaten in 8 North London Derbies. Emirates record since 2022: W5 D2 L0. Don't even think about it.",
  },
  'Man United': {
    record: { w: 16, d: 7, l: 9 },
    recent: [
      { date: 'Jan 2025', home: false, score: '1–0', r: 'W' },
      { date: 'Sep 2024', home: true, score: '3–2', r: 'W' },
      { date: 'Apr 2024', home: false, score: '0–1', r: 'L' },
      { date: 'Nov 2023', home: true, score: '1–0', r: 'W' },
      { date: 'Sep 2023', home: false, score: '1–3', r: 'L' },
    ],
    insight:
      'Won 4 of the last 6. Ødegaard: 6 goal contributions in his last 5 against United. The red half of Manchester comes to N5.',
  },
  Newcastle: {
    record: { w: 14, d: 6, l: 8 },
    recent: [
      { date: 'Apr 2025', home: false, score: '1–2', r: 'L' },
      { date: 'Nov 2024', home: true, score: '3–0', r: 'W' },
      { date: 'May 2024', home: false, score: '0–1', r: 'L' },
      { date: 'Dec 2023', home: true, score: '4–1', r: 'W' },
      { date: 'May 2023', home: false, score: '0–2', r: 'L' },
    ],
    insight:
      "St James' Park: 3 defeats in the last 5. Howe knows exactly how to set up against us. Brace yourself.",
  },
  'Aston Villa': {
    record: { w: 12, d: 5, l: 8 },
    recent: [
      { date: 'Feb 2025', home: false, score: '0–2', r: 'L' },
      { date: 'Sep 2024', home: true, score: '2–0', r: 'W' },
      { date: 'Apr 2024', home: false, score: '0–0', r: 'D' },
      { date: 'Dec 2023', home: true, score: '1–0', r: 'W' },
      { date: 'Nov 2023', home: false, score: '1–1', r: 'D' },
    ],
    insight:
      'Villa have been the closest thing to a third force. Compact defence, dangerous from set-pieces. Never a comfortable afternoon.',
  },
};
