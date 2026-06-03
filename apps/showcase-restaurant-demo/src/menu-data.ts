export type DietaryFilter = 'vegan' | 'vegetarian' | 'glutenFree';

export interface Dish {
  id: string;
  name: string;
  description: string;
  price?: number;
  priceLabel?: string;
  dietary: DietaryFilter[];
  badges?: string[];
  allergens?: string[];
  allergenNote?: string;
  winePairing?: string;
  chefNote?: string;
  special?: boolean;
}

export interface MenuSection {
  id: string;
  title: string;
  note?: string;
  dishes: Dish[];
}

export const RESTAURANT = {
  name: 'Locanda Soho',
  tagline: 'Cucina casalinga dal 1989',
  address: '18 Frith Street, Soho, London W1D 4RQ',
  phone: '020 7437 2152',
  email: 'prenotazioni@locanda-soho.co.uk',
  about:
    "We've been on Frith Street since 1989. Rosa and her daughter Chiara cook everything you'll eat tonight from recipes Rosa brought from Basilicata. Our pasta is made fresh each morning. Our wine list is exclusively Italian, mostly natural.",
  hours: [
    ['Monday-Saturday', '12:00-15:00, 18:00-22:30'],
    ['Sunday', '12:00-16:00 (roast only)'],
    ['Kitchen', 'Closes 30 minutes before closing time'],
  ],
};

export const FILTERS: readonly {
  id: DietaryFilter;
  shortLabel: string;
  label: string;
}[] = [
  { id: 'vegan', shortLabel: 'Vegan', label: 'Vegan' },
  { id: 'vegetarian', shortLabel: 'Veg', label: 'Vegetarian' },
  { id: 'glutenFree', shortLabel: 'GF', label: 'Gluten-free' },
];

export const DEFAULT_SPECIAL_NOTE =
  "Fresh trofie, Bronte pistachio pesto, king prawns, lemon zest. Chef's favourite this week.";

export const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'specials',
    title: "Today's Specials",
    note: 'Updated today',
    dishes: [
      {
        id: 'special-trofie',
        name: 'Trofie al pesto di pistacchio e gamberi',
        price: 22,
        description: DEFAULT_SPECIAL_NOTE,
        dietary: [],
        allergens: ['gluten', 'shellfish', 'nuts'],
        allergenNote: 'Contains: gluten, shellfish, nuts',
        chefNote:
          'Rosa likes this with a little extra lemon zest and no rush at the pass.',
        special: true,
      },
    ],
  },
  {
    id: 'antipasti',
    title: 'Antipasti',
    dishes: [
      {
        id: 'burrata',
        name: 'Burrata pugliese e pomodori',
        price: 11.5,
        description:
          'Fior di latte burrata, heritage tomatoes from our supplier in Kent, Sicilian olive oil, basil.',
        dietary: ['vegan', 'vegetarian'],
        badges: ['Vegan option'],
      },
      {
        id: 'frittura',
        name: 'Frittura mista di mare',
        price: 14,
        description: 'Calamari, king prawns, whitebait. Lemon aioli, pickled chilli.',
        dietary: [],
        allergens: ['gluten', 'shellfish', 'eggs'],
        allergenNote: 'Contains: gluten, shellfish, eggs',
      },
      {
        id: 'carpaccio',
        name: 'Carpaccio di manzo',
        price: 13.5,
        description:
          'Hereford beef fillet, shaved Parmesan, rocket, capers, Dijon mustard dressing.',
        dietary: [],
        allergens: ['dairy', 'mustard', 'raw meat'],
        allergenNote: 'Contains: dairy, mustard; raw meat',
      },
      {
        id: 'crostini',
        name: 'Crostini al fegato',
        price: 9.5,
        description:
          'Chicken liver pate, toasted sourdough, onion marmalade, cornichons.',
        dietary: [],
        allergens: ['gluten', 'dairy', 'liver'],
        allergenNote: 'Contains: gluten, dairy, liver',
      },
      {
        id: 'zuppa',
        name: 'Zuppa di fagioli e cavolo nero',
        price: 8,
        description: 'Borlotti beans, cavolo nero, rosemary, toasted sourdough.',
        dietary: ['vegan', 'glutenFree'],
        badges: ['Vegan', 'Gluten-free without bread'],
        allergens: ['gluten'],
      },
      {
        id: 'uova',
        name: 'Uova al tartufo',
        price: 12.5,
        description:
          'Soft-boiled Clarence Court eggs, black truffle, Parmesan, sourdough soldiers.',
        dietary: ['vegetarian'],
        badges: ['Vegetarian'],
        allergens: ['gluten', 'dairy', 'eggs'],
        allergenNote: 'Contains: gluten, dairy, eggs',
      },
    ],
  },
  {
    id: 'pasta',
    title: 'Pasta e Risotto',
    dishes: [
      {
        id: 'tagliatelle',
        name: 'Tagliatelle al ragu',
        price: 18,
        description:
          "Eight-hour slow-cooked beef and pork ragu, fresh egg tagliatelle, Parmesan. Rosa's mother's recipe.",
        dietary: [],
        allergens: ['gluten', 'dairy', 'eggs'],
        allergenNote: 'Contains: gluten, dairy, eggs',
        winePairing: 'Chianti Classico, Castello di Ama - earthy, bright, and built for slow ragu.',
        chefNote:
          "The sauce starts before lunch service. If you smell cloves, that's the family secret.",
      },
      {
        id: 'vongole',
        name: 'Spaghetti alle vongole',
        price: 21,
        description:
          "Palourde clams, white wine, garlic, flat-leaf parsley, Calabrian chilli. Ask about today's catch.",
        dietary: [],
        allergens: ['gluten', 'shellfish'],
        allergenNote: 'Contains: gluten, shellfish',
        winePairing: 'Vermentino, Argiolas Costamolino - saline citrus with the clams.',
        chefNote:
          'Chiara finishes this off the heat so the pasta keeps the sea in the pan.',
      },
      {
        id: 'pappardelle',
        name: 'Pappardelle ai funghi porcini',
        price: 17.5,
        description:
          'Fresh pappardelle, dried porcini, fresh chestnut mushrooms, truffle oil, Parmesan.',
        dietary: ['vegetarian'],
        badges: ['Vegetarian'],
        allergens: ['gluten', 'dairy', 'eggs'],
        allergenNote: 'Contains: gluten, dairy, eggs',
      },
      {
        id: 'risotto-zucca',
        name: 'Risotto alla zucca',
        price: 16.5,
        description:
          'Butternut squash, sage, toasted pumpkin seeds, aged Parmesan, mascarpone.',
        dietary: ['vegetarian'],
        badges: ['Vegetarian'],
        allergens: ['dairy'],
        allergenNote: 'Contains: dairy',
      },
      {
        id: 'gnocchi-gorgonzola',
        name: 'Gnocchi al Gorgonzola e spinaci',
        price: 17,
        description:
          'Hand-rolled potato gnocchi, Gorgonzola DOP, wilted spinach, toasted walnuts.',
        dietary: ['vegetarian'],
        badges: ['Vegetarian'],
        allergens: ['gluten', 'dairy', 'eggs', 'nuts'],
        allergenNote: 'Contains: gluten, dairy, eggs, nuts',
      },
      {
        id: 'lasagne',
        name: 'Lasagne della nonna',
        price: 19,
        description:
          "Rosa's lasagne. Beef ragu, bechamel, fresh pasta, Parmesan. Made since 1989.",
        dietary: [],
        allergens: ['gluten', 'dairy', 'eggs'],
        allergenNote: 'Contains: gluten, dairy, eggs',
      },
    ],
  },
  {
    id: 'secondi',
    title: 'Secondi',
    dishes: [
      {
        id: 'branzino',
        name: "Branzino all'acqua pazza",
        price: 28,
        description:
          'Wild sea bass, cherry tomatoes, capers, olives, white wine, parsley.',
        dietary: ['glutenFree'],
        badges: ['Gluten-free'],
        allergens: ['fish'],
        allergenNote: 'Contains: fish',
        winePairing: 'Pinot Grigio, Cantina Tramin - clean acidity and enough body for the fish.',
        chefNote:
          'We serve it with the pan juices because acqua pazza should taste like the coast.',
      },
      {
        id: 'agnello',
        name: "Costolette d'agnello",
        price: 32,
        description:
          'Rack of Herdwick lamb, salsa verde, roasted new potatoes, grilled courgette.',
        dietary: [],
        allergens: ['dairy'],
        allergenNote: 'Contains: dairy',
      },
      {
        id: 'pollo',
        name: 'Pollo alla cacciatora',
        price: 24,
        description: 'Free-range chicken thighs, tomato, olives, capers, rosemary.',
        dietary: ['glutenFree'],
        badges: ['Gluten-free'],
      },
      {
        id: 'tagliata',
        name: 'Tagliata di manzo',
        price: 35,
        description:
          '300g Hereford ribeye, rocket, cherry tomatoes, Parmesan, balsamic, roasted potatoes. Ask about doneness.',
        dietary: [],
        allergens: ['dairy'],
        allergenNote: 'Contains: dairy',
      },
    ],
  },
  {
    id: 'contorni',
    title: 'Contorni',
    note: 'Side dishes - £5 each',
    dishes: [
      {
        id: 'spinaci',
        name: 'Spinaci aglio e olio',
        price: 5,
        description: 'Garlic, olive oil, lemon.',
        dietary: ['vegan', 'glutenFree'],
        badges: ['Vegan', 'Gluten-free'],
      },
      {
        id: 'patate',
        name: 'Patate al rosmarino',
        price: 5,
        description: 'Roasted new potatoes, rosemary, sea salt.',
        dietary: ['vegan', 'glutenFree'],
        badges: ['Vegan', 'Gluten-free'],
      },
      {
        id: 'caponata',
        name: 'Caponata siciliana',
        price: 5,
        description: 'Aubergine, celery, capers, tomato, olive oil.',
        dietary: ['vegan', 'glutenFree'],
        badges: ['Vegan', 'Gluten-free'],
      },
      {
        id: 'insalata-verde',
        name: 'Insalata verde',
        price: 5,
        description: 'Leaves, herbs, white balsamic.',
        dietary: ['vegan', 'glutenFree'],
        badges: ['Vegan', 'Gluten-free'],
      },
      {
        id: 'pane',
        name: 'Pane casareccio',
        price: 5,
        description: 'Sourdough, olive oil.',
        dietary: ['vegan'],
        badges: ['Vegan'],
        allergens: ['gluten'],
      },
    ],
  },
  {
    id: 'dolci',
    title: 'Dolci',
    dishes: [
      {
        id: 'tiramisu',
        name: 'Tiramisu della casa',
        price: 9,
        description: "Rosa's tiramisu. Coffee, Marsala, Savoiardi, mascarpone.",
        dietary: ['vegetarian'],
        badges: ['Vegetarian'],
        allergens: ['dairy', 'eggs', 'gluten'],
        allergenNote: 'Contains: dairy, eggs, gluten',
        winePairing: 'Moscato dAsti - light fizz, orange blossom, not too sweet.',
        chefNote:
          'Made in the morning, cut at the table only after it has properly settled.',
      },
      {
        id: 'panna-cotta',
        name: 'Panna cotta al miele',
        price: 8.5,
        description: 'Wildflower honey panna cotta, strawberry compote.',
        dietary: ['glutenFree'],
        badges: ['Gluten-free'],
        allergens: ['dairy'],
        allergenNote: 'Contains: dairy',
      },
      {
        id: 'torta-cioccolato',
        name: 'Torta al cioccolato fondente',
        price: 9.5,
        description: 'Dark chocolate and almond torte, salted caramel gelato.',
        dietary: ['glutenFree'],
        badges: ['Gluten-free'],
        allergens: ['dairy', 'eggs', 'nuts'],
        allergenNote: 'Contains: dairy, eggs, nuts',
      },
      {
        id: 'sorbetti',
        name: 'Sorbetti e gelati',
        priceLabel: '£7.00 / 2 scoops',
        description: "Ask for today's flavours.",
        dietary: ['vegan'],
        badges: ['Some options vegan'],
      },
      {
        id: 'formaggi',
        name: 'Formaggi italiani',
        price: 14,
        description:
          'Three Italian cheeses, honey, walnuts, crackers, quince jelly.',
        dietary: ['vegetarian'],
        badges: ['Vegetarian'],
        allergens: ['dairy', 'gluten', 'nuts'],
        allergenNote: 'Contains: dairy, gluten, nuts',
      },
    ],
  },
  {
    id: 'vini',
    title: 'Vini',
    note: 'Abbreviated for demo',
    dishes: [
      {
        id: 'prosecco',
        name: 'Prosecco, La Marca, Veneto NV',
        priceLabel: '£8 / £38',
        description: 'Bright, dry, and easy before antipasti.',
        dietary: [],
      },
      {
        id: 'pinot-grigio',
        name: 'Pinot Grigio, Cantina Tramin, 2023',
        priceLabel: '£9 / £42',
        description: 'Alto Adige, crisp pear, mineral finish.',
        dietary: [],
      },
      {
        id: 'vermentino',
        name: 'Vermentino, Argiolas Costamolino',
        priceLabel: '£10 / £46',
        description: 'Sardinian citrus and sea air.',
        dietary: [],
      },
      {
        id: 'chianti',
        name: 'Chianti Classico, Castello di Ama',
        priceLabel: '£11 / £52',
        description: 'Red cherry, Tuscan herbs, fine tannin.',
        dietary: [],
      },
      {
        id: 'barolo',
        name: 'Barolo, Pio Cesare, 2019',
        priceLabel: '£16 / £78',
        description: 'Nebbiolo, rose, leather, long finish.',
        dietary: [],
      },
      {
        id: 'brunello',
        name: 'Brunello, Biondi-Santi, 2018',
        priceLabel: '£28 / £140',
        description: 'A cellar bottle for the table.',
        dietary: [],
      },
      {
        id: 'negroni',
        name: 'Negroni',
        price: 12,
        description: 'House blend.',
        dietary: [],
      },
      {
        id: 'aperol',
        name: 'Aperol Spritz',
        price: 11,
        description: 'Aperol, prosecco, soda.',
        dietary: [],
      },
      {
        id: 'mocktail',
        name: 'Mocktail of the day',
        price: 7,
        description: 'Ask your server.',
        dietary: [],
      },
    ],
  },
];

export const DISH_LOOKUP = new Map(
  MENU_SECTIONS.flatMap((section) => section.dishes).map((dish) => [dish.id, dish]),
);

export function formatPrice(dish: Pick<Dish, 'price' | 'priceLabel'>): string {
  if (dish.priceLabel) return dish.priceLabel;
  if (typeof dish.price === 'number') return `£${dish.price.toFixed(2)}`;
  return '';
}

export function numericPrice(dish: Pick<Dish, 'price'>): number {
  return typeof dish.price === 'number' ? dish.price : 0;
}

