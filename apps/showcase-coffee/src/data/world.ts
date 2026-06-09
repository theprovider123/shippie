// The World graph — lot.'s coffee knowledge base. Shipped as local seed data
// (the "shared graph" sync only ever refreshes community scores on top of
// this). Five-axis scores are [Brightness, Body, Sweetness, Complexity, Clean]
// on the 0–5 radar scale.
//
// Content is written to be genuinely accurate: real growing regions, real
// elevations and harvest windows, real varietal lineage and process chemistry.

export type Axis5 = [number, number, number, number, number];

export interface WorldOrigin {
  slug: string;
  name: string;
  country: string;
  region: string;
  elevation: string;
  harvestWindow: string;
  description: string;
  varieties: string[]; // variety slugs grown here
  communityScore: Axis5;
  roasters: string[]; // roaster names currently sourcing
}

export interface WorldVariety {
  slug: string;
  name: string;
  species: 'Arabica' | 'Arabica (mutation)' | 'Arabica (hybrid)';
  originSlug: string; // ancestral home
  description: string;
  flavourProfile: Axis5;
  communityScore: Axis5;
}

export interface WorldProcess {
  slug: string;
  name: string;
  family: 'Washed' | 'Natural' | 'Honey' | 'Anaerobic' | 'Other';
  description: string;
  effectOnCup: Axis5;
  communityScore: Axis5;
}

export interface WorldRoaster {
  slug: string;
  name: string;
  city: string;
  country: string;
  sourcingModel: string;
  philosophy: string;
  transparencyScore: number; // 0–5
  currentOfferings: string[];
}

export const ORIGINS: WorldOrigin[] = [
  {
    slug: 'yirgacheffe',
    name: 'Yirgacheffe',
    country: 'Ethiopia',
    region: 'SNNPR',
    elevation: '1,800–2,200m',
    harvestWindow: 'Oct–Jan',
    description:
      'Widely regarded as the birthplace of Arabica coffee. The micro-climate, high elevation, and extraordinary biodiversity produce coffees of exceptional floral complexity and clarity — particularly when processed naturally. Smallholders deliver cherry to washing stations that pool thousands of indigenous "heirloom" types into a single, unmistakably perfumed cup.',
    varieties: ['heirloom'],
    communityScore: [4.2, 2.8, 3.6, 4.5, 4.0],
    roasters: ['Square Mile', 'Onyx Coffee Lab', 'Heart Coffee'],
  },
  {
    slug: 'guji',
    name: 'Guji',
    country: 'Ethiopia',
    region: 'Oromia',
    elevation: '1,900–2,300m',
    harvestWindow: 'Nov–Feb',
    description:
      'A neighbour to Yirgacheffe that has stepped out of its shadow. Guji naturals lean fruit-forward — blueberry, strawberry, and tropical syrup — over the jasmine-and-citrus delicacy of the washed lots. High elevation and slow cherry ripening build sugars and density.',
    varieties: ['heirloom'],
    communityScore: [3.9, 3.2, 4.2, 4.3, 3.6],
    roasters: ['Has Bean', 'Square Mile'],
  },
  {
    slug: 'bench-maji',
    name: 'Bench Maji',
    country: 'Ethiopia',
    region: 'SNNPR',
    elevation: '1,900–2,100m',
    harvestWindow: 'Nov–Jan',
    description:
      'Home to the Gesha Village estate, planted from seed collected in the nearby Gori Gesha forest. Bench Maji sits in Ethiopia\'s remote south-west, where wild coffee still grows under forest canopy — the genetic source of the variety that made Panama famous.',
    varieties: ['gesha', 'heirloom'],
    communityScore: [4.4, 2.9, 3.8, 4.7, 4.1],
    roasters: ['Heart Coffee'],
  },
  {
    slug: 'huila',
    name: 'Huila',
    country: 'Colombia',
    region: 'Huila',
    elevation: '1,500–1,900m',
    harvestWindow: 'Apr–Jun, Oct–Dec',
    description:
      'Colombia\'s most celebrated department, a patchwork of small farms across steep Andean valleys with two harvests a year. Huila is the heartland of the modern Colombian experimental-process movement; producers like Finca El Paraíso push thermal-shock and anaerobic fermentations to dazzling, sometimes divisive, intensity.',
    varieties: ['castillo', 'caturra', 'pink-bourbon'],
    communityScore: [3.6, 3.4, 4.0, 4.1, 3.5],
    roasters: ['Onyx Coffee Lab'],
  },
  {
    slug: 'cundinamarca',
    name: 'Cundinamarca',
    country: 'Colombia',
    region: 'Cundinamarca',
    elevation: '1,500–1,800m',
    harvestWindow: 'Apr–Jun, Oct–Dec',
    description:
      'The department surrounding Bogotá, where La Palma y El Tucán built a model of community sourcing and meticulous fermentation. Clean, structured, classically Colombian cups with bright red-fruit acidity.',
    varieties: ['castillo', 'caturra', 'typica'],
    communityScore: [3.7, 3.3, 3.9, 3.8, 4.0],
    roasters: ['Nomad Coffee'],
  },
  {
    slug: 'nyeri',
    name: 'Nyeri',
    country: 'Kenya',
    region: 'Central',
    elevation: '1,700–2,000m',
    harvestWindow: 'Oct–Dec (main)',
    description:
      'Red volcanic soils on the slopes of Mount Kenya give Nyeri its signature: blackcurrant, tomato-leaf, and a structured, almost savoury acidity. Centralised washing stations ("factories") run by cooperatives double-ferment and meticulously grade by density.',
    varieties: ['sl28', 'sl34', 'ruiru-11'],
    communityScore: [4.6, 3.6, 3.4, 4.2, 3.8],
    roasters: ['Square Mile', 'Tim Wendelboe'],
  },
  {
    slug: 'antigua',
    name: 'Antigua',
    country: 'Guatemala',
    region: 'Sacatepéquez',
    elevation: '1,500–1,700m',
    harvestWindow: 'Jan–Mar',
    description:
      'A high valley ringed by three volcanoes whose ash enriches the soil. Antigua is the archetypal "balanced" origin — cocoa, gentle citrus, and a velvety body — grown largely on established estates with deep shade.',
    varieties: ['bourbon', 'caturra', 'catuai'],
    communityScore: [3.4, 3.8, 4.0, 3.6, 3.9],
    roasters: ['Onyx Coffee Lab'],
  },
  {
    slug: 'boquete',
    name: 'Boquete',
    country: 'Panama',
    region: 'Chiriquí',
    elevation: '1,400–1,900m',
    harvestWindow: 'Dec–Mar',
    description:
      'The misty highlands where Hacienda La Esmeralda revealed Gesha to the specialty world in 2004, resetting the record price of green coffee. Cool nights and "bajareque" mist slow maturation and concentrate the jasmine-bergamot aromatics Boquete is now defined by.',
    varieties: ['gesha', 'catuai', 'bourbon'],
    communityScore: [4.3, 2.8, 4.1, 4.6, 4.2],
    roasters: ['Heart Coffee', 'Tim Wendelboe'],
  },
  {
    slug: 'nyamasheke',
    name: 'Nyamasheke',
    country: 'Rwanda',
    region: 'Western Province',
    elevation: '1,700–2,000m',
    harvestWindow: 'Mar–Jun',
    description:
      'Hills above Lake Kivu where Red Bourbon thrives. Rwandan coffee blends a Kenyan-style brightness with delicate floral sweetness, though producers fight the "potato defect" with rigorous cherry sorting.',
    varieties: ['bourbon'],
    communityScore: [4.0, 3.3, 3.9, 3.8, 3.7],
    roasters: ['Square Mile'],
  },
  {
    slug: 'haraz',
    name: 'Haraz',
    country: 'Yemen',
    region: 'Sana\'a',
    elevation: '1,800–2,400m',
    harvestWindow: 'Oct–Dec',
    description:
      'Terraced mountainsides farmed continuously for over five centuries — the oldest cultivated coffee on earth. Dry-processed by necessity on rooftops, Yemeni coffee is wild, winey, and spiced, with a chaotic complexity no other origin replicates.',
    varieties: ['yemenia', 'typica'],
    communityScore: [3.5, 4.2, 4.0, 4.7, 2.9],
    roasters: ['Has Bean'],
  },
  {
    slug: 'cerrado',
    name: 'Cerrado Mineiro',
    country: 'Brazil',
    region: 'Minas Gerais',
    elevation: '900–1,250m',
    harvestWindow: 'May–Sep',
    description:
      'A vast, mechanised plateau and Brazil\'s first demarcated origin. Flat terrain and a defined dry season suit uniform ripening and natural processing — the source of the chocolate-and-nut backbone in espresso blends worldwide.',
    varieties: ['bourbon', 'catuai', 'mundo-novo'],
    communityScore: [2.6, 4.4, 4.1, 3.0, 3.6],
    roasters: ['Nomad Coffee'],
  },
  {
    slug: 'cajamarca',
    name: 'Cajamarca',
    country: 'Peru',
    region: 'Cajamarca',
    elevation: '1,600–2,000m',
    harvestWindow: 'May–Sep',
    description:
      'Northern Peru\'s smallholder heartland, much of it organic-certified by default. Gentle, sweet, and clean — Cajamarca is the quiet workhorse of value-driven specialty, increasingly capable of standout washed lots.',
    varieties: ['bourbon', 'caturra', 'typica'],
    communityScore: [3.3, 3.4, 3.9, 3.4, 4.0],
    roasters: ['Has Bean'],
  },
  {
    slug: 'kayanza',
    name: 'Kayanza',
    country: 'Burundi',
    region: 'Kayanza',
    elevation: '1,700–2,000m',
    harvestWindow: 'Mar–Jul',
    description:
      'High northern hills where Bourbon delivers a juicy, jammy cup with Rwandan-style florals. Tiny smallholdings deliver to hilltop washing stations; double fermentation and clean water give Burundi its sparkle.',
    varieties: ['bourbon'],
    communityScore: [4.1, 3.2, 4.0, 3.9, 3.8],
    roasters: ['Square Mile'],
  },
  {
    slug: 'santa-barbara',
    name: 'Santa Bárbara',
    country: 'Honduras',
    region: 'Santa Bárbara',
    elevation: '1,400–1,800m',
    harvestWindow: 'Dec–Mar',
    description:
      'A mountain that became a phenomenon — isolated micro-farms producing Parainema and Bourbon lots of startling clarity. Honduras\' answer to Ethiopia, when the fermentation is dialled in.',
    varieties: ['bourbon', 'parainema', 'catuai'],
    communityScore: [3.8, 3.3, 4.0, 4.0, 3.7],
    roasters: ['Onyx Coffee Lab'],
  },
  {
    slug: 'caranavi',
    name: 'Caranavi',
    country: 'Bolivia',
    region: 'Las Yungas',
    elevation: '1,400–1,700m',
    harvestWindow: 'Jul–Oct',
    description:
      'Steep cloud-forest slopes descending from the Andes into the Amazon basin. Bolivia\'s tiny output is almost entirely smallholder Caturra and Typica — floral, tea-like, and increasingly sought after.',
    varieties: ['caturra', 'typica', 'gesha'],
    communityScore: [3.9, 3.0, 3.8, 4.0, 4.1],
    roasters: ['Tim Wendelboe'],
  },
  {
    slug: 'tarrazu',
    name: 'Tarrazú',
    country: 'Costa Rica',
    region: 'Los Santos',
    elevation: '1,500–1,900m',
    harvestWindow: 'Dec–Mar',
    description:
      'The high-altitude benchmark of Costa Rican coffee and the birthplace of the micro-mill revolution, where individual producers process their own honey lots. Bright, clean, and crisply sweet.',
    varieties: ['caturra', 'catuai', 'villa-sarchi'],
    communityScore: [4.0, 3.2, 4.1, 3.6, 4.3],
    roasters: ['Heart Coffee'],
  },
];

export const VARIETIES: WorldVariety[] = [
  { slug: 'gesha', name: 'Gesha', species: 'Arabica', originSlug: 'bench-maji', description: 'Collected from the Gori Gesha forest in 1936 and made famous in Panama. Long, narrow beans yielding jasmine, bergamot, and tropical florals at high elevation — and very little at low. Low-yielding and disease-prone, hence its price.', flavourProfile: [4.5, 2.6, 4.2, 4.8, 4.3], communityScore: [4.4, 2.8, 4.1, 4.7, 4.2] },
  { slug: 'bourbon', name: 'Bourbon', species: 'Arabica', originSlug: 'nyamasheke', description: 'A natural mutation of Typica that arose on Île Bourbon (Réunion). Rounder and sweeter than Typica with notable caramel and red-fruit sweetness; the parent of countless modern cultivars.', flavourProfile: [3.4, 3.6, 4.3, 3.6, 3.8], communityScore: [3.5, 3.5, 4.2, 3.6, 3.8] },
  { slug: 'typica', name: 'Typica', species: 'Arabica', originSlug: 'haraz', description: 'The genetic baseline from which most Arabica descends, carried from Yemen across the world. Clean, sweet, and elegant but low-yielding and susceptible to leaf rust.', flavourProfile: [3.2, 3.3, 3.9, 3.4, 4.0], communityScore: [3.3, 3.3, 3.9, 3.4, 4.0] },
  { slug: 'sl28', name: 'SL28', species: 'Arabica', originSlug: 'nyeri', description: 'Selected by Scott Laboratories in 1930s Kenya for drought tolerance. Deep, structured blackcurrant acidity — the signature of great Kenyan coffee — on old, deep-rooted plants.', flavourProfile: [4.7, 3.5, 3.4, 4.2, 3.8], communityScore: [4.6, 3.5, 3.4, 4.2, 3.8] },
  { slug: 'sl34', name: 'SL34', species: 'Arabica', originSlug: 'nyeri', description: 'A Scott Labs sibling to SL28, tolerant of higher rainfall and a touch heavier in body. Rich and full with the same Kenyan acidic backbone.', flavourProfile: [4.3, 3.8, 3.5, 4.0, 3.7], communityScore: [4.2, 3.7, 3.5, 4.0, 3.7] },
  { slug: 'catuai', name: 'Catuai', species: 'Arabica (hybrid)', originSlug: 'cerrado', description: 'A compact Mundo Novo × Caturra cross bred in Brazil for wind resistance and yield. Dependable and sweet, if less aromatic than the heirlooms — a Central American staple.', flavourProfile: [3.0, 3.6, 3.8, 3.0, 3.6], communityScore: [3.0, 3.6, 3.8, 3.1, 3.6] },
  { slug: 'caturra', name: 'Caturra', species: 'Arabica (mutation)', originSlug: 'cerrado', description: 'A dwarf mutation of Bourbon found in Brazil, prized for high density planting. Bright and clean with good sweetness; the workhorse of Colombia and Central America.', flavourProfile: [3.6, 3.3, 3.9, 3.3, 3.9], communityScore: [3.6, 3.3, 3.9, 3.3, 3.9] },
  { slug: 'pacamara', name: 'Pacamara', species: 'Arabica (hybrid)', originSlug: 'santa-barbara', description: 'A Salvadoran cross of Pacas and the giant-beaned Maragogype. Enormous beans and a wild, herbaceous, fruit-bomb cup that swings between brilliant and polarising.', flavourProfile: [4.0, 3.8, 3.9, 4.4, 3.2], communityScore: [3.9, 3.7, 3.9, 4.3, 3.2] },
  { slug: 'maragogype', name: 'Maragogype', species: 'Arabica (mutation)', originSlug: 'cerrado', description: 'The "elephant bean" — a giant Typica mutation from Brazil. Low-yielding and mild, with a soft, delicate sweetness and gentle acidity.', flavourProfile: [2.9, 3.2, 3.7, 3.2, 3.9], communityScore: [2.9, 3.2, 3.7, 3.2, 3.9] },
  { slug: 'laurina', name: 'Laurina', species: 'Arabica (mutation)', originSlug: 'nyamasheke', description: 'A naturally low-caffeine Bourbon mutation (also "Bourbon Pointu") with a conical plant. Soft, sweet, and gentle, with roughly half the caffeine of typical Arabica.', flavourProfile: [3.0, 2.8, 4.1, 3.2, 4.2], communityScore: [3.0, 2.8, 4.0, 3.2, 4.1] },
  { slug: 'wush-wush', name: 'Wush Wush', species: 'Arabica', originSlug: 'yirgacheffe', description: 'An Ethiopian landrace named for its home village, now grown in Colombia and beyond. Intensely floral and tropical, with a tea-like delicacy approaching Gesha.', flavourProfile: [4.2, 2.7, 4.0, 4.4, 4.2], communityScore: [4.1, 2.8, 4.0, 4.3, 4.2] },
  { slug: 'heirloom', name: 'Ethiopian Heirloom', species: 'Arabica', originSlug: 'yirgacheffe', description: 'A catch-all for the thousands of indigenous, often un-catalogued Arabica types growing semi-wild across Ethiopia. Collectively responsible for coffee\'s most diverse and floral cups.', flavourProfile: [4.0, 2.9, 3.8, 4.4, 4.0], communityScore: [4.0, 2.9, 3.8, 4.4, 4.0] },
  { slug: 'castillo', name: 'Castillo', species: 'Arabica (hybrid)', originSlug: 'huila', description: 'Colombia\'s leaf-rust-resistant Caturra × Timor hybrid, released by Cenicafé in 2005. Once dismissed, well-grown Castillo now wins competitions — clean, sweet, and reliably bright.', flavourProfile: [3.5, 3.3, 3.9, 3.4, 3.9], communityScore: [3.5, 3.3, 3.9, 3.4, 3.9] },
  { slug: 'marsellesa', name: 'Marsellesa', species: 'Arabica (hybrid)', originSlug: 'santa-barbara', description: 'A Sarchimor-line rust-resistant hybrid bred by ECOM/CIRAD, popular across Central America for stable, sweet, chocolatey cups with solid body.', flavourProfile: [3.1, 3.7, 3.9, 3.2, 3.6], communityScore: [3.1, 3.6, 3.9, 3.2, 3.6] },
  { slug: 'sudan-rume', name: 'Sudan Rume', species: 'Arabica', originSlug: 'bench-maji', description: 'A rare wild landrace from the Boma Plateau of South Sudan, valued by breeders for intense sweetness and complexity. A parent of many modern F1 hybrids.', flavourProfile: [4.1, 3.4, 4.4, 4.5, 3.7], communityScore: [4.0, 3.4, 4.3, 4.4, 3.7] },
];

export const PROCESSES: WorldProcess[] = [
  { slug: 'washed', name: 'Washed', family: 'Washed', description: 'Fruit is pulped and the remaining mucilage fermented off in water before drying the clean parchment. Strips away fruit-derived sugars to expose the bean\'s intrinsic character — the cleanest, most transparent and acidity-forward style.', effectOnCup: [4.2, 2.8, 3.4, 3.6, 4.6], communityScore: [4.0, 2.9, 3.4, 3.6, 4.5] },
  { slug: 'natural', name: 'Natural', family: 'Natural', description: 'Whole cherry is dried intact, the bean absorbing sugars and esters from the fruit. Bigger body, heavier sweetness, and pronounced berry/tropical notes — at the cost of cleanliness if drying is uneven.', effectOnCup: [3.2, 4.0, 4.4, 4.0, 3.0], communityScore: [3.2, 4.0, 4.3, 4.0, 3.0] },
  { slug: 'honey', name: 'Honey', family: 'Honey', description: 'Pulped but dried with some mucilage left on (white→yellow→red→black by how much). A middle path: rounder sweetness and body than washed, more clarity than natural.', effectOnCup: [3.5, 3.6, 4.2, 3.6, 3.8], communityScore: [3.5, 3.6, 4.1, 3.6, 3.8] },
  { slug: 'anaerobic-natural', name: 'Anaerobic Natural', family: 'Anaerobic', description: 'Whole cherry ferments in a sealed, oxygen-free tank before natural drying. CO₂-rich fermentation amplifies fruit into boozy, syrupy, sometimes savoury intensity — the headline of modern competition coffee.', effectOnCup: [3.0, 4.2, 4.5, 4.6, 2.6], communityScore: [3.1, 4.1, 4.4, 4.5, 2.7] },
  { slug: 'anaerobic-washed', name: 'Anaerobic Washed', family: 'Anaerobic', description: 'Sealed anaerobic fermentation followed by washing. Keeps a washed cup\'s clarity while layering in the funk and aromatic lift of oxygen-free fermentation.', effectOnCup: [3.8, 3.4, 4.0, 4.3, 3.8], communityScore: [3.8, 3.4, 4.0, 4.2, 3.8] },
  { slug: 'carbonic-maceration', name: 'Carbonic Maceration', family: 'Anaerobic', description: 'Borrowed from Beaujolais winemaking: whole cherry macerates under pressurised CO₂. Produces vivid, almost candied fruit and a glossy, wine-like body. Process-led and divisive.', effectOnCup: [3.4, 3.8, 4.5, 4.5, 2.8], communityScore: [3.4, 3.7, 4.4, 4.4, 2.9] },
  { slug: 'wet-hulled', name: 'Wet-Hulled', family: 'Other', description: 'Giling basah — the Indonesian method of hulling parchment while still wet, then finishing drying. Low acidity, huge syrupy body, and earthy, cedar, savoury notes; the signature of Sumatra.', effectOnCup: [2.2, 4.6, 3.4, 3.8, 2.6], communityScore: [2.3, 4.5, 3.4, 3.7, 2.7] },
  { slug: 'double-fermentation', name: 'Double Fermentation', family: 'Washed', description: 'Two distinct ferments (often a dry then a wet stage) to build acidity structure and sweetness. A hallmark of Kenyan and high-end Burundian washing stations.', effectOnCup: [4.4, 3.2, 3.8, 4.0, 4.0], communityScore: [4.3, 3.2, 3.8, 4.0, 4.0] },
  { slug: 'extended-fermentation', name: 'Extended Fermentation', family: 'Other', description: 'Deliberately prolonged fermentation (sometimes 60–120h+) to deepen fruit and develop winey, fermented complexity. Powerful but a tightrope between brilliance and defect.', effectOnCup: [3.4, 3.9, 4.4, 4.5, 2.8], communityScore: [3.4, 3.8, 4.3, 4.4, 2.9] },
  { slug: 'experimental', name: 'Experimental', family: 'Other', description: 'The catch-all for yeast-inoculated, thermal-shock, infused, and otherwise novel fermentations. Reproducibility and "is it still coffee?" debates included free of charge.', effectOnCup: [3.4, 3.8, 4.3, 4.6, 2.8], communityScore: [3.3, 3.7, 4.2, 4.5, 2.9] },
];

export const ROASTERS: WorldRoaster[] = [
  { slug: 'square-mile', name: 'Square Mile', city: 'London', country: 'UK', sourcingModel: 'Direct + importer partnerships', philosophy: 'Clarity-first roasting; long-running relationships in Ethiopia and Kenya.', transparencyScore: 4, currentOfferings: ['Kochere Lot 42', 'Nyeri AA', 'Red Brick (blend)'] },
  { slug: 'onyx', name: 'Onyx Coffee Lab', city: 'Rogers, AR', country: 'USA', sourcingModel: 'Direct trade', philosophy: 'Competition-driven, process-forward, radical price transparency.', transparencyScore: 5, currentOfferings: ['Finca El Paraíso', 'Geometry (blend)', 'Southern Weather'] },
  { slug: 'heart', name: 'Heart Coffee', city: 'Portland, OR', country: 'USA', sourcingModel: 'Direct + importer', philosophy: 'Light, expressive roasting that chases origin transparency.', transparencyScore: 4, currentOfferings: ['Gesha Village Lot 22', 'Tarrazú Honey'] },
  { slug: 'has-bean', name: 'Has Bean', city: 'Stafford', country: 'UK', sourcingModel: 'Direct + In My Mug program', philosophy: 'Approachable transparency; a new coffee documented every week.', transparencyScore: 4, currentOfferings: ['Guji Natural Gr.1', 'Jailbreak (blend)'] },
  { slug: 'nomad', name: 'Nomad Coffee', city: 'Barcelona', country: 'Spain', sourcingModel: 'Direct + collaborations', philosophy: 'Modern European light roasting with a designer\'s eye.', transparencyScore: 3, currentOfferings: ['La Palma y El Tucán', 'Cerrado Espresso'] },
  { slug: 'tim-wendelboe', name: 'Tim Wendelboe', city: 'Oslo', country: 'Norway', sourcingModel: 'Direct trade + own farm (Finca Tamana)', philosophy: 'Agronomy-led, ultra-light, relationship coffee taken to the extreme.', transparencyScore: 5, currentOfferings: ['Nyeri', 'Caranavi', 'El Desarrollo'] },
];

// Short flavour tags per origin, for cards + node headers.
const FLAVOUR_BY_SLUG: Record<string, string[]> = {
  yirgacheffe: ['Floral', 'Citric', 'Tea-like'],
  guji: ['Berry', 'Tropical', 'Syrupy'],
  'bench-maji': ['Jasmine', 'Bergamot', 'Peach'],
  huila: ['Red fruit', 'Winey', 'Intense'],
  cundinamarca: ['Red apple', 'Caramel', 'Clean'],
  nyeri: ['Blackcurrant', 'Tomato', 'Structured'],
  antigua: ['Cocoa', 'Citrus', 'Velvety'],
  boquete: ['Jasmine', 'Bergamot', 'Honey'],
  nyamasheke: ['Floral', 'Citrus', 'Sweet'],
  haraz: ['Winey', 'Spiced', 'Wild'],
  cerrado: ['Chocolate', 'Nutty', 'Heavy'],
  cajamarca: ['Sweet', 'Gentle', 'Clean'],
  kayanza: ['Jammy', 'Floral', 'Juicy'],
  'santa-barbara': ['Stone fruit', 'Floral', 'Clear'],
  caranavi: ['Floral', 'Tea-like', 'Delicate'],
  tarrazu: ['Bright', 'Crisp', 'Sweet'],
};

export function flavourFor(slug: string): string[] {
  return FLAVOUR_BY_SLUG[slug] ?? ['Balanced', 'Sweet', 'Clean'];
}

// ─── Lookups + search ─────────────────────────────────────────
export const originBySlug = (slug: string): WorldOrigin | undefined => ORIGINS.find((o) => o.slug === slug);
export const varietyBySlug = (slug: string): WorldVariety | undefined => VARIETIES.find((v) => v.slug === slug);
export const processBySlug = (slug: string): WorldProcess | undefined => PROCESSES.find((p) => p.slug === slug);
export const roasterBySlug = (slug: string): WorldRoaster | undefined => ROASTERS.find((r) => r.slug === slug);
export const roasterByName = (name: string): WorldRoaster | undefined =>
  ROASTERS.find((r) => r.name.toLowerCase() === name.toLowerCase());

export type WorldNodeType = 'Origin' | 'Variety' | 'Process' | 'Roaster';

export interface WorldHit {
  type: WorldNodeType;
  slug: string;
  title: string;
  subtitle: string;
}

/** Local full-text-ish search across every World node. */
export function searchWorld(query: string): WorldHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: WorldHit[] = [];
  for (const o of ORIGINS) {
    if (`${o.name} ${o.country} ${o.region} ${o.description}`.toLowerCase().includes(q)) {
      hits.push({ type: 'Origin', slug: o.slug, title: o.name, subtitle: `${o.country} · ${o.region}` });
    }
  }
  for (const v of VARIETIES) {
    if (`${v.name} ${v.species} ${v.description}`.toLowerCase().includes(q)) {
      hits.push({ type: 'Variety', slug: v.slug, title: v.name, subtitle: v.species });
    }
  }
  for (const p of PROCESSES) {
    if (`${p.name} ${p.family} ${p.description}`.toLowerCase().includes(q)) {
      hits.push({ type: 'Process', slug: p.slug, title: p.name, subtitle: `${p.family} process` });
    }
  }
  for (const r of ROASTERS) {
    if (`${r.name} ${r.city} ${r.country} ${r.philosophy}`.toLowerCase().includes(q)) {
      hits.push({ type: 'Roaster', slug: r.slug, title: r.name, subtitle: `${r.city}, ${r.country}` });
    }
  }
  return hits.slice(0, 12);
}
