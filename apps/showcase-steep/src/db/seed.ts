/**
 * Curated starter library: ~40 herbs + ~8 starter blends.
 *
 * COPY DISCIPLINE:
 *   `traditional_uses` describes how a culture or tradition has used the
 *   herb. Never frames it as medical advice or a treatment claim. The
 *   app's persistent disclaimer carries the rest of the weight.
 *
 *   Brewing baselines (temp + steep + resteeps) are reasonable defaults
 *   for most palates; users can override per-blend.
 *
 * Seeding is idempotent: `upsertHerb` and `createBlend` are skipped when
 * the slug or blend name already exists. Safe to run on every cold start.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  addBlendIngredient,
  createBlend,
  getHerbBySlug,
  listBlends,
  listHerbs,
  upsertHerb,
} from './queries.ts';
import type { ActionTag, IntentTag, TasteTag } from './schema.ts';

interface HerbSeed {
  slug: string;
  common_name: string;
  latin_name: string;
  tastes: TasteTag[];
  actions: ActionTag[];
  energetics?: string;
  traditional_uses?: string;
  default_brew_temp_c: number;
  default_steep_minutes: number;
  max_resteeps: number;
}

interface BlendSeed {
  name: string;
  notes?: string;
  intent_tags: IntentTag[];
  default_temp_c: number;
  default_steep_minutes: number;
  max_resteeps: number;
  default_batch: 'cup' | 'pot' | 'tin';
  ingredients: Array<{ slug: string; parts: number; notes?: string }>;
}

export const SEED_HERBS: HerbSeed[] = [
  {
    slug: 'chamomile',
    common_name: 'Chamomile',
    latin_name: 'Matricaria chamomilla',
    tastes: ['sweet', 'bitter'],
    actions: ['calming', 'digestive', 'aromatic'],
    energetics: 'cooling, drying',
    traditional_uses: 'Used across Europe and the Mediterranean as an evening tea and after meals.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 2,
  },
  {
    slug: 'lavender',
    common_name: 'Lavender',
    latin_name: 'Lavandula angustifolia',
    tastes: ['bitter', 'sweet'],
    actions: ['calming', 'aromatic'],
    energetics: 'cooling, drying',
    traditional_uses: 'Long used in French and Mediterranean folk traditions as a quieting evening infusion.',
    default_brew_temp_c: 93,
    default_steep_minutes: 4,
    max_resteeps: 1,
  },
  {
    slug: 'lemon-balm',
    common_name: 'Lemon balm',
    latin_name: 'Melissa officinalis',
    tastes: ['sour', 'sweet'],
    actions: ['calming', 'uplifting', 'aromatic'],
    energetics: 'cool, slightly drying',
    traditional_uses: 'A garden herb common in European monastery gardens, brewed as a daytime tea.',
    default_brew_temp_c: 90,
    default_steep_minutes: 5,
    max_resteeps: 2,
  },
  {
    slug: 'peppermint',
    common_name: 'Peppermint',
    latin_name: 'Mentha × piperita',
    tastes: ['pungent', 'sweet'],
    actions: ['cooling', 'digestive', 'aromatic'],
    energetics: 'cooling, drying',
    traditional_uses: 'Drunk after meals across the Mediterranean and Maghreb.',
    default_brew_temp_c: 95,
    default_steep_minutes: 4,
    max_resteeps: 2,
  },
  {
    slug: 'spearmint',
    common_name: 'Spearmint',
    latin_name: 'Mentha spicata',
    tastes: ['sweet', 'pungent'],
    actions: ['cooling', 'digestive', 'aromatic'],
    energetics: 'cooling',
    traditional_uses: 'A gentler mint than peppermint. Common in North African mint teas.',
    default_brew_temp_c: 95,
    default_steep_minutes: 4,
    max_resteeps: 2,
  },
  {
    slug: 'rose-petals',
    common_name: 'Rose petals',
    latin_name: 'Rosa damascena',
    tastes: ['sweet', 'bitter', 'astringent'],
    actions: ['cooling', 'aromatic', 'uplifting'],
    energetics: 'cool, slightly drying',
    traditional_uses: 'Used in Persian, Indian, and Ottoman traditions in tea, syrups, and conserves.',
    default_brew_temp_c: 90,
    default_steep_minutes: 5,
    max_resteeps: 2,
  },
  {
    slug: 'ginger',
    common_name: 'Ginger',
    latin_name: 'Zingiber officinale',
    tastes: ['pungent', 'sweet'],
    actions: ['warming', 'digestive', 'aromatic'],
    energetics: 'warming, drying',
    traditional_uses: 'A staple of Indian and Chinese kitchens; brewed plain or with lemon as a daily tonic.',
    default_brew_temp_c: 100,
    default_steep_minutes: 8,
    max_resteeps: 2,
  },
  {
    slug: 'tulsi',
    common_name: 'Tulsi (Holy basil)',
    latin_name: 'Ocimum tenuiflorum',
    tastes: ['pungent', 'astringent', 'sweet'],
    actions: ['uplifting', 'aromatic', 'warming'],
    energetics: 'warming',
    traditional_uses: 'A sacred plant of Indian household gardens; brewed daily across South Asia.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 2,
  },
  {
    slug: 'valerian',
    common_name: 'Valerian root',
    latin_name: 'Valeriana officinalis',
    tastes: ['bitter', 'pungent'],
    actions: ['calming', 'grounding'],
    energetics: 'warming, moistening',
    traditional_uses: 'A traditional European herb used in evening preparations. Strong, earthy aroma.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'passionflower',
    common_name: 'Passionflower',
    latin_name: 'Passiflora incarnata',
    tastes: ['bitter'],
    actions: ['calming'],
    energetics: 'cool, slightly drying',
    traditional_uses: 'Indigenous to the Americas; entered European herbal traditions in the 1800s.',
    default_brew_temp_c: 95,
    default_steep_minutes: 6,
    max_resteeps: 1,
  },
  {
    slug: 'oat-straw',
    common_name: 'Oat straw',
    latin_name: 'Avena sativa',
    tastes: ['sweet'],
    actions: ['demulcent', 'grounding'],
    energetics: 'cool, moistening',
    traditional_uses: 'A nourishing daily infusion in Western herbal traditions.',
    default_brew_temp_c: 95,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'nettle',
    common_name: 'Nettle leaf',
    latin_name: 'Urtica dioica',
    tastes: ['salty', 'astringent'],
    actions: ['grounding', 'cooling'],
    energetics: 'cool, slightly drying',
    traditional_uses: 'A daily nourishing infusion across Northern European folk traditions.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 2,
  },
  {
    slug: 'calendula',
    common_name: 'Calendula',
    latin_name: 'Calendula officinalis',
    tastes: ['bitter'],
    actions: ['cooling', 'demulcent'],
    energetics: 'cool, drying',
    traditional_uses: 'Bright orange petals long used in Mediterranean kitchens and herbal infusions.',
    default_brew_temp_c: 95,
    default_steep_minutes: 6,
    max_resteeps: 1,
  },
  {
    slug: 'fennel-seed',
    common_name: 'Fennel seed',
    latin_name: 'Foeniculum vulgare',
    tastes: ['sweet', 'pungent'],
    actions: ['warming', 'digestive', 'aromatic'],
    energetics: 'warming',
    traditional_uses: 'Chewed or brewed after meals across the Mediterranean and South Asia.',
    default_brew_temp_c: 100,
    default_steep_minutes: 7,
    max_resteeps: 2,
  },
  {
    slug: 'cardamom',
    common_name: 'Cardamom',
    latin_name: 'Elettaria cardamomum',
    tastes: ['pungent', 'sweet'],
    actions: ['warming', 'digestive', 'aromatic'],
    energetics: 'warming',
    traditional_uses: 'A foundational spice of Indian chai and Arabic coffee traditions.',
    default_brew_temp_c: 100,
    default_steep_minutes: 8,
    max_resteeps: 2,
  },
  {
    slug: 'cinnamon',
    common_name: 'Cinnamon (cassia)',
    latin_name: 'Cinnamomum cassia',
    tastes: ['sweet', 'pungent'],
    actions: ['warming', 'aromatic'],
    energetics: 'warming, drying',
    traditional_uses: 'Used across Chinese and Indian kitchens as a warming addition to hot drinks.',
    default_brew_temp_c: 100,
    default_steep_minutes: 8,
    max_resteeps: 2,
  },
  {
    slug: 'clove',
    common_name: 'Clove',
    latin_name: 'Syzygium aromaticum',
    tastes: ['pungent', 'bitter'],
    actions: ['warming', 'aromatic'],
    energetics: 'warming, drying',
    traditional_uses: 'A spice of Indonesian origin, traded along ancient routes; common in Indian chai.',
    default_brew_temp_c: 100,
    default_steep_minutes: 8,
    max_resteeps: 2,
  },
  {
    slug: 'rooibos',
    common_name: 'Rooibos',
    latin_name: 'Aspalathus linearis',
    tastes: ['sweet', 'astringent'],
    actions: ['grounding', 'cooling'],
    energetics: 'mild',
    traditional_uses: 'Indigenous to South Africa. A naturally caffeine-free daily tea.',
    default_brew_temp_c: 100,
    default_steep_minutes: 7,
    max_resteeps: 2,
  },
  {
    slug: 'hibiscus',
    common_name: 'Hibiscus',
    latin_name: 'Hibiscus sabdariffa',
    tastes: ['sour', 'astringent'],
    actions: ['cooling'],
    energetics: 'cooling, slightly moistening',
    traditional_uses: 'Brewed across West Africa, the Caribbean, and Mexico, hot or iced.',
    default_brew_temp_c: 95,
    default_steep_minutes: 6,
    max_resteeps: 1,
  },
  {
    slug: 'elderflower',
    common_name: 'Elderflower',
    latin_name: 'Sambucus nigra',
    tastes: ['sweet', 'bitter'],
    actions: ['cooling', 'aromatic'],
    energetics: 'cool',
    traditional_uses: 'A long-standing European hedgerow herb, brewed in cordials and teas.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 1,
  },
  {
    slug: 'elderberry',
    common_name: 'Elderberry',
    latin_name: 'Sambucus nigra (fruit)',
    tastes: ['sweet', 'sour'],
    actions: ['warming'],
    energetics: 'warming',
    traditional_uses: 'European folk preparations as syrups and teas, especially in cooler months.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'echinacea',
    common_name: 'Echinacea',
    latin_name: 'Echinacea purpurea',
    tastes: ['pungent', 'bitter'],
    actions: ['warming'],
    energetics: 'warming, drying',
    traditional_uses: 'Indigenous to North America; entered Western herbal traditions in the 19th century.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'thyme',
    common_name: 'Thyme',
    latin_name: 'Thymus vulgaris',
    tastes: ['pungent', 'bitter'],
    actions: ['warming', 'aromatic'],
    energetics: 'warming, drying',
    traditional_uses: 'A Mediterranean kitchen herb also brewed as an infusion.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 1,
  },
  {
    slug: 'sage',
    common_name: 'Sage',
    latin_name: 'Salvia officinalis',
    tastes: ['bitter', 'pungent', 'astringent'],
    actions: ['warming', 'aromatic'],
    energetics: 'warming, drying',
    traditional_uses: 'Brewed in Mediterranean and Balkan traditions as a daily tea.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 1,
  },
  {
    slug: 'rosemary',
    common_name: 'Rosemary',
    latin_name: 'Salvia rosmarinus',
    tastes: ['pungent', 'bitter'],
    actions: ['warming', 'uplifting', 'aromatic'],
    energetics: 'warming, drying',
    traditional_uses: 'A Mediterranean garden herb common in cooking and morning infusions.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 1,
  },
  {
    slug: 'licorice-root',
    common_name: 'Licorice root',
    latin_name: 'Glycyrrhiza glabra',
    tastes: ['sweet'],
    actions: ['demulcent', 'grounding'],
    energetics: 'cool, moistening',
    traditional_uses: 'A foundational sweet herb in Chinese and Greek herbal traditions.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 2,
  },
  {
    slug: 'marshmallow-root',
    common_name: 'Marshmallow root',
    latin_name: 'Althaea officinalis',
    tastes: ['sweet'],
    actions: ['demulcent', 'cooling'],
    energetics: 'cool, moistening',
    traditional_uses: 'A traditional European demulcent. Best as a cool or warm infusion to keep the mucilage.',
    default_brew_temp_c: 80,
    default_steep_minutes: 30,
    max_resteeps: 1,
  },
  {
    slug: 'slippery-elm',
    common_name: 'Slippery elm bark',
    latin_name: 'Ulmus rubra',
    tastes: ['sweet'],
    actions: ['demulcent'],
    energetics: 'cool, moistening',
    traditional_uses: 'An indigenous North American bark used as a soothing infusion.',
    default_brew_temp_c: 90,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'dandelion-root',
    common_name: 'Dandelion root (roasted)',
    latin_name: 'Taraxacum officinale',
    tastes: ['bitter', 'sweet'],
    actions: ['warming', 'digestive', 'grounding'],
    energetics: 'cool, drying',
    traditional_uses: 'A bitter root used across European folk traditions; roasted as a coffee alternative.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 2,
  },
  {
    slug: 'burdock',
    common_name: 'Burdock root',
    latin_name: 'Arctium lappa',
    tastes: ['bitter', 'sweet'],
    actions: ['cooling', 'grounding'],
    energetics: 'cool, slightly moistening',
    traditional_uses: 'Eaten as a root vegetable in Japanese cuisine; brewed in Western herbal traditions.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'milky-oats',
    common_name: 'Milky oat tops',
    latin_name: 'Avena sativa',
    tastes: ['sweet'],
    actions: ['calming', 'demulcent', 'grounding'],
    energetics: 'cool, moistening',
    traditional_uses: 'A nourishing daily infusion in Western herbal traditions.',
    default_brew_temp_c: 95,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'skullcap',
    common_name: 'Skullcap',
    latin_name: 'Scutellaria lateriflora',
    tastes: ['bitter'],
    actions: ['calming'],
    energetics: 'cool, drying',
    traditional_uses: 'An indigenous North American herb adopted into Western herbal practice.',
    default_brew_temp_c: 95,
    default_steep_minutes: 6,
    max_resteeps: 1,
  },
  {
    slug: 'mugwort',
    common_name: 'Mugwort',
    latin_name: 'Artemisia vulgaris',
    tastes: ['bitter', 'pungent'],
    actions: ['warming', 'aromatic', 'digestive'],
    energetics: 'warming, drying',
    traditional_uses: 'Used widely across European and East Asian folk traditions.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 1,
  },
  {
    slug: 'yarrow',
    common_name: 'Yarrow',
    latin_name: 'Achillea millefolium',
    tastes: ['bitter', 'pungent', 'astringent'],
    actions: ['warming', 'aromatic'],
    energetics: 'warming and cooling, drying',
    traditional_uses: 'A long-standing herb in European folk medicine, brewed as an infusion.',
    default_brew_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 1,
  },
  {
    slug: 'red-clover',
    common_name: 'Red clover',
    latin_name: 'Trifolium pratense',
    tastes: ['sweet'],
    actions: ['cooling', 'demulcent'],
    energetics: 'cool, slightly moistening',
    traditional_uses: 'A Western herbal tradition for nourishing infusions.',
    default_brew_temp_c: 95,
    default_steep_minutes: 7,
    max_resteeps: 1,
  },
  {
    slug: 'red-raspberry-leaf',
    common_name: 'Red raspberry leaf',
    latin_name: 'Rubus idaeus',
    tastes: ['astringent'],
    actions: ['grounding', 'cooling'],
    energetics: 'neutral, drying',
    traditional_uses: 'A nourishing daily infusion in Western and European folk traditions.',
    default_brew_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 1,
  },
  {
    slug: 'green-tea',
    common_name: 'Green tea (sencha)',
    latin_name: 'Camellia sinensis',
    tastes: ['bitter', 'astringent', 'sweet'],
    actions: ['cooling', 'uplifting'],
    energetics: 'cooling',
    traditional_uses: 'Foundational across East Asian tea cultures. Caffeinated.',
    default_brew_temp_c: 75,
    default_steep_minutes: 2,
    max_resteeps: 3,
  },
  {
    slug: 'oolong',
    common_name: 'Oolong tea',
    latin_name: 'Camellia sinensis',
    tastes: ['sweet', 'astringent'],
    actions: ['warming', 'uplifting'],
    energetics: 'neutral',
    traditional_uses: 'Chinese and Taiwanese tea traditions. Caffeinated.',
    default_brew_temp_c: 90,
    default_steep_minutes: 3,
    max_resteeps: 4,
  },
  {
    slug: 'pu-erh',
    common_name: 'Pu-erh tea',
    latin_name: 'Camellia sinensis',
    tastes: ['bitter', 'sweet', 'astringent'],
    actions: ['warming', 'digestive', 'grounding'],
    energetics: 'warming',
    traditional_uses: 'Aged Chinese tea, often drunk after rich meals. Caffeinated.',
    default_brew_temp_c: 95,
    default_steep_minutes: 3,
    max_resteeps: 5,
  },
];

export const SEED_BLENDS: BlendSeed[] = [
  {
    name: 'Evening calm',
    notes: 'A classic before-bed blend. Floral, gentle, slightly sweet.',
    intent_tags: ['sleep', 'calm'],
    default_temp_c: 95,
    default_steep_minutes: 6,
    max_resteeps: 1,
    default_batch: 'cup',
    ingredients: [
      { slug: 'chamomile', parts: 3 },
      { slug: 'lavender', parts: 1 },
      { slug: 'lemon-balm', parts: 2 },
    ],
  },
  {
    name: 'Heavy-eyelid blend',
    notes: 'For nights when sleep needs help. Strong and earthy.',
    intent_tags: ['sleep'],
    default_temp_c: 100,
    default_steep_minutes: 10,
    max_resteeps: 1,
    default_batch: 'cup',
    ingredients: [
      { slug: 'valerian', parts: 1 },
      { slug: 'passionflower', parts: 2 },
      { slug: 'chamomile', parts: 2 },
    ],
  },
  {
    name: 'Quiet head',
    notes: 'A daytime calm blend without sedation. Bright and lemony.',
    intent_tags: ['calm', 'focus'],
    default_temp_c: 90,
    default_steep_minutes: 5,
    max_resteeps: 2,
    default_batch: 'pot',
    ingredients: [
      { slug: 'lemon-balm', parts: 3 },
      { slug: 'tulsi', parts: 2 },
      { slug: 'rose-petals', parts: 1 },
    ],
  },
  {
    name: 'Morning lift',
    notes: 'Aromatic and warming. Good before the first task of the day.',
    intent_tags: ['focus', 'energy'],
    default_temp_c: 95,
    default_steep_minutes: 5,
    max_resteeps: 2,
    default_batch: 'pot',
    ingredients: [
      { slug: 'tulsi', parts: 3 },
      { slug: 'rosemary', parts: 1 },
      { slug: 'green-tea', parts: 2 },
    ],
  },
  {
    name: 'After dinner',
    notes: 'Sip after a heavy meal. Warming and aromatic.',
    intent_tags: ['digestion'],
    default_temp_c: 100,
    default_steep_minutes: 8,
    max_resteeps: 2,
    default_batch: 'cup',
    ingredients: [
      { slug: 'fennel-seed', parts: 2 },
      { slug: 'peppermint', parts: 3 },
      { slug: 'cardamom', parts: 1 },
    ],
  },
  {
    name: 'Cold-and-bright',
    notes: 'Tart, ruby-red. Iced or hot. Good with honey.',
    intent_tags: ['immune', 'energy'],
    default_temp_c: 95,
    default_steep_minutes: 6,
    max_resteeps: 1,
    default_batch: 'pot',
    ingredients: [
      { slug: 'hibiscus', parts: 2 },
      { slug: 'rose-petals', parts: 1 },
      { slug: 'elderberry', parts: 1 },
    ],
  },
  {
    name: 'Daily nourishing',
    notes: 'A long-steep nourishing infusion. Drink throughout the day.',
    intent_tags: ['cycle'],
    default_temp_c: 100,
    default_steep_minutes: 30,
    max_resteeps: 1,
    default_batch: 'tin',
    ingredients: [
      { slug: 'nettle', parts: 2 },
      { slug: 'oat-straw', parts: 2 },
      { slug: 'red-raspberry-leaf', parts: 1 },
    ],
  },
  {
    name: 'Throat-soothing',
    notes: 'A warm honey-friendly cup when the throat feels rough.',
    intent_tags: ['breath', 'immune'],
    default_temp_c: 95,
    default_steep_minutes: 8,
    max_resteeps: 1,
    default_batch: 'cup',
    ingredients: [
      { slug: 'marshmallow-root', parts: 2 },
      { slug: 'licorice-root', parts: 1 },
      { slug: 'thyme', parts: 1 },
      { slug: 'ginger', parts: 1 },
    ],
  },
];

export interface SeedResult {
  herbsAdded: number;
  blendsAdded: number;
}

export async function seedIfEmpty(db: ShippieLocalDb): Promise<SeedResult> {
  const existingHerbs = await listHerbs(db);
  let herbsAdded = 0;
  if (existingHerbs.length === 0) {
    for (const herb of SEED_HERBS) {
      await upsertHerb(db, { ...herb, source: 'seed' });
      herbsAdded += 1;
    }
  }

  const existingBlends = await listBlends(db);
  let blendsAdded = 0;
  if (existingBlends.length === 0) {
    for (const seed of SEED_BLENDS) {
      const blend = await createBlend(db, {
        name: seed.name,
        notes: seed.notes ?? null,
        intent_tags: seed.intent_tags,
        default_temp_c: seed.default_temp_c,
        default_steep_minutes: seed.default_steep_minutes,
        max_resteeps: seed.max_resteeps,
        default_batch: seed.default_batch,
      });
      for (const ing of seed.ingredients) {
        const herb = await getHerbBySlug(db, ing.slug);
        if (!herb) continue; // Seed integrity is covered in seed.test.ts.
        await addBlendIngredient(db, {
          blend_id: blend.id,
          herb_id: herb.id,
          parts: ing.parts,
          notes: ing.notes ?? null,
        });
      }
      blendsAdded += 1;
    }
  }

  return { herbsAdded, blendsAdded };
}
