export type DayNumber = 1 | 2;
export type Track = 'main' | 'breakout' | 'social' | 'break' | 'transport' | 'awards';

export interface Speaker {
  id: string;
  name: string;
  title: string;
  org: string;
  initials: string;
  bio: string;
  sessions: string[];
}

export interface BreakoutChoice {
  id: string;
  letter: 'A' | 'B' | 'C';
  stream: string;
  title: string;
  room: string;
  level: string;
  speakerIds: string[];
  capacity?: number;
}

export interface Session {
  id: string;
  day: DayNumber;
  start: number;
  end: number;
  title: string;
  room?: string;
  level?: string;
  track: Track;
  speakerIds?: string[];
  description?: string;
  note?: string;
  allAttendees?: boolean;
  breakout?: BreakoutChoice[];
}

export interface AwardCategory {
  id: string;
  title: string;
  nominees: string[];
  winner?: string;
  hiddenUntil?: { day: DayNumber; minutes: number };
}

export interface FloorPlan {
  id: string;
  label: string;
  name: string;
  rooms: Array<{ id: string; name: string; x: number; y: number; w: number; h: number; kind?: string }>;
}

export const T = (hour: number, minute = 0): number => hour * 60 + minute;

export const EVENT = {
  title: 'Apex Conference 2026',
  legalTitle: 'Apex Group Annual Leadership Conference 2026',
  tagline: "Building for What's Next",
  dateRange: 'Wednesday 11 - Thursday 12 June 2026',
  venue: 'etc.venues 133 Houndsditch, London EC3A 7BX',
  attendeeCount: 120,
  wifi: { network: 'Apex2026', password: 'Leadership' },
  days: [
    { n: 1 as const, label: 'Wed 11', full: 'Wednesday 11 June', subline: 'Day 1 of 2' },
    { n: 2 as const, label: 'Thu 12', full: 'Thursday 12 June', subline: 'Day 2 of 2' },
  ],
  reveal: { day: 2 as const, minutes: T(13, 30) },
};

export const SPEAKERS: Speaker[] = [
  {
    id: 'marcus-webb',
    name: 'Marcus Webb',
    title: 'Group CEO',
    org: 'Apex Group',
    initials: 'MW',
    bio: '20 years at Apex. Previously McKinsey and Barclays. LSE and Harvard Business School.',
    sessions: ['d1-welcome', 'd1-close', 'd2-awards'],
  },
  {
    id: 'priya-nair',
    name: 'Dr. Priya Nair',
    title: 'Chief Digital Officer',
    org: 'Apex Group',
    initials: 'PN',
    bio: 'Led digital transformation of three FTSE 100 companies. PhD Computer Science, Imperial College London.',
    sessions: ['d1-ai-keynote', 'd1-breakout2'],
  },
  {
    id: 'sarah-chen',
    name: 'Sarah Chen',
    title: 'Commercial Director',
    org: 'Apex Group',
    initials: 'SC',
    bio: '14 years in B2B financial services. Speaker and board advisor on commercial strategy.',
    sessions: ['d1-breakout1', 'd1-panel'],
  },
  {
    id: 'rachel-booth',
    name: 'Rachel Booth',
    title: 'Chief Financial Officer',
    org: 'Apex Group',
    initials: 'RB',
    bio: 'CFA, ACA. Previously Deloitte and JP Morgan.',
    sessions: ['d1-breakout2', 'd1-panel'],
  },
  {
    id: 'marcus-osei',
    name: 'Marcus Osei',
    title: 'Chief People Officer',
    org: 'Apex Group',
    initials: 'MO',
    bio: 'Author of Human Organisations in the Machine Age, published in 2024.',
    sessions: ['d1-breakout1', 'd1-panel'],
  },
  {
    id: 'tom-williams',
    name: 'Tom Williams',
    title: 'Chief Technology Officer',
    org: 'Apex Group',
    initials: 'TW',
    bio: 'Previously Amazon Web Services for eight years.',
    sessions: ['d1-breakout1', 'd1-panel'],
  },
  {
    id: 'james-thornton',
    name: 'Dr. James Thornton',
    title: 'External Keynote',
    org: 'Octopus Energy for Business',
    initials: 'JT',
    bio: 'Award-winning speaker on sustainable business. TED speaker and FT100 Disruptors list 2025.',
    sessions: ['d2-sustainability'],
  },
  {
    id: 'charlotte-blake',
    name: 'Charlotte Blake',
    title: 'Non-Executive Director',
    org: 'Apex Group',
    initials: 'CB',
    bio: 'Former CEO of Lloyds Banking Group divisions. Panel moderator on Day 1.',
    sessions: ['d1-panel'],
  },
];

export const SESSIONS: Session[] = [
  {
    id: 'd1-registration',
    day: 1,
    start: T(8),
    end: T(9),
    title: 'Registration and breakfast',
    room: 'Main foyer',
    level: 'Ground floor',
    track: 'social',
    note: 'Tea, coffee, pastries, and full English stations.',
    allAttendees: true,
  },
  {
    id: 'd1-welcome',
    day: 1,
    start: T(9),
    end: T(9, 45),
    title: 'Welcome and CEO address',
    room: 'Main auditorium',
    level: 'Level 1',
    track: 'main',
    speakerIds: ['marcus-webb'],
    description: 'Our performance, our ambition, our people.',
    allAttendees: true,
  },
  {
    id: 'd1-ai-keynote',
    day: 1,
    start: T(9, 45),
    end: T(10, 30),
    title: 'Keynote: AI and the future of our sector',
    room: 'Main auditorium',
    level: 'Level 1',
    track: 'main',
    speakerIds: ['priya-nair'],
    allAttendees: true,
  },
  {
    id: 'd1-coffee',
    day: 1,
    start: T(10, 30),
    end: T(11),
    title: 'Coffee and networking',
    room: 'Sky Terrace',
    level: 'Level 3',
    track: 'break',
    allAttendees: true,
  },
  {
    id: 'd1-breakout1',
    day: 1,
    start: T(11),
    end: T(12, 30),
    title: 'Breakout sessions - Round 1',
    track: 'breakout',
    description: 'Choose one stream for the morning working session.',
    breakout: [
      {
        id: 'd1-breakout1-A',
        letter: 'A',
        stream: 'Stream A',
        title: 'Commercial Strategy 2026-2028',
        room: 'Room Aldgate',
        level: 'Level 2',
        speakerIds: ['sarah-chen'],
        capacity: 40,
      },
      {
        id: 'd1-breakout1-B',
        letter: 'B',
        stream: 'Stream B',
        title: 'People and Culture',
        room: 'Room Bishopsgate',
        level: 'Level 2',
        speakerIds: ['marcus-osei'],
        capacity: 40,
      },
      {
        id: 'd1-breakout1-C',
        letter: 'C',
        stream: 'Stream C',
        title: 'Technology Roadmap',
        room: 'Room Fenchurch',
        level: 'Level 2',
        speakerIds: ['tom-williams'],
        capacity: 40,
      },
    ],
  },
  {
    id: 'd1-lunch',
    day: 1,
    start: T(12, 30),
    end: T(14),
    title: 'Networking lunch',
    room: 'Sky Terrace',
    level: 'Level 3',
    track: 'social',
    note: 'Three-course served lunch. Dietary requirements pre-noted.',
    allAttendees: true,
  },
  {
    id: 'd1-breakout2',
    day: 1,
    start: T(14),
    end: T(15, 30),
    title: 'Breakout sessions - Round 2',
    track: 'breakout',
    description: 'Choose one afternoon stream.',
    breakout: [
      {
        id: 'd1-breakout2-A',
        letter: 'A',
        stream: 'Stream A',
        title: 'Financial Performance Deep Dive',
        room: 'Room Aldgate',
        level: 'Level 2',
        speakerIds: ['rachel-booth'],
      },
      {
        id: 'd1-breakout2-B',
        letter: 'B',
        stream: 'Stream B',
        title: 'Client Experience',
        room: 'Room Bishopsgate',
        level: 'Level 2',
        speakerIds: [],
      },
      {
        id: 'd1-breakout2-C',
        letter: 'C',
        stream: 'Stream C',
        title: 'Innovation Lab',
        room: 'Room Fenchurch',
        level: 'Level 2',
        speakerIds: ['priya-nair'],
      },
    ],
  },
  {
    id: 'd1-break',
    day: 1,
    start: T(15, 30),
    end: T(16),
    title: 'Afternoon break',
    room: 'Main foyer',
    level: 'Ground floor',
    track: 'break',
    allAttendees: true,
  },
  {
    id: 'd1-panel',
    day: 1,
    start: T(16),
    end: T(17),
    title: 'Panel: Leadership in uncertainty',
    room: 'Main auditorium',
    level: 'Level 1',
    track: 'main',
    speakerIds: ['marcus-webb', 'sarah-chen', 'rachel-booth', 'marcus-osei', 'charlotte-blake'],
    note: 'Moderated by Charlotte Blake.',
    allAttendees: true,
  },
  {
    id: 'd1-close',
    day: 1,
    start: T(17),
    end: T(17, 45),
    title: 'Keynote close: The next chapter',
    room: 'Main auditorium',
    level: 'Level 1',
    track: 'main',
    speakerIds: ['marcus-webb'],
    allAttendees: true,
  },
  {
    id: 'd1-coaches',
    day: 1,
    start: T(18, 30),
    end: T(19),
    title: 'Coaches depart for evening dinner',
    room: 'Main entrance',
    level: 'EC3A 7BX',
    track: 'transport',
    note: 'Meeting point: main entrance.',
    allAttendees: true,
  },
  {
    id: 'd1-dinner',
    day: 1,
    start: T(19),
    end: T(24),
    title: 'Conference dinner',
    room: 'Sushisamba',
    level: '110 Bishopsgate, 41st floor',
    track: 'social',
    note: 'Cocktail reception, three-course dinner, smart casual. Late bar until midnight.',
    allAttendees: true,
  },
  {
    id: 'd2-breakfast',
    day: 2,
    start: T(8, 30),
    end: T(9, 30),
    title: 'Breakfast and informal sessions',
    room: 'Sky Terrace',
    level: 'Level 3',
    track: 'social',
    allAttendees: true,
  },
  {
    id: 'd2-sustainability',
    day: 2,
    start: T(9, 30),
    end: T(10, 30),
    title: 'Morning keynote: Sustainability and growth',
    room: 'Main auditorium',
    level: 'Level 1',
    track: 'main',
    speakerIds: ['james-thornton'],
    allAttendees: true,
  },
  {
    id: 'd2-working-groups',
    day: 2,
    start: T(10, 30),
    end: T(12),
    title: 'Working groups - Annual priorities',
    room: 'Rooms Aldgate, Bishopsgate, Fenchurch',
    level: 'Level 2',
    track: 'breakout',
    note: 'Groups pre-assigned by department.',
    allAttendees: true,
  },
  {
    id: 'd2-lunch',
    day: 2,
    start: T(12),
    end: T(13, 30),
    title: 'Lunch and closing celebration',
    room: 'Sky Terrace',
    level: 'Level 3',
    track: 'social',
    allAttendees: true,
  },
  {
    id: 'd2-awards',
    day: 2,
    start: T(13, 30),
    end: T(14, 30),
    title: 'CEO close and Apex Awards',
    room: 'Main auditorium',
    level: 'Level 1',
    track: 'awards',
    speakerIds: ['marcus-webb'],
    note: 'Five categories, 15 nominees, and the Colleague Choice reveal.',
    allAttendees: true,
  },
  {
    id: 'd2-close',
    day: 2,
    start: T(14, 30),
    end: T(15),
    title: 'Conference closes',
    room: 'Main entrance',
    level: 'Ground floor',
    track: 'transport',
    note: 'Coaches available from 14:30.',
    allAttendees: true,
  },
];

export const AWARDS: AwardCategory[] = [
  {
    id: 'leader',
    title: 'Leader of the Year',
    nominees: ['Sarah Chen', 'Tom Williams', 'Priya Nair'],
    winner: 'Sarah Chen',
  },
  {
    id: 'team',
    title: 'Team of the Year',
    nominees: ['The Client Success Team', 'Technology Infrastructure', 'New Business Development'],
    winner: 'The Client Success Team',
  },
  {
    id: 'innovation',
    title: 'Innovation Award',
    nominees: ['Project Horizon', 'The People Analytics Initiative', 'Client Digital Transformation'],
    winner: 'Project Horizon',
  },
  {
    id: 'rising',
    title: 'Rising Star under 30',
    nominees: ['Zara Ahmed', 'Ben Foster', 'Isla MacPherson'],
    winner: 'Zara Ahmed',
  },
  {
    id: 'choice',
    title: "Colleague's Choice",
    nominees: ['Hidden until ceremony'],
    winner: 'The Client Success Team',
    hiddenUntil: EVENT.reveal,
  },
];

export const FLOOR_PLANS: FloorPlan[] = [
  {
    id: 'G',
    label: 'G',
    name: 'Ground floor',
    rooms: [
      { id: 'foyer', name: 'Main foyer', x: 20, y: 30, w: 170, h: 86, kind: 'reception' },
      { id: 'registration', name: 'Registration', x: 210, y: 30, w: 130, h: 86 },
      { id: 'entrance', name: 'Main entrance', x: 20, y: 142, w: 320, h: 50, kind: 'exit' },
      { id: 'cloakroom', name: 'Cloakroom', x: 20, y: 214, w: 132, h: 58 },
      { id: 'seating', name: 'Breakout seating', x: 176, y: 214, w: 164, h: 58 },
    ],
  },
  {
    id: '1',
    label: '1',
    name: 'Level 1',
    rooms: [
      { id: 'auditorium', name: 'Main auditorium', x: 18, y: 28, w: 322, h: 154, kind: 'main' },
      { id: 'meeting', name: 'Meeting room', x: 18, y: 208, w: 144, h: 64 },
      { id: 'av', name: 'AV support', x: 188, y: 208, w: 152, h: 64 },
    ],
  },
  {
    id: '2',
    label: '2',
    name: 'Level 2',
    rooms: [
      { id: 'aldgate', name: 'Room Aldgate', x: 18, y: 28, w: 150, h: 90, kind: 'breakout' },
      { id: 'bishopsgate', name: 'Room Bishopsgate', x: 190, y: 28, w: 150, h: 90, kind: 'breakout' },
      { id: 'fenchurch', name: 'Room Fenchurch', x: 18, y: 146, w: 150, h: 90, kind: 'breakout' },
      { id: 'pods', name: 'Breakout pods', x: 190, y: 146, w: 150, h: 90 },
    ],
  },
  {
    id: '3',
    label: '3',
    name: 'Level 3',
    rooms: [
      { id: 'sky-terrace', name: 'Sky Terrace', x: 18, y: 28, w: 322, h: 122, kind: 'dining' },
      { id: 'outdoor', name: 'Outdoor terrace', x: 18, y: 176, w: 322, h: 84 },
    ],
  },
];

export const DIETARY_GROUPS = [
  { label: 'Standard', count: 60 },
  { label: 'Vegetarian', count: 25 },
  { label: 'Vegan', count: 12 },
  { label: 'Gluten-free', count: 8 },
  { label: 'Halal', count: 10 },
  { label: 'Kosher', count: 5 },
];

export const DEFAULT_STREAMS: Record<string, string> = {
  'd1-breakout1': 'd1-breakout1-C',
  'd1-breakout2': 'd1-breakout2-A',
};

export const ADMIN_SEED = {
  attendeeOpens: 112,
  qAndAExported: 18,
  feedbackAverage: 4.6,
};
