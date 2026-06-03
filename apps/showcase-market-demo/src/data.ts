export type VendorCategory =
  | 'meat'
  | 'produce'
  | 'bakery'
  | 'dairy'
  | 'drinks'
  | 'crafts'
  | 'plants';

export interface VendorCategoryMeta {
  label: string;
  short: string;
  color: string;
}

export interface Vendor {
  id: string;
  name: string;
  category: VendorCategory;
  stall: string;
  row: string;
  description: string;
  farmer?: string;
  payment: string;
  regular?: boolean;
  featured?: boolean;
  newThisWeek?: boolean;
  veganFriendly?: boolean;
  organic?: boolean;
  away?: string;
  week?: string;
  bestKnown?: string;
  map: {
    row: number;
    slot: number;
    span: number;
  };
}

export interface MarketEvent {
  id: string;
  time: string;
  label: string;
  title: string;
  location: string;
  note: string;
  cost?: string;
  limited?: boolean;
}

export const MARKET = {
  name: 'Highbury Farmers Market',
  strapline: 'Real food. Local people. Every Sunday.',
  location: 'Highbury Fields',
  address: 'Entrance from Highbury Grove, London N5 2EF',
  hours: 'Every Sunday, 10:00 AM - 2:00 PM',
  established: '2011',
  social: '@highburyfarmersmarket',
  stalls: 20,
  theme: 'Early Summer - First Strawberries',
  about:
    "We started in 2011 with 8 stalls and a borrowed gazebo. This Sunday it's 20 featured stalls, rain or shine, and we've never missed a week. Everything sold here is produced within 100 miles of London. We check.",
};

export const CATEGORY_META: Record<VendorCategory, VendorCategoryMeta> = {
  meat: { label: 'Meat and fish', short: 'Meat', color: '#A8503C' },
  produce: { label: 'Fruit and vegetables', short: 'Produce', color: '#5E7B5C' },
  bakery: { label: 'Bread and bakery', short: 'Bakery', color: '#C4783C' },
  dairy: { label: 'Cheese and dairy', short: 'Dairy', color: '#B89B5E' },
  drinks: { label: 'Drinks', short: 'Drinks', color: '#8A5A6A' },
  crafts: { label: 'Artisan and crafts', short: 'Crafts', color: '#5A7385' },
  plants: { label: 'Plants', short: 'Plants', color: '#6E8B5A' },
};

export const FILTERS: Array<{ key: 'all' | VendorCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'produce', label: 'Produce' },
  { key: 'bakery', label: 'Bakery' },
  { key: 'meat', label: 'Meat' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'crafts', label: 'Crafts' },
  { key: 'plants', label: 'Plants' },
];

export const VENDORS: Vendor[] = [
  {
    id: 'ginger-pig',
    name: 'Ginger Pig',
    category: 'meat',
    stall: 'A1-A2',
    row: 'A',
    description: 'Heritage breed pork, lamb, beef.',
    farmer: 'Tim Wilson, North Yorkshire',
    payment: 'Cash and card',
    regular: true,
    week: 'Mutton shoulder, perfect for slow cooking',
    map: { row: 1, slot: 1, span: 2 },
  },
  {
    id: 'whole-ox',
    name: 'The Whole Ox',
    category: 'meat',
    stall: 'A3',
    row: 'A',
    description: 'Rare breed beef. Dry-aged on site.',
    farmer: 'Charles Bowen, Suffolk',
    payment: 'Card only',
    regular: true,
    map: { row: 1, slot: 3, span: 1 },
  },
  {
    id: 'steve-hatt',
    name: 'Steve Hatt Fish',
    category: 'meat',
    stall: 'A4-A5',
    row: 'A',
    description: 'Fresh fish direct from Billingsgate.',
    payment: 'Cash and card',
    newThisWeek: true,
    week: 'Line-caught sea bass, Cornish crab, smoked mackerel',
    map: { row: 1, slot: 4, span: 2 },
  },
  {
    id: 'suffolk-smokehouse',
    name: 'The Suffolk Smokehouse',
    category: 'meat',
    stall: 'A6',
    row: 'A',
    description: 'Hot and cold smoked fish, meat, cheese.',
    payment: 'Cash and card',
    regular: true,
    map: { row: 1, slot: 6, span: 1 },
  },
  {
    id: 'chegworth',
    name: 'Chegworth Valley',
    category: 'produce',
    stall: 'B1-B2',
    row: 'B',
    description: 'Kent fruit farm. Apples, pears, plums, soft fruit.',
    payment: 'Cash and card',
    regular: true,
    featured: true,
    week: 'First Highbury strawberries of the year',
    map: { row: 2, slot: 1, span: 2 },
  },
  {
    id: 'turnips',
    name: 'Turnips',
    category: 'produce',
    stall: 'B3-B4',
    row: 'B',
    description: 'Seasonal vegetables from their farm in Dorset.',
    payment: 'Cash and card',
    regular: true,
    organic: true,
    week: 'Asparagus season, purple sprouting broccoli, new season courgettes',
    map: { row: 2, slot: 3, span: 2 },
  },
  {
    id: 'shrub-sprout',
    name: 'Shrub & Sprout',
    category: 'produce',
    stall: 'B5',
    row: 'B',
    description: 'Microgreens, sprouts, edible flowers.',
    payment: 'Card only',
    veganFriendly: true,
    away: 'Away this week - back next Sunday',
    map: { row: 2, slot: 5, span: 1 },
  },
  {
    id: 'fern-verrow',
    name: 'Fern Verrow',
    category: 'produce',
    stall: 'B6',
    row: 'B',
    description: 'Biodynamic farm, Herefordshire. Unusual varieties only.',
    payment: 'Cash preferred',
    week: 'Rainbow chard, candy beetroot, heritage tomatoes',
    map: { row: 2, slot: 6, span: 1 },
  },
  {
    id: 'e5',
    name: 'E5 Bakehouse',
    category: 'bakery',
    stall: 'C1-C2',
    row: 'C',
    description: 'Sourdough, rye, whole grain. Everything stone-milled on site.',
    payment: 'Card only',
    featured: true,
    bestKnown: 'Dark rye loaf and olive focaccia',
    week: 'Summer fruit danish, apricot and almond tart',
    map: { row: 3, slot: 1, span: 2 },
  },
  {
    id: 'crosstown',
    name: 'Crosstown Doughnuts',
    category: 'bakery',
    stall: 'C3',
    row: 'C',
    description: 'Brioche doughnuts, vegan options.',
    payment: 'Card only',
    regular: true,
    week: 'Strawberry and cream, plus chocolate custard',
    map: { row: 3, slot: 3, span: 1 },
  },
  {
    id: 'dusty-knuckle',
    name: 'The Dusty Knuckle',
    category: 'bakery',
    stall: 'C4',
    row: 'C',
    description: 'Sourdough pizza, focaccia, pastries.',
    payment: 'Card only',
    regular: true,
    week: 'Breakfast pastries until they run out',
    map: { row: 3, slot: 4, span: 1 },
  },
  {
    id: 'neals-yard',
    name: "Neal's Yard Dairy",
    category: 'dairy',
    stall: 'D1-D2',
    row: 'D',
    description: 'The best of British cheese. Expert advice always available.',
    payment: 'Cash and card',
    regular: true,
    week: "Ask about the Montgomery's Cheddar - just cut",
    map: { row: 4, slot: 1, span: 2 },
  },
  {
    id: 'blackwoods',
    name: 'Blackwoods Cheese Company',
    category: 'dairy',
    stall: 'D3',
    row: 'D',
    description: 'Small-batch British cheese.',
    payment: 'Card only',
    week: 'Try the Morangie Brie today',
    map: { row: 4, slot: 3, span: 1 },
  },
  {
    id: 'raimes',
    name: 'Raimes Vineyard',
    category: 'drinks',
    stall: 'E1',
    row: 'E',
    description: 'English sparkling wine, Hampshire.',
    payment: 'Card only',
    week: 'Free tasting today',
    map: { row: 5, slot: 1, span: 1 },
  },
  {
    id: 'wily-fox',
    name: 'Wily Fox Brewing',
    category: 'drinks',
    stall: 'E2',
    row: 'E',
    description: 'East London craft beer and kombucha.',
    payment: 'Card only',
    regular: true,
    week: 'Summer Haze pale ale',
    map: { row: 5, slot: 2, span: 1 },
  },
  {
    id: 'brown-bear',
    name: 'Brown Bear Coffee',
    category: 'drinks',
    stall: 'E3',
    row: 'E',
    description: 'Speciality coffee, filter and espresso.',
    payment: 'Cash and card',
    regular: true,
    week: 'Loyalty scheme: 10 cups = 1 free',
    map: { row: 5, slot: 3, span: 1 },
  },
  {
    id: 'highbury-ceramics',
    name: 'Highbury Ceramics',
    category: 'crafts',
    stall: 'F1',
    row: 'F',
    description: 'Hand-thrown stoneware. Made in Highbury studio.',
    payment: 'Card only',
    map: { row: 6, slot: 1, span: 1 },
  },
  {
    id: 'soap-matters',
    name: 'Soap Matters',
    category: 'crafts',
    stall: 'F2',
    row: 'F',
    description: 'Natural soap, skincare, zero waste.',
    payment: 'Cash and card',
    veganFriendly: true,
    map: { row: 6, slot: 2, span: 1 },
  },
  {
    id: 'london-apiarist',
    name: 'The London Apiarist',
    category: 'crafts',
    stall: 'F3',
    row: 'F',
    description: 'Raw honey, beeswax products.',
    payment: 'Cash and card',
    week: 'First summer honey 2026',
    map: { row: 6, slot: 3, span: 1 },
  },
  {
    id: 'tendercare',
    name: 'Tendercare Nurseries',
    category: 'plants',
    stall: 'G1-G2',
    row: 'G',
    description: 'Seasonal plants, herbs, unusual varieties.',
    payment: 'Card only',
    regular: true,
    week: 'Lots of tomato plants for your garden',
    map: { row: 7, slot: 1, span: 2 },
  },
];

export const EVENTS: MarketEvent[] = [
  {
    id: 'asparagus-demo',
    time: '10:30 AM',
    label: 'Cooking Demo',
    title: 'Asparagus three ways',
    location: 'Community demo area, stall B4',
    note: 'With Turnips farm',
    cost: 'Free',
  },
  {
    id: 'music',
    time: '11:00 AM',
    label: 'Live Music',
    title: 'The Highbury Ukulele Collective',
    location: 'Central gathering area',
    note: 'Near the oak tree',
    cost: 'Free',
  },
  {
    id: 'cheese-masterclass',
    time: '12:00 PM',
    label: 'Cheese Masterclass',
    title: "Led by Neal's Yard Dairy",
    location: "Neal's Yard Dairy, stall D1",
    note: 'Limited to 15 people, includes tastings',
    cost: '£5',
    limited: true,
  },
  {
    id: 'kids-planting',
    time: '12:30 PM',
    label: 'Kids Planting Workshop',
    title: 'Plant a tomato seedling',
    location: 'Tendercare Nurseries, stall G1',
    note: 'Free. No booking required.',
    cost: 'Free',
  },
];

export const FACILITIES = [
  ['Entrance', 'Highbury Grove main entrance; Leigh Road secondary entrance'],
  ['Toilets', 'Public toilets in Highbury Fields, 200m from entrance'],
  ['Dog water', 'Bowls at the main entrance gate'],
  ['Payment', 'Most vendors take card. Some prefer cash. Listings note it.'],
  ['Bags', 'Bring your own. Boxes available from most vendors.'],
  ['Accessibility', 'Fully accessible, flat ground. Power wheelchairs welcome.'],
  ['Cycling', 'Secure bike parking at Leigh Road entrance'],
] as const;

export const GETTING_THERE = [
  ['Tube/Overground', 'Highbury & Islington - 5 min walk'],
  ['Tube', 'Arsenal - 8 min walk'],
  ['Bus', '19, 30, 277 to Highbury Corner'],
  ['Bike', 'Quietway 1 passes Highbury Fields'],
] as const;

export const REVIEWS = [
  {
    vendor: 'E5 Bakehouse',
    body: 'The dark rye loaf has genuinely changed my weekend routine. Worth queuing for.',
    source: 'Regular, 4 months',
  },
  {
    vendor: 'Chegworth Valley',
    body: "First strawberries of the year. They knew exactly when they'd be ready and didn't disappoint.",
    source: 'Sunday shopper',
  },
  {
    vendor: 'Ginger Pig',
    body: 'Bought the mutton shoulder. Cooked it for 8 hours. Best Sunday roast of the year.',
    source: 'Market regular',
  },
];
