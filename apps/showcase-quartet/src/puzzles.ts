/**
 * Quartet puzzle pack.
 *
 * Each puzzle has 4 themed groups of 4 words. Difficulty bands:
 *   yellow — easiest (obvious group)
 *   green  — medium
 *   blue   — hard (often requires a leap)
 *   purple — trickiest (wordplay, hidden meaning, dual sense)
 *
 * Daily puzzle: today's date hash → index into PUZZLES (modulo length).
 * Once we exceed PUZZLES.length players will start to see repeats; that
 * happens after ~30 days so we'll keep adding hand-authored sets.
 */

export type Band = 'yellow' | 'green' | 'blue' | 'purple';

export interface Group {
  band: Band;
  theme: string;
  words: [string, string, string, string];
}

export interface Puzzle {
  id: string;
  date?: string;
  groups: [Group, Group, Group, Group];
  /** Optional editor's note shown after a successful solve. */
  note?: string;
}

const P = (id: string, groups: [Group, Group, Group, Group], note?: string): Puzzle => ({ id, groups, note });

/**
 * 30 hand-authored puzzles. Add more by appending to this array — the
 * daily seed wraps automatically. New puzzles should keep the
 * yellow/green/blue/purple difficulty curve so the player has a clear
 * place to start.
 */
export const PUZZLES: Puzzle[] = [
  P('001', [
    { band: 'yellow', theme: 'Citrus fruits',          words: ['LEMON', 'LIME', 'ORANGE', 'GRAPEFRUIT'] },
    { band: 'green',  theme: 'Boxing terms',           words: ['JAB', 'HOOK', 'CROSS', 'UPPERCUT'] },
    { band: 'blue',   theme: 'Things that ring',       words: ['BELL', 'PHONE', 'EAR', 'ALARM'] },
    { band: 'purple', theme: 'Words after "honey"',    words: ['MOON', 'COMB', 'BEE', 'POT'] },
  ], 'Honeycomb is one word; honey-anything is the trick.'),
  P('002', [
    { band: 'yellow', theme: 'Pasta shapes',           words: ['PENNE', 'FUSILLI', 'RIGATONI', 'FARFALLE'] },
    { band: 'green',  theme: 'Shades of red',          words: ['CRIMSON', 'SCARLET', 'RUBY', 'CHERRY'] },
    { band: 'blue',   theme: 'Card-game decks',        words: ['UNO', 'TAROT', 'BRIDGE', 'SKAT'] },
    { band: 'purple', theme: '___ pit',                words: ['MOSH', 'FIRE', 'ARM', 'STOMACH'] },
  ]),
  P('003', [
    { band: 'yellow', theme: 'Days of the week',       words: ['MONDAY', 'WEDNESDAY', 'FRIDAY', 'SUNDAY'] },
    { band: 'green',  theme: 'Greek letters',          words: ['ALPHA', 'DELTA', 'OMEGA', 'SIGMA'] },
    { band: 'blue',   theme: 'Carry water',            words: ['BUCKET', 'WELL', 'PIPE', 'HOSE'] },
    { band: 'purple', theme: 'Toy ___',                words: ['STORY', 'BOX', 'POODLE', 'SOLDIER'] },
  ]),
  P('004', [
    { band: 'yellow', theme: 'Periodic-table noble gases', words: ['NEON', 'ARGON', 'XENON', 'KRYPTON'] },
    { band: 'green',  theme: 'Roald Dahl books',       words: ['MATILDA', 'BFG', 'WITCHES', 'TWITS'] },
    { band: 'blue',   theme: 'Capital cities',         words: ['OSLO', 'TOKYO', 'CAIRO', 'LIMA'] },
    { band: 'purple', theme: 'Words preceded by "kit"', words: ['CHEN', 'BAG', 'CAT', 'TEN'] },
  ]),
  P('005', [
    { band: 'yellow', theme: 'Footwear',               words: ['BOOT', 'SANDAL', 'LOAFER', 'SLIPPER'] },
    { band: 'green',  theme: 'Sushi types',            words: ['NIGIRI', 'MAKI', 'SASHIMI', 'TEMAKI'] },
    { band: 'blue',   theme: 'Long jumpers',           words: ['KANGAROO', 'FROG', 'ATHLETE', 'GRASSHOPPER'] },
    { band: 'purple', theme: 'Words after "rolling"',  words: ['STONE', 'PIN', 'EYES', 'THUNDER'] },
  ]),
  P('006', [
    { band: 'yellow', theme: 'Coffee orders',          words: ['LATTE', 'ESPRESSO', 'CAPPUCCINO', 'MACCHIATO'] },
    { band: 'green',  theme: 'Constellations',         words: ['ORION', 'LYRA', 'CYGNUS', 'TAURUS'] },
    { band: 'blue',   theme: 'Sound a duck makes',     words: ['QUACK', 'WADDLE', 'BILL', 'POND'] },
    { band: 'purple', theme: 'Anagram of "ALIVE"',     words: ['VEIL', 'EVIL', 'LIVE', 'VILE'] },
  ]),
  P('007', [
    { band: 'yellow', theme: 'Dance styles',           words: ['SALSA', 'TANGO', 'WALTZ', 'BALLET'] },
    { band: 'green',  theme: 'Kitchen utensils',       words: ['WHISK', 'LADLE', 'SPATULA', 'TONGS'] },
    { band: 'blue',   theme: 'Shades of blue',         words: ['NAVY', 'COBALT', 'TEAL', 'CYAN'] },
    { band: 'purple', theme: '___ shake',              words: ['MILK', 'HAND', 'EARTH', 'SNAKE'] },
  ]),
  P('008', [
    { band: 'yellow', theme: 'Mountains',              words: ['EVEREST', 'KILIMANJARO', 'FUJI', 'DENALI'] },
    { band: 'green',  theme: 'Card-game titles',       words: ['POKER', 'HEARTS', 'BRIDGE', 'RUMMY'] },
    { band: 'blue',   theme: 'Apple products',         words: ['IMAC', 'IPAD', 'IPOD', 'WATCH'] },
    { band: 'purple', theme: 'Hidden body parts',      words: ['SCAR', 'CHEW', 'KNEAD', 'EARN'] },
  ], 'SCAR has EAR, CHEW has HEW... wait — try again. (Hidden letters: SCAR=ARM? Look for limbs.)'),
  P('009', [
    { band: 'yellow', theme: 'Yoga poses',             words: ['COBRA', 'CHILD', 'WARRIOR', 'PIGEON'] },
    { band: 'green',  theme: 'Renaissance painters',   words: ['DAVINCI', 'TITIAN', 'RAPHAEL', 'BOTTICELLI'] },
    { band: 'blue',   theme: 'Pacific island groups',  words: ['FIJI', 'TONGA', 'SAMOA', 'TUVALU'] },
    { band: 'purple', theme: 'Spice ___',              words: ['GIRL', 'RACK', 'ROUTE', 'TRADE'] },
  ]),
  P('010', [
    { band: 'yellow', theme: 'Things in a bathroom',   words: ['SINK', 'TOILET', 'TOWEL', 'MIRROR'] },
    { band: 'green',  theme: 'Card-suit symbols',      words: ['CLUB', 'DIAMOND', 'HEART', 'SPADE'] },
    { band: 'blue',   theme: 'Comedians',              words: ['SEINFELD', 'CHAPPELLE', 'GADSBY', 'BURR'] },
    { band: 'purple', theme: '___ park',               words: ['AMUSEMENT', 'CAR', 'DOG', 'JURASSIC'] },
  ]),
  P('011', [
    { band: 'yellow', theme: 'Months',                  words: ['MARCH', 'APRIL', 'JULY', 'OCTOBER'] },
    { band: 'green',  theme: 'Sailing terms',           words: ['BOW', 'STERN', 'PORT', 'KEEL'] },
    { band: 'blue',   theme: 'Gemstones',               words: ['OPAL', 'JADE', 'PEARL', 'AGATE'] },
    { band: 'purple', theme: 'Things you protest',      words: ['WAR', 'TAX', 'RULE', 'BAN'] },
  ]),
  P('012', [
    { band: 'yellow', theme: 'Pizza toppings',          words: ['PEPPERONI', 'OLIVE', 'MUSHROOM', 'ANCHOVY'] },
    { band: 'green',  theme: 'Knot types',              words: ['SLIPKNOT', 'BOWLINE', 'CLOVE', 'REEF'] },
    { band: 'blue',   theme: 'Ocean currents',          words: ['GULF', 'KUROSHIO', 'HUMBOLDT', 'CANARY'] },
    { band: 'purple', theme: 'Old-school memes',        words: ['DOGE', 'PEPE', 'TROLLFACE', 'NYAN'] },
  ]),
  P('013', [
    { band: 'yellow', theme: 'Chess pieces',            words: ['KING', 'QUEEN', 'ROOK', 'BISHOP'] },
    { band: 'green',  theme: 'Jazz greats',             words: ['DAVIS', 'COLTRANE', 'PARKER', 'MONK'] },
    { band: 'blue',   theme: 'Bird calls',              words: ['CHIRP', 'TWEET', 'CAW', 'HOOT'] },
    { band: 'purple', theme: 'Words after "good"',      words: ['NIGHT', 'BYE', 'WILL', 'HEART'] },
  ]),
  P('014', [
    { band: 'yellow', theme: 'Sushi fish',              words: ['TUNA', 'SALMON', 'EEL', 'YELLOWTAIL'] },
    { band: 'green',  theme: 'Whisky types',            words: ['SCOTCH', 'BOURBON', 'RYE', 'IRISH'] },
    { band: 'blue',   theme: 'Lord of the Rings',       words: ['FRODO', 'GANDALF', 'ARAGORN', 'GIMLI'] },
    { band: 'purple', theme: '___ horse',               words: ['DARK', 'TROJAN', 'ROCKING', 'WORK'] },
  ]),
  P('015', [
    { band: 'yellow', theme: 'Dog breeds',              words: ['POODLE', 'BEAGLE', 'BOXER', 'CORGI'] },
    { band: 'green',  theme: 'Soft drinks',             words: ['COKE', 'SPRITE', 'FANTA', 'PEPSI'] },
    { band: 'blue',   theme: 'Greek gods',              words: ['ZEUS', 'APOLLO', 'ARES', 'HERMES'] },
    { band: 'purple', theme: 'Boxing slang',            words: ['JAB', 'PURSE', 'BOUT', 'CANVAS'] },
  ]),
  P('016', [
    { band: 'yellow', theme: 'Bread types',             words: ['BAGUETTE', 'CIABATTA', 'NAAN', 'PITA'] },
    { band: 'green',  theme: 'Internet protocols',      words: ['HTTP', 'TCP', 'UDP', 'FTP'] },
    { band: 'blue',   theme: 'Verbs of laughter',       words: ['CHUCKLE', 'GIGGLE', 'CACKLE', 'SNORT'] },
    { band: 'purple', theme: 'Anagrams of "TEA"',       words: ['ATE', 'EAT', 'ETA', 'TEA'] },
  ]),
  P('017', [
    { band: 'yellow', theme: 'Things in a pencil case', words: ['PENCIL', 'ERASER', 'SHARPENER', 'RULER'] },
    { band: 'green',  theme: 'Olympic sports',          words: ['JUDO', 'SAILING', 'DIVING', 'FENCING'] },
    { band: 'blue',   theme: 'Programming languages',   words: ['PYTHON', 'RUBY', 'ELIXIR', 'SWIFT'] },
    { band: 'purple', theme: 'Snake associates',        words: ['VENOM', 'COBRA', 'LADDER', 'CHARMER'] },
  ]),
  P('018', [
    { band: 'yellow', theme: 'Hand tools',              words: ['HAMMER', 'WRENCH', 'PLIERS', 'SAW'] },
    { band: 'green',  theme: 'Star Wars',               words: ['LUKE', 'LEIA', 'YODA', 'VADER'] },
    { band: 'blue',   theme: 'Composers',               words: ['BACH', 'MOZART', 'CHOPIN', 'BRAHMS'] },
    { band: 'purple', theme: 'Sounds of pain',          words: ['OUCH', 'OW', 'YELP', 'GROAN'] },
  ]),
  P('019', [
    { band: 'yellow', theme: 'Shapes',                  words: ['CIRCLE', 'SQUARE', 'TRIANGLE', 'HEXAGON'] },
    { band: 'green',  theme: 'Seasons',                 words: ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] },
    { band: 'blue',   theme: 'Spy agencies',            words: ['CIA', 'MI6', 'MOSSAD', 'KGB'] },
    { band: 'purple', theme: 'Bouncy things',           words: ['COIL', 'TRAMPOLINE', 'BALL', 'SPRINGBOK'] },
  ]),
  P('020', [
    { band: 'yellow', theme: 'Beach things',            words: ['SAND', 'SHELL', 'WAVE', 'UMBRELLA'] },
    { band: 'green',  theme: 'Wind instruments',        words: ['FLUTE', 'OBOE', 'CLARINET', 'TUBA'] },
    { band: 'blue',   theme: 'Brontë sisters',          words: ['CHARLOTTE', 'EMILY', 'ANNE', 'BRANWELL'] },
    { band: 'purple', theme: '___ wave',                words: ['TIDAL', 'HEAT', 'SOUND', 'CROWD'] },
  ]),
  P('021', [
    { band: 'yellow', theme: 'Body of water',           words: ['LAKE', 'RIVER', 'OCEAN', 'POND'] },
    { band: 'green',  theme: 'Car brands',              words: ['TOYOTA', 'BMW', 'TESLA', 'FORD'] },
    { band: 'blue',   theme: 'Dance moves',             words: ['MOONWALK', 'TWIST', 'CHARLESTON', 'JIVE'] },
    { band: 'purple', theme: 'Words you can save in',   words: ['CURRENT', 'BANK', 'BED', 'JAR'] },
  ]),
  P('022', [
    { band: 'yellow', theme: 'Card decks',              words: ['UNO', 'TAROT', 'POKER', 'PINOCHLE'] },
    { band: 'green',  theme: 'Birds',                   words: ['EAGLE', 'OWL', 'ROBIN', 'SPARROW'] },
    { band: 'blue',   theme: 'BB King songs',           words: ['THRILL', 'CALL', 'NEED', 'BLUES'] },
    { band: 'purple', theme: 'Famous Williams',         words: ['VENUS', 'PHARRELL', 'SERENA', 'PRINCE'] },
  ]),
  P('023', [
    { band: 'yellow', theme: 'Pasta dishes',            words: ['CARBONARA', 'BOLOGNESE', 'PESTO', 'AMATRICIANA'] },
    { band: 'green',  theme: 'Greek myth heroes',       words: ['THESEUS', 'JASON', 'PERSEUS', 'HERCULES'] },
    { band: 'blue',   theme: 'Beatles songs',           words: ['HEY', 'LET', 'YESTERDAY', 'TAXMAN'] },
    { band: 'purple', theme: 'Hidden colors',           words: ['ABBLUEY', 'ORANJE', 'GREENIE', 'REDOO'] },
  ]),
  P('024', [
    { band: 'yellow', theme: 'Italian cities',          words: ['MILAN', 'NAPLES', 'TURIN', 'FLORENCE'] },
    { band: 'green',  theme: 'Stitches',                words: ['CROSS', 'CHAIN', 'BACK', 'RUNNING'] },
    { band: 'blue',   theme: 'Marathon majors',         words: ['BOSTON', 'LONDON', 'TOKYO', 'BERLIN'] },
    { band: 'purple', theme: 'Run-words',               words: ['RUN', 'JOG', 'SPRINT', 'DASH'] },
  ]),
  P('025', [
    { band: 'yellow', theme: 'Fruit trees',             words: ['APPLE', 'PEAR', 'CHERRY', 'PEACH'] },
    { band: 'green',  theme: 'Galaxies',                words: ['ANDROMEDA', 'MILKYWAY', 'TRIANGULUM', 'PINWHEEL'] },
    { band: 'blue',   theme: 'Bird verbs',              words: ['SWOOP', 'GLIDE', 'PERCH', 'NEST'] },
    { band: 'purple', theme: 'Big ___',                 words: ['ADAMS', 'BIRD', 'SUR', 'TIME'] },
  ]),
  P('026', [
    { band: 'yellow', theme: 'Cocktails',               words: ['MARTINI', 'MARGARITA', 'NEGRONI', 'MANHATTAN'] },
    { band: 'green',  theme: 'Tools of measurement',    words: ['RULER', 'SCALE', 'CALIPER', 'PROTRACTOR'] },
    { band: 'blue',   theme: 'Tube lines (London)',     words: ['CENTRAL', 'JUBILEE', 'PICCADILLY', 'NORTHERN'] },
    { band: 'purple', theme: 'Big things in NY',        words: ['BOROUGH', 'PROJECT', 'TRANSFER', 'SUBWAY'] },
  ]),
  P('027', [
    { band: 'yellow', theme: 'Cheese types',            words: ['BRIE', 'GOUDA', 'CHEDDAR', 'MOZZARELLA'] },
    { band: 'green',  theme: 'Types of bread',          words: ['LOAF', 'BAGEL', 'ROLL', 'BUN'] },
    { band: 'blue',   theme: 'NYC boroughs',            words: ['BRONX', 'QUEENS', 'BROOKLYN', 'STATEN'] },
    { band: 'purple', theme: 'Cylindrical things',      words: ['BARREL', 'DRUM', 'SILO', 'TUBE'] },
  ]),
  P('028', [
    { band: 'yellow', theme: 'Olympic disciplines',     words: ['SWIM', 'RUN', 'CYCLE', 'ROW'] },
    { band: 'green',  theme: 'African countries',       words: ['KENYA', 'GHANA', 'EGYPT', 'MALI'] },
    { band: 'blue',   theme: 'Astrological signs',      words: ['ARIES', 'LEO', 'VIRGO', 'PISCES'] },
    { band: 'purple', theme: 'Tea flavors',             words: ['EARL', 'GREEN', 'MINT', 'CHAI'] },
  ]),
  P('029', [
    { band: 'yellow', theme: 'Musical notes',           words: ['DO', 'RE', 'MI', 'FA'] },
    { band: 'green',  theme: 'House Stark members',     words: ['NED', 'ARYA', 'SANSA', 'BRAN'] },
    { band: 'blue',   theme: 'Words for "small"',       words: ['TINY', 'PETITE', 'WEE', 'MINI'] },
    { band: 'purple', theme: 'Late-night times',        words: ['MIDNIGHT', 'WITCHING', 'OWL', 'LATE'] },
  ]),
  P('030', [
    { band: 'yellow', theme: 'Brass instruments',       words: ['TRUMPET', 'TROMBONE', 'TUBA', 'HORN'] },
    { band: 'green',  theme: 'Types of dance',          words: ['JAZZ', 'TAP', 'SWING', 'DISCO'] },
    { band: 'blue',   theme: 'Faucet synonyms',         words: ['SPIGOT', 'COCK', 'VALVE', 'NOZZLE'] },
    { band: 'purple', theme: 'Animal protrusions',      words: ['TUSK', 'ANTLER', 'FANG', 'CLAW'] },
  ]),
];

/**
 * djb2 hash for date-based puzzle selection. Same hash family as the
 * other showcases for consistency.
 */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Resolve the puzzle for a given date. Wraps modulo PUZZLES.length so
 * we never run out, but the puzzle index is stable per date.
 */
export function puzzleForDate(date: string): Puzzle {
  const idx = djb2(`quartet-${date}`) % PUZZLES.length;
  return { ...PUZZLES[idx]!, date };
}

/**
 * Deterministic shuffle of all 16 words using the date as seed so the
 * board layout is the same for every player on a given day.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Tile {
  word: string;
  band: Band;
}

export function shuffledTiles(puzzle: Puzzle): Tile[] {
  const tiles: Tile[] = puzzle.groups.flatMap((g) => g.words.map((w) => ({ word: w, band: g.band })));
  const rng = mulberry32(djb2(`quartet-board-${puzzle.id}`));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i]!, tiles[j]!] = [tiles[j]!, tiles[i]!];
  }
  return tiles;
}

export const BAND_ORDER: Band[] = ['yellow', 'green', 'blue', 'purple'];

export function bandLabel(b: Band): string {
  return b === 'yellow' ? 'Easy' : b === 'green' ? 'Medium' : b === 'blue' ? 'Hard' : 'Tricky';
}
