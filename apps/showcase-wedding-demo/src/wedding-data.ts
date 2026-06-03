export type Diet = 'standard' | 'vegetarian' | 'vegan' | 'children';

export interface TimelineItem {
  minutes: number;
  time: string;
  title: string;
  place: string;
  note?: string;
}

export interface TablePlan {
  number: number;
  name: string;
  seats: string[];
  note: string;
}

export interface Guest {
  name: string;
  table: number;
  tableName: string;
  diet: Diet;
}

export interface MenuCourse {
  course: string;
  text: string;
  allergens: string;
}

export interface MenuOption {
  key: Diet;
  label: string;
  wine: string;
  courses: MenuCourse[];
}

export const COUPLE = {
  names: 'Charlotte & James',
  fullNames: 'Charlotte Emma Blackwood & James Oliver Hartley',
  date: '14th June 2026',
  isoDate: '2026-06-14',
  venue: 'Babington House, Somerset',
  venueFull: 'Babington House, Babington, Frome, Somerset BA11 3RW',
  welcome: 'Welcome. Everything you need for today is in your pocket.',
};

export const TIMELINE: TimelineItem[] = [
  {
    minutes: 12 * 60 + 30,
    time: '12:30 PM',
    title: 'Guests arrive',
    place: 'The Orangery, ground floor',
    note: 'Welcome drinks',
  },
  {
    minutes: 13 * 60,
    time: '1:00 PM',
    title: 'Wedding Ceremony',
    place: 'The Chapel, east wing',
    note: 'Please be seated by 12:50pm',
  },
  {
    minutes: 14 * 60,
    time: '2:00 PM',
    title: 'Photographs',
    place: 'The Walled Garden',
  },
  {
    minutes: 14 * 60 + 30,
    time: '2:30 PM',
    title: 'Champagne Reception',
    place: 'The Terrace and Croquet Lawn',
    note: 'Arancini, smoked salmon blini, heritage tomato bruschetta',
  },
  {
    minutes: 16 * 60,
    time: '4:00 PM',
    title: 'Speeches',
    place: 'The Cowshed, main barn',
  },
  {
    minutes: 17 * 60,
    time: '5:00 PM',
    title: 'Drinks and lawn games',
    place: 'Garden and terrace',
  },
  {
    minutes: 18 * 60 + 30,
    time: '6:30 PM',
    title: 'Wedding Breakfast',
    place: 'The Cowshed, main barn',
  },
  {
    minutes: 20 * 60 + 30,
    time: '8:30 PM',
    title: 'Evening Reception opens',
    place: 'The Cowshed',
    note: 'Wedding cake served. Additional evening guests arrive.',
  },
  {
    minutes: 21 * 60,
    time: '9:00 PM',
    title: 'First dance',
    place: 'The Cowshed',
  },
  {
    minutes: 21 * 60 + 30,
    time: '9:30 PM',
    title: 'The Regent Street Band',
    place: 'The Cowshed',
    note: 'Playing until midnight',
  },
  {
    minutes: 23 * 60 + 30,
    time: '11:30 PM',
    title: 'Last orders',
    place: 'The main bar',
  },
  {
    minutes: 24 * 60,
    time: '12:00 AM',
    title: 'Carriages',
    place: 'Main entrance',
  },
];

export const TABLES: TablePlan[] = [
  {
    number: 1,
    name: 'The Rose Table',
    note: 'Top table, centred in front of the garden doors.',
    seats: [
      'Charlotte Blackwood',
      'James Hartley',
      'Elizabeth Blackwood',
      'Richard Blackwood',
      'Patricia Hartley',
      'Michael Hartley',
      'Sophie Walsh',
      'Tom Griffiths',
    ],
  },
  {
    number: 2,
    name: 'The Wisteria Table',
    note: 'Left side of the barn, near the long window.',
    seats: [
      'George Blackwood',
      'Harriet Blackwood',
      'William Blackwood',
      'Amelia Chen',
      'Robert Blackwood',
      'Catherine Blackwood',
      'Edward Walsh',
      'Lucy Walsh',
    ],
  },
  {
    number: 3,
    name: 'The Lavender Table',
    note: 'Left centre, beside the aisle to the terrace.',
    seats: [
      'Daniel Hartley',
      'Rachel Hartley',
      'Oliver Hartley Jr',
      'Isabelle Martin',
      'Benjamin Hartley',
      'Emma Hartley',
      'Christopher Jones',
      'Victoria Jones',
    ],
  },
  {
    number: 4,
    name: 'The Primrose Table',
    note: 'Near the fireplace, facing the top table.',
    seats: [
      'Alexander Murray',
      'Francesca Murray',
      'Sebastian Clarke',
      'Penelope Clarke',
      'Hugo Bennett',
      'Arabella Bennett',
      'Nathaniel Shaw',
      'Cordelia Shaw',
    ],
  },
  {
    number: 5,
    name: 'The Foxglove Table',
    note: 'Right centre, by the floral arch.',
    seats: [
      'Rupert Thorne',
      'Imogen Thorne',
      'Jasper Whitfield',
      'Clarissa Whitfield',
      'Monty Forsythe',
      'Beatrice Forsythe',
      'Kit Langley',
      'Felicity Langley',
    ],
  },
  {
    number: 6,
    name: 'The Bluebell Table',
    note: 'Far right corner of the barn, near the windows.',
    seats: [
      'James Morrison',
      'Sarah Morrison',
      "Patrick O'Brien",
      "Siobhan O'Brien",
      'Callum MacPherson',
      'Fiona MacPherson',
      'Devante Osei',
      'Charlotte Osei',
    ],
  },
  {
    number: 7,
    name: 'The Cornflower Table',
    note: 'Beside the terrace doors, close to the gardens.',
    seats: [
      'Priya Patel',
      'Rohan Patel',
      'Aisha Ahmed',
      'Tariq Ahmed',
      'Mei Lin',
      'David Chen',
      'Nina Kowalski',
      'Piotr Kowalski',
    ],
  },
  {
    number: 8,
    name: 'The Poppy Table',
    note: 'Centre aisle, second row from the entrance.',
    seats: [
      'Florence Reed',
      'Arthur Reed',
      'Matilda Green',
      'Oscar Green',
      'Daisy Thompson',
      'Henry Thompson',
      'Rose Williams',
      'Jack Williams',
    ],
  },
  {
    number: 9,
    name: 'The Peony Table',
    note: 'Right side of the barn, near the evening band area.',
    seats: [
      'Eva Bergstrom',
      'Lars Bergstrom',
      'Chiara Romano',
      'Marco Romano',
      'Astrid Lindqvist',
      'Erik Lindqvist',
      'Yuki Tanaka',
      'Kenji Tanaka',
    ],
  },
  {
    number: 10,
    name: 'The Daisy Table',
    note: 'Evening guest table, close to the bar.',
    seats: [
      'Marcus Hughes',
      'Jade Hughes',
      'Tyler Banks',
      'Chloe Banks',
      'Reece Jordan',
      'Amber Jordan',
      'Leon Foster',
      'Naomi Foster',
    ],
  },
  {
    number: 11,
    name: "The Meadow Table",
    note: "Children's table, beside the family tables.",
    seats: [
      'Archie Blackwood (8)',
      'Poppy Walsh (7)',
      'Freddie Hartley (9)',
      'Daisy Bennett (6)',
      'Theo Clarke (10)',
      'Lily Shaw (5)',
      'George Morrison (11)',
      'Isla MacPherson (8)',
    ],
  },
  {
    number: 12,
    name: 'The Herb Garden Table',
    note: 'Evening guests, nearest the dance floor.',
    seats: [
      'Maya Brooks',
      'Elliot Brooks',
      'Grace Fletcher',
      'Samuel Fletcher',
      'Rebecca Price',
      'Joshua Price',
      'Olivia Simmonds',
      'Theo Simmonds',
      'Hannah Wood',
      'Isaac Wood',
      'Freya Knight',
      'Louis Knight',
      'Erin Hughes',
      'Dylan Hughes',
      'Molly Carter',
      'Jacob Carter',
      'Sophie Lane',
      'Daniel Lane',
      'Alice Warren',
      'Luke Warren',
    ],
  },
];

const DIET_OVERRIDES: Record<string, Diet> = {
  'Amelia Chen': 'vegetarian',
  'Isabelle Martin': 'vegetarian',
  'Cordelia Shaw': 'vegan',
  'Priya Patel': 'vegetarian',
  'Rohan Patel': 'vegetarian',
  'Aisha Ahmed': 'vegan',
  'Mei Lin': 'vegetarian',
  'David Chen': 'standard',
  'Nina Kowalski': 'vegan',
  'Yuki Tanaka': 'vegetarian',
  'Kenji Tanaka': 'standard',
  'Archie Blackwood (8)': 'children',
  'Poppy Walsh (7)': 'children',
  'Freddie Hartley (9)': 'children',
  'Daisy Bennett (6)': 'children',
  'Theo Clarke (10)': 'children',
  'Lily Shaw (5)': 'children',
  'George Morrison (11)': 'children',
  'Isla MacPherson (8)': 'children',
};

export const GUESTS: Guest[] = TABLES.flatMap((table) =>
  table.seats.map((name) => ({
    name,
    table: table.number,
    tableName: table.name,
    diet: DIET_OVERRIDES[name] ?? 'standard',
  })),
);

export const MENUS: Record<Diet, MenuOption> = {
  standard: {
    key: 'standard',
    label: 'Standard menu',
    wine: 'Somerset Bacchus with the starter, claret with the beef.',
    courses: [
      {
        course: 'Starter',
        text: 'Seared hand-dived scallops, Cornish crab butter, compressed cucumber, caviar',
        allergens: 'Shellfish, fish, milk',
      },
      {
        course: 'Main',
        text: 'Slow-roasted Hereford beef fillet, bone marrow crust, dauphinoise potato, heritage carrots, red wine jus',
        allergens: 'Milk, celery, sulphites',
      },
      {
        course: 'Dessert',
        text: 'Valrhona chocolate fondant, salted caramel ice cream, honeycomb',
        allergens: 'Eggs, milk, gluten',
      },
    ],
  },
  vegetarian: {
    key: 'vegetarian',
    label: 'Vegetarian',
    wine: 'English rose with the tarte tatin, white Burgundy with risotto.',
    courses: [
      {
        course: 'Starter',
        text: 'Heritage tomato tarte tatin, burrata, aged balsamic, micro herbs',
        allergens: 'Milk, gluten, sulphites',
      },
      {
        course: 'Main',
        text: 'Wild mushroom and truffle risotto, aged Parmesan, truffle oil, crispy sage',
        allergens: 'Milk, celery',
      },
      {
        course: 'Dessert',
        text: 'Valrhona chocolate fondant, salted caramel ice cream, honeycomb',
        allergens: 'Eggs, milk, gluten',
      },
    ],
  },
  vegan: {
    key: 'vegan',
    label: 'Vegan',
    wine: 'Organic Chenin Blanc with the soup, Pinot Noir with the Wellington.',
    courses: [
      {
        course: 'Starter',
        text: 'Roasted red pepper and butternut soup, coconut cream, toasted pepitas',
        allergens: 'Prepared in a kitchen handling nuts',
      },
      {
        course: 'Main',
        text: 'Butternut squash and spinach Wellington, wild mushroom sauce, seasonal greens',
        allergens: 'Gluten, celery',
      },
      {
        course: 'Dessert',
        text: 'Dark chocolate and raspberry torte, raspberry coulis',
        allergens: 'Gluten, soya',
      },
    ],
  },
  children: {
    key: 'children',
    label: "Children's",
    wine: 'Apple juice, elderflower presse, and water are on the table.',
    courses: [
      { course: 'Starter', text: 'Garlic bread', allergens: 'Gluten, milk' },
      { course: 'Main', text: 'Chicken goujons, chunky chips, peas', allergens: 'Gluten, eggs' },
      { course: 'Dessert', text: 'Chocolate brownie and vanilla ice cream', allergens: 'Eggs, milk, gluten' },
    ],
  },
};

export const INFO = {
  gettingHere: [
    ['Train', 'London Paddington to Frome - 1hr 40min, then 10min taxi'],
    ['Nearest train', 'Westbury - 15min taxi'],
    ['Taxi', 'Frome Taxis 01373 463434'],
    ['Car', '2 hours from London via M4/A361'],
  ],
  accommodation: [
    ['On-site', 'Babington House has 33 rooms, all reserved by the couple'],
    ['Reservations', 'reservations@babingtonhouse.co.uk'],
    ['The Crown at Beckington', '01373 831409'],
    ['Longleat Holiday Cottages', '01985 844400'],
  ],
  contacts: [
    ['Venue coordinator', 'Emma Wilson 07700 900001'],
    ['Wedding planner', 'Kate Forsythe 07700 900002'],
    ['Best man', 'Tom Griffiths 07700 900003'],
  ],
  theDay: [
    ['Dress code', 'Black tie optional / Morning dress for the ceremony'],
    ['Shoes', 'Please wear something you can dance in'],
    ['Cake', 'Four-tier Victoria sponge with elderflower cream and Somerset strawberries'],
    ['Evening', 'The Regent Street Band plays from 9:30pm until midnight'],
  ],
};

export const SEEDED_SONGS = [
  { id: 'seed-1', song: 'Dancing Queen', artist: 'ABBA', note: 'Someone requested from table 6' },
  { id: 'seed-2', song: 'Mr Brightside', artist: 'The Killers', note: 'Someone requested' },
  { id: 'seed-3', song: 'September', artist: 'Earth Wind & Fire', note: 'Someone requested' },
  { id: 'seed-4', song: 'Valerie', artist: 'Amy Winehouse', note: 'Someone requested' },
  { id: 'seed-5', song: 'Rather Be', artist: 'Clean Bandit', note: 'Someone requested' },
];
