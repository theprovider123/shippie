/**
 * Ingredient-led generative art.
 *
 * Palate ships zero food photography (offline-first, no external images), but
 * the brief calls for visuals that feel "ingredient-led, warm, alive." So we
 * paint each recipe procedurally from its OWN ingredients: every dish becomes a
 * top-down "plate" of organic colour fields drawn from the real foods in it —
 * tomato reds, kale greens, saffron yellows, aubergine purples — over a
 * cuisine-warmed ground. Deterministic from the recipe id, so a dish always
 * looks like itself. Pure SVG/CSS, fully offline, crisp at any size.
 */

// ── Ingredient → colour ──────────────────────────────────────────────────────
// Keyword families mapped to appetising colours. First match wins; order
// matters (specific before generic). Unmatched names fall back to a warm
// palette indexed by a hash of the name, so nothing is ever grey.
const FOOD_COLOURS: Array<{ re: RegExp; c: string }> = [
  { re: /tomato|chil[li]+|red pepper|paprika|harissa|sriracha|strawberr|cherr|pomegranate|beet/i, c: '#d6402e' },
  { re: /salmon|prawn|shrimp|crab|lobster|chorizo|ham|bacon|watermelon/i, c: '#e98a63' },
  { re: /carrot|squash|pumpkin|sweet potato|apricot|mango|orange|turmeric|sweet potato/i, c: '#e8821e' },
  { re: /lemon|corn|butter|egg yolk|saffron|polenta|banana|pineapple|mustard|honey/i, c: '#f1c34a' },
  { re: /cheese|parmesan|cheddar|halloumi|brie/i, c: '#edc873' },
  { re: /kale|spinach|basil|parsley|coriander|cilantro|mint|sage|rocket|pesto|broccoli|courgette|zucchini|pea\b|peas|green bean|lettuce|cabbage|cucumber|lime|avocado|asparagus|leek/i, c: '#6f9c43' },
  { re: /olive/i, c: '#5b7a3a' },
  { re: /aubergine|eggplant|blueberr|blackberr|plum|grape|fig|purple|red cabbage|black bean/i, c: '#6c4f7a' },
  { re: /chocolate|cocoa|coffee|espresso|beef|steak|mince|mushroom|soy|miso|tamarind|date|molasses|balsamic|cinnamon|walnut|pecan|almond|peanut/i, c: '#7c5330' },
  { re: /bread|toast|oat|flour|pastry|crouton|pita|naan|tortilla|cracker|biscuit/i, c: '#c8a36a' },
  { re: /chicken|turkey|pork|tofu|potato|cauliflower|parsnip|onion|garlic|ginger|fennel|coconut|rice|noodle|pasta|bean|chickpea|lentil|hummus/i, c: '#dcc28e' },
  { re: /yogh?urt|milk|cream|feta|mozzarella|ricotta|coconut milk/i, c: '#f0e8d2' },
  { re: /cod|haddock|white fish|sea bass|scallop/i, c: '#e4e7df' },
];

const FALLBACK_PALETTE = ['#d6402e', '#e8821e', '#f1c34a', '#6f9c43', '#7c5330', '#c8a36a', '#e98a63', '#6c4f7a'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ingredientColour(name: string): string {
  for (const { re, c } of FOOD_COLOURS) if (re.test(name)) return c;
  return FALLBACK_PALETTE[hash(name) % FALLBACK_PALETTE.length] ?? '#e8821e';
}

// ── Cuisine → warm ground ────────────────────────────────────────────────────
const CUISINE_GROUND: Record<string, [string, string]> = {
  italian: ['#f3e3c4', '#e7c9a0'],
  mexican: ['#f6dcae', '#eebd86'],
  indian: ['#f3d9a4', '#e7b878'],
  thai: ['#eee3bf', '#d9d49a'],
  japanese: ['#efe7d6', '#dcd6c4'],
  chinese: ['#f4d9b0', '#e7b98a'],
  'middle eastern': ['#f1dcab', '#e3c187'],
  french: ['#f1e6cf', '#e0cfa8'],
  british: ['#efe6cf', '#ddccab'],
  american: ['#f4ddb4', '#ecc792'],
  mediterranean: ['#f1e4c2', '#dcd09a'],
};
const DEFAULT_GROUND: [string, string] = ['#f4e7cb', '#e7d2a8'];

function ground(cuisine: string): [string, string] {
  const key = cuisine.trim().toLowerCase();
  return CUISINE_GROUND[key] ?? DEFAULT_GROUND;
}

// mulberry32 — seeded, deterministic placement.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft organic blob path around (cx,cy) with `r` radius and seeded wobble. */
function blob(cx: number, cy: number, r: number, rand: () => number): string {
  const pts = 7;
  const step = (Math.PI * 2) / pts;
  let d = '';
  const radii = Array.from({ length: pts }, () => r * (0.78 + rand() * 0.44));
  for (let i = 0; i <= pts; i++) {
    const a = i * step;
    const rr = radii[i % pts] ?? r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    d += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : `Q${(cx + Math.cos(a - step / 2) * rr * 1.18).toFixed(1)} ${(cy + Math.sin(a - step / 2) * rr * 1.18).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + 'Z';
}

export interface RecipeArtProps {
  id: string;
  title: string;
  cuisine?: string;
  /** Ingredient display names; the first few drive the palette. */
  ingredients?: string[];
  /** Render the plate ring + dish forms (card hero) vs a flat ground (chip). */
  variant?: 'plate' | 'flat';
  className?: string;
}

export function RecipeArt({
  id,
  title,
  cuisine = '',
  ingredients = [],
  variant = 'plate',
  className,
}: RecipeArtProps) {
  const seed = hash(id || title);
  const rand = rng(seed);
  const [g0, g1] = ground(cuisine);

  // Pick up to 5 colours from the real ingredients; dedupe, keep order.
  const colours: string[] = [];
  for (const ing of ingredients) {
    const c = ingredientColour(ing);
    if (!colours.includes(c)) colours.push(c);
    if (colours.length >= 5) break;
  }
  while (colours.length < 3) {
    colours.push(FALLBACK_PALETTE[(seed + colours.length) % FALLBACK_PALETTE.length] ?? '#e8821e');
  }

  const initial = (title.trim()[0] ?? '·').toUpperCase();
  const gid = `pa-${seed.toString(36)}`;

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${title} — illustrated from its ingredients`}
    >
      <defs>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={g0} />
          <stop offset="1" stopColor={g1} />
        </linearGradient>
        <radialGradient id={`${gid}-plate`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f3e8d2" />
        </radialGradient>
        <filter id={`${gid}-soft`}>
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>

      <rect width="100" height="100" fill={`url(#${gid}-bg)`} />

      {variant === 'plate' && (
        <circle cx="50" cy="49" r="39" fill={`url(#${gid}-plate)`} stroke="#0000000f" strokeWidth="0.6" />
      )}

      <g filter={`url(#${gid}-soft)`}>
        {colours.map((c, i) => {
          const ang = (i / colours.length) * Math.PI * 2 + rand() * 1.2;
          const dist = variant === 'plate' ? 13 + rand() * 8 : 22 + rand() * 14;
          const cx = 50 + Math.cos(ang) * dist;
          const cy = 49 + Math.sin(ang) * dist;
          const r = (variant === 'plate' ? 11 : 16) * (0.7 + rand() * 0.5);
          return <path key={i} d={blob(cx, cy, r, rand)} fill={c} opacity={variant === 'plate' ? 0.92 : 0.85} />;
        })}
      </g>

      {/* a couple of scattered seeds/specks for life */}
      <g fill="#0000001a">
        {Array.from({ length: 5 }).map((_, i) => (
          <circle key={i} cx={20 + rand() * 60} cy={20 + rand() * 58} r={0.6 + rand() * 0.9} />
        ))}
      </g>

      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="30"
        fill="#3a2a18"
        opacity="0.16"
      >
        {initial}
      </text>
    </svg>
  );
}
