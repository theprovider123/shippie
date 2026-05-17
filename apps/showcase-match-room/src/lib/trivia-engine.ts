export interface TriviaQuestion {
  id: string;
  pack: string;
  difficulty: 'casual' | 'medium' | 'hard';
  question: string;
  options: [string, string, string, string];
  answerIndex: number;
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: 'host-city-001',
    pack: 'host-cities',
    difficulty: 'casual',
    question: 'Which city hosts the opening match on 11 June 2026?',
    options: ['Mexico City', 'Toronto', 'Los Angeles', 'New York/New Jersey'],
    answerIndex: 0,
  },
  {
    id: 'format-001',
    pack: 'rules-var',
    difficulty: 'casual',
    question: 'How many teams are in the 2026 tournament?',
    options: ['32', '40', '48', '64'],
    answerIndex: 2,
  },
  {
    id: 'opening-001',
    pack: 'football-history',
    difficulty: 'medium',
    question: 'Mexico open the 2026 tournament against which team?',
    options: ['South Africa', 'Korea Republic', 'Czechia', 'Qatar'],
    answerIndex: 0,
  },
  {
    id: 'group-001',
    pack: 'flags-geography',
    difficulty: 'medium',
    question: 'Which group contains Brazil, Morocco, Haiti, and Scotland?',
    options: ['Group A', 'Group C', 'Group G', 'Group L'],
    answerIndex: 1,
  },
  {
    id: 'final-001',
    pack: 'host-cities',
    difficulty: 'hard',
    question: 'The final is scheduled for which host area?',
    options: ['Dallas', 'Miami', 'New York/New Jersey', 'Seattle'],
    answerIndex: 2,
  },
  {
    id: 'host-city-002',
    pack: 'host-cities',
    difficulty: 'casual',
    question: 'How many host cities are used across the 2026 tournament?',
    options: ['8', '12', '16', '20'],
    answerIndex: 2,
  },
  {
    id: 'host-city-003',
    pack: 'host-cities',
    difficulty: 'medium',
    question: 'Which three countries host the 2026 tournament?',
    options: ['USA, Canada, Mexico', 'USA, Brazil, Mexico', 'Canada, England, USA', 'Mexico, Spain, USA'],
    answerIndex: 0,
  },
  {
    id: 'host-city-004',
    pack: 'host-cities',
    difficulty: 'medium',
    question: 'Which Canadian city is paired with a lake-inspired Match Room palette?',
    options: ['Toronto', 'Monterrey', 'Houston', 'Dallas'],
    answerIndex: 0,
  },
  {
    id: 'host-city-005',
    pack: 'host-cities',
    difficulty: 'hard',
    question: 'Which host area gets the ticker-tape final treatment in Match Room?',
    options: ['Seattle', 'New York/New Jersey', 'Miami', 'Kansas City'],
    answerIndex: 1,
  },
  {
    id: 'format-002',
    pack: 'rules-var',
    difficulty: 'casual',
    question: 'How many matches are in the 2026 tournament format?',
    options: ['64', '80', '96', '104'],
    answerIndex: 3,
  },
  {
    id: 'format-003',
    pack: 'rules-var',
    difficulty: 'medium',
    question: 'What does a Match Room exact-score prediction earn in the default scoring system?',
    options: ['1 point', '2 points', '3 points', '5 points'],
    answerIndex: 2,
  },
  {
    id: 'format-004',
    pack: 'rules-var',
    difficulty: 'medium',
    question: 'What should a room do if the live score feed is delayed?',
    options: ['Wait forever', 'Use room confirmation', 'Delete the match', 'Start a new room'],
    answerIndex: 1,
  },
  {
    id: 'format-005',
    pack: 'rules-var',
    difficulty: 'hard',
    question: 'Which status should be treated as frozen in Match Room after final confirmation?',
    options: ['Scheduled', 'In play', 'Finalised', 'Paused'],
    answerIndex: 2,
  },
  {
    id: 'flags-001',
    pack: 'flags-geography',
    difficulty: 'casual',
    question: 'Which team is represented by the code MEX?',
    options: ['Morocco', 'Mexico', 'Mozambique', 'Montenegro'],
    answerIndex: 1,
  },
  {
    id: 'flags-002',
    pack: 'flags-geography',
    difficulty: 'casual',
    question: 'Which team is represented by the code RSA?',
    options: ['South Africa', 'Saudi Arabia', 'Serbia', 'Switzerland'],
    answerIndex: 0,
  },
  {
    id: 'flags-003',
    pack: 'flags-geography',
    difficulty: 'medium',
    question: 'Which group contains Canada, Bosnia and Herzegovina, Qatar, and Switzerland?',
    options: ['Group B', 'Group E', 'Group H', 'Group K'],
    answerIndex: 0,
  },
  {
    id: 'flags-004',
    pack: 'flags-geography',
    difficulty: 'medium',
    question: 'Which group contains England, Croatia, Ghana, and Panama?',
    options: ['Group D', 'Group G', 'Group J', 'Group L'],
    answerIndex: 3,
  },
  {
    id: 'flags-005',
    pack: 'flags-geography',
    difficulty: 'hard',
    question: 'Which team code belongs to Cape Verde?',
    options: ['CPV', 'CVR', 'CVE', 'CPD'],
    answerIndex: 0,
  },
  {
    id: 'office-001',
    pack: 'office-daily',
    difficulty: 'casual',
    question: 'What is the best office sweepstake prize style for Match Room?',
    options: ['Real-money pot', 'Crypto payout', 'Non-money forfeit', 'Paid entry'],
    answerIndex: 2,
  },
  {
    id: 'office-002',
    pack: 'office-daily',
    difficulty: 'medium',
    question: 'Which room template defaults to HR-safe banter?',
    options: ['Pub', 'Office', 'Hardcore', 'Spicy'],
    answerIndex: 1,
  },
  {
    id: 'family-001',
    pack: 'family-friendly',
    difficulty: 'casual',
    question: 'Which room tone avoids harsh callouts by design?',
    options: ['Family', 'Pub', 'Spicy', 'Hardcore'],
    answerIndex: 0,
  },
  {
    id: 'family-002',
    pack: 'family-friendly',
    difficulty: 'casual',
    question: 'Which prompt fits a Family Room best?',
    options: ['Who bottled it?', 'Best celebration so far?', 'Receipts check?', 'Ref has lost it?'],
    answerIndex: 1,
  },
  {
    id: 'pub-001',
    pack: 'pub-hard',
    difficulty: 'medium',
    question: 'Which Match Room prompt is built for a pub table during a controversial decision?',
    options: ['VAR verdict?', 'Lunch quiz?', 'Pack the suitcase?', 'Office handover?'],
    answerIndex: 0,
  },
  {
    id: 'pub-002',
    pack: 'pub-hard',
    difficulty: 'hard',
    question: 'What makes a pub display room useful?',
    options: ['Phones act as controllers', 'Everyone shares one login', 'The host types every vote', 'It only works offline'],
    answerIndex: 0,
  },
  {
    id: 'history-001',
    pack: 'football-history',
    difficulty: 'casual',
    question: 'What is a clean-sheet result?',
    options: ['No goals conceded', 'No yellow cards', 'No substitutions', 'No corners'],
    answerIndex: 0,
  },
  {
    id: 'history-002',
    pack: 'football-history',
    difficulty: 'medium',
    question: 'What usually happens after a knockout match is level after extra time?',
    options: ['Coin toss', 'Replay next week', 'Penalty shootout', 'Away goals'],
    answerIndex: 2,
  },
  {
    id: 'stadium-001',
    pack: 'stadiums-travel',
    difficulty: 'casual',
    question: 'Which Match Room city palette references papel picado and bright architectural colour?',
    options: ['Mexico City', 'Boston', 'Seattle', 'Toronto'],
    answerIndex: 0,
  },
  {
    id: 'stadium-002',
    pack: 'stadiums-travel',
    difficulty: 'medium',
    question: 'Which host city is paired with a palm-and-sunset flavour in Match Room?',
    options: ['Miami', 'Philadelphia', 'Kansas City', 'Vancouver'],
    answerIndex: 0,
  },
  {
    id: 'upset-001',
    pack: 'upsets',
    difficulty: 'medium',
    question: 'What should a good upset share card celebrate?',
    options: ['Only the correct caller', 'Everyone equally', 'The app logo only', 'A payment link'],
    answerIndex: 0,
  },
  {
    id: 'upset-002',
    pack: 'upsets',
    difficulty: 'hard',
    question: 'Which Match Room artifact is designed to create post-result receipts?',
    options: ['Prediction Receipt', 'Language selector', 'QR code frame', 'Venue list'],
    answerIndex: 0,
  },
];

export function dailyTrivia(date: Date, count = 5): TriviaQuestion[] {
  const daySeed = date.toISOString().slice(0, 10);
  const shuffled = seededQuestions(daySeed);
  return shuffled.slice(0, Math.max(1, Math.min(count, shuffled.length)));
}

export function scoreTrivia(answers: readonly number[], questions: readonly TriviaQuestion[]): number {
  return questions.reduce((score, question, index) => score + (answers[index] === question.answerIndex ? 1 : 0), 0);
}

function seededQuestions(seed: string): TriviaQuestion[] {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  const out = [...TRIVIA_QUESTIONS];
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state || 1, 1103515245) + 12345) >>> 0;
    const j = state % (i + 1);
    const current = out[i];
    const swap = out[j];
    if (!current || !swap) continue;
    out[i] = swap;
    out[j] = current;
  }
  return out;
}
