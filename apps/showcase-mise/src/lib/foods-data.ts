/**
 * Mise — offline-canonical food database.
 *
 * ~130 common foods, hand-authored from public per-100 g nutrition
 * averages (USDA-ish, rounded). This ships in the bundle so logging
 * works with zero network. User-created foods are layered on top from
 * localStorage (see store.ts); optional online enrichment (enrich.ts)
 * is off by default and only ever *adds* — it never replaces this.
 *
 * Nutrients are per 100 g. Each food carries one sensible default
 * serving so a single tap logs a realistic portion, plus optional
 * alternate servings for the portion picker.
 *
 * `water_ml` is the hydrating fluid contributed per 100 g. We only
 * attribute it to beverages and soups — solid foods read 0 so the
 * hydration signal stays a "did you drink enough" measure rather than
 * a moisture estimate. Caffeine is mg per 100 g.
 */

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export const SLOTS: readonly Slot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  drink: 'Drink',
};

export type FoodCategory =
  | 'protein'
  | 'dairy-egg'
  | 'grain'
  | 'legume'
  | 'vegetable'
  | 'fruit'
  | 'nut-fat'
  | 'beverage'
  | 'prepared'
  | 'snack-sweet'
  | 'condiment';

export interface Nutrients {
  /** Energy, kcal. */
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  caffeine_mg: number;
  /** Hydrating fluid contributed, ml. */
  water_ml: number;
}

export interface Serving {
  label: string;
  grams: number;
}

export type FoodSource = 'seed' | 'custom' | 'imported';

export interface Food {
  id: string;
  name: string;
  brand?: string;
  /** Nutrients per 100 g. */
  per100: Nutrients;
  /** Default one-tap serving. */
  serving: Serving;
  /** Optional alternate servings for the portion picker. */
  altServings?: Serving[];
  category: FoodCategory;
  source: FoodSource;
  tags?: string[];
  favorite?: boolean;
}

/**
 * Compact seed row. Order:
 *   id, name, category, servingLabel, servingGrams,
 *   kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg, caffeine_mg, water_ml
 * (all nutrients per 100 g)
 */
type Row = [
  string,
  string,
  FoodCategory,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function row(r: Row, altServings?: Serving[]): Food {
  const [id, name, category, sLabel, sGrams, kcal, p, c, fat, fiber, sodium, caf, water] = r;
  const food: Food = {
    id: `seed_${id}`,
    name,
    per100: {
      kcal,
      protein_g: p,
      carb_g: c,
      fat_g: fat,
      fiber_g: fiber,
      sodium_mg: sodium,
      caffeine_mg: caf,
      water_ml: water,
    },
    serving: { label: sLabel, grams: sGrams },
    category,
    source: 'seed',
  };
  if (altServings) food.altServings = altServings;
  return food;
}

const ROWS: Row[] = [
  // ── Protein (meat / fish / eggs cooked) ───────────────────────
  ['chicken_breast', 'Chicken breast, cooked', 'protein', 'fillet', 140, 165, 31, 0, 3.6, 0, 74, 0, 0],
  ['chicken_thigh', 'Chicken thigh, cooked', 'protein', 'thigh', 110, 209, 26, 0, 10.9, 0, 88, 0, 0],
  ['ground_beef_90', 'Ground beef 90% lean, cooked', 'protein', 'serving', 113, 217, 26, 0, 12, 0, 75, 0, 0],
  ['steak_sirloin', 'Sirloin steak, cooked', 'protein', 'steak', 170, 206, 29, 0, 9, 0, 56, 0, 0],
  ['pork_chop', 'Pork chop, cooked', 'protein', 'chop', 130, 231, 26, 0, 13, 0, 62, 0, 0],
  ['bacon', 'Bacon, cooked', 'protein', 'slice', 12, 541, 37, 1.4, 42, 0, 1717, 0, 0],
  ['turkey_breast', 'Turkey breast, cooked', 'protein', 'serving', 120, 135, 30, 0, 1, 0, 55, 0, 0],
  ['salmon', 'Salmon, cooked', 'protein', 'fillet', 130, 208, 22, 0, 13, 0, 59, 0, 0],
  ['tuna_canned', 'Tuna, canned in water', 'protein', 'can', 120, 116, 26, 0, 1, 0, 247, 0, 0],
  ['shrimp', 'Shrimp, cooked', 'protein', 'serving', 85, 99, 24, 0.2, 0.3, 0, 111, 0, 0],
  ['cod', 'Cod, cooked', 'protein', 'fillet', 120, 105, 23, 0, 0.9, 0, 78, 0, 0],
  ['egg', 'Egg', 'dairy-egg', 'egg', 50, 143, 13, 0.7, 9.5, 0, 142, 0, 0],
  ['egg_white', 'Egg white', 'dairy-egg', 'white', 33, 52, 11, 0.7, 0.2, 0, 166, 0, 0],
  ['tofu_firm', 'Tofu, firm', 'protein', 'block', 120, 144, 17, 3, 9, 2, 14, 0, 0],
  ['tempeh', 'Tempeh', 'protein', 'serving', 100, 192, 20, 8, 11, 0, 9, 0, 0],

  // ── Dairy & egg ───────────────────────────────────────────────
  ['greek_yogurt', 'Greek yogurt, plain nonfat', 'dairy-egg', 'cup', 170, 59, 10, 3.6, 0.4, 0, 36, 0, 0],
  ['yogurt_whole', 'Yogurt, whole milk plain', 'dairy-egg', 'cup', 170, 61, 3.5, 4.7, 3.3, 0, 46, 0, 0],
  ['cottage_cheese', 'Cottage cheese, lowfat', 'dairy-egg', 'cup', 220, 84, 11, 4.3, 2.3, 0, 364, 0, 0],
  ['cheddar', 'Cheddar cheese', 'dairy-egg', 'slice', 28, 403, 25, 1.3, 33, 0, 653, 0, 0],
  ['mozzarella', 'Mozzarella, part-skim', 'dairy-egg', 'oz', 28, 254, 24, 2.8, 16, 0, 619, 0, 0],
  ['parmesan', 'Parmesan, grated', 'dairy-egg', 'tbsp', 5, 431, 38, 4.1, 29, 0, 1529, 0, 0],
  ['butter', 'Butter', 'nut-fat', 'pat', 5, 717, 0.9, 0.1, 81, 0, 11, 0, 0],

  // ── Beverages (carry water + caffeine) ────────────────────────
  ['water', 'Water', 'beverage', 'glass', 250, 0, 0, 0, 0, 0, 0, 0, 100],
  ['sparkling_water', 'Sparkling water', 'beverage', 'can', 355, 0, 0, 0, 0, 0, 4, 0, 100],
  ['coffee_black', 'Coffee, black', 'beverage', 'mug', 240, 1, 0.1, 0, 0, 0, 2, 40, 99],
  ['espresso', 'Espresso', 'beverage', 'shot', 30, 9, 0.1, 1.7, 0.2, 0, 14, 212, 97],
  ['latte', 'Latte', 'beverage', 'cup', 350, 56, 3.1, 4.8, 2.2, 0, 44, 18, 88],
  ['tea_black', 'Tea, black', 'beverage', 'mug', 240, 1, 0, 0.3, 0, 0, 3, 12, 99],
  ['green_tea', 'Green tea', 'beverage', 'mug', 240, 1, 0, 0, 0, 0, 1, 12, 99],
  ['milk_2pct', 'Milk, 2%', 'beverage', 'glass', 240, 50, 3.4, 4.9, 2, 0, 47, 0, 89],
  ['milk_skim', 'Milk, skim', 'beverage', 'glass', 240, 34, 3.4, 5, 0.2, 0, 42, 0, 91],
  ['oat_milk', 'Oat milk', 'beverage', 'glass', 240, 47, 1, 7, 1.5, 0.8, 42, 0, 88],
  ['soy_milk', 'Soy milk, unsweetened', 'beverage', 'glass', 240, 33, 2.9, 1.8, 1.6, 0.4, 21, 0, 92],
  ['orange_juice', 'Orange juice', 'beverage', 'glass', 240, 45, 0.7, 10.4, 0.2, 0.2, 1, 0, 88],
  ['cola', 'Cola', 'beverage', 'can', 355, 41, 0, 10.6, 0, 0, 4, 9, 89],
  ['diet_cola', 'Diet cola', 'beverage', 'can', 355, 0, 0, 0, 0, 0, 7, 13, 99],
  ['beer', 'Beer', 'beverage', 'can', 355, 43, 0.5, 3.6, 0, 0, 4, 0, 92],
  ['wine_red', 'Red wine', 'beverage', 'glass', 150, 85, 0.1, 2.6, 0, 0, 4, 0, 86],
  ['sports_drink', 'Sports drink', 'beverage', 'bottle', 500, 26, 0, 6.4, 0, 0, 41, 0, 93],
  ['energy_drink', 'Energy drink', 'beverage', 'can', 250, 45, 0.2, 11, 0, 0, 41, 32, 87],
  ['protein_shake', 'Protein shake, ready-to-drink', 'beverage', 'bottle', 330, 47, 8, 2.5, 0.8, 0, 60, 0, 84],
  ['kombucha', 'Kombucha', 'beverage', 'cup', 240, 25, 0, 6, 0, 0, 10, 6, 91],

  // ── Grains & starches (cooked) ────────────────────────────────
  ['oats_cooked', 'Oatmeal, cooked', 'grain', 'bowl', 234, 71, 2.5, 12, 1.5, 1.7, 4, 0, 0],
  ['rice_white', 'White rice, cooked', 'grain', 'cup', 158, 130, 2.7, 28, 0.3, 0.4, 1, 0, 0],
  ['rice_brown', 'Brown rice, cooked', 'grain', 'cup', 195, 123, 2.7, 26, 1, 1.6, 4, 0, 0],
  ['quinoa', 'Quinoa, cooked', 'grain', 'cup', 185, 120, 4.4, 21, 1.9, 2.8, 7, 0, 0],
  ['pasta', 'Pasta, cooked', 'grain', 'cup', 140, 158, 5.8, 31, 0.9, 1.8, 1, 0, 0],
  ['bread_whole', 'Whole-wheat bread', 'grain', 'slice', 40, 247, 13, 41, 3.4, 7, 450, 0, 0],
  ['bread_white', 'White bread', 'grain', 'slice', 30, 266, 9, 49, 3.3, 2.7, 491, 0, 0],
  ['bagel', 'Bagel, plain', 'grain', 'bagel', 100, 250, 10, 49, 1.5, 2.1, 439, 0, 0],
  ['tortilla', 'Flour tortilla', 'grain', 'tortilla', 49, 306, 8, 51, 7.5, 2.9, 580, 0, 0],
  ['potato', 'Potato, baked', 'vegetable', 'medium', 173, 93, 2.5, 21, 0.1, 2.2, 10, 0, 0],
  ['sweet_potato', 'Sweet potato, baked', 'vegetable', 'medium', 130, 90, 2, 21, 0.1, 3.3, 36, 0, 0],
  ['cereal', 'Breakfast cereal, plain', 'grain', 'bowl', 40, 379, 8, 84, 3, 7.5, 600, 0, 0],
  ['granola', 'Granola', 'grain', 'serving', 50, 471, 10, 64, 20, 7, 26, 0, 0],

  // ── Legumes ───────────────────────────────────────────────────
  ['black_beans', 'Black beans, cooked', 'legume', 'cup', 172, 132, 8.9, 24, 0.5, 8.7, 1, 0, 0],
  ['chickpeas', 'Chickpeas, cooked', 'legume', 'cup', 164, 164, 8.9, 27, 2.6, 7.6, 7, 0, 0],
  ['lentils', 'Lentils, cooked', 'legume', 'cup', 198, 116, 9, 20, 0.4, 7.9, 2, 0, 0],
  ['kidney_beans', 'Kidney beans, cooked', 'legume', 'cup', 177, 127, 8.7, 23, 0.5, 6.4, 2, 0, 0],
  ['edamame', 'Edamame, shelled', 'legume', 'cup', 155, 121, 12, 9, 5, 5, 6, 0, 0],
  ['hummus', 'Hummus', 'legume', 'serving', 60, 166, 7.9, 14, 9.6, 6, 379, 0, 0],
  ['peanut_butter', 'Peanut butter', 'nut-fat', 'tbsp', 16, 588, 25, 20, 50, 6, 426, 0, 0],

  // ── Vegetables ────────────────────────────────────────────────
  ['broccoli', 'Broccoli, cooked', 'vegetable', 'cup', 156, 35, 2.4, 7.2, 0.4, 3.3, 41, 0, 0],
  ['spinach', 'Spinach, raw', 'vegetable', 'cup', 30, 23, 2.9, 3.6, 0.4, 2.2, 79, 0, 0],
  ['carrot', 'Carrot', 'vegetable', 'medium', 61, 41, 0.9, 9.6, 0.2, 2.8, 69, 0, 0],
  ['tomato', 'Tomato', 'vegetable', 'medium', 123, 18, 0.9, 3.9, 0.2, 1.2, 5, 0, 0],
  ['cucumber', 'Cucumber', 'vegetable', 'cup', 104, 15, 0.7, 3.6, 0.1, 0.5, 2, 0, 0],
  ['bell_pepper', 'Bell pepper', 'vegetable', 'medium', 119, 31, 1, 6, 0.3, 2.1, 4, 0, 0],
  ['mixed_salad', 'Mixed green salad, undressed', 'vegetable', 'bowl', 100, 20, 1.5, 3.5, 0.2, 1.8, 20, 0, 0],
  ['avocado', 'Avocado', 'nut-fat', 'half', 100, 160, 2, 8.5, 14.7, 6.7, 7, 0, 0],
  ['mushroom', 'Mushrooms, cooked', 'vegetable', 'cup', 156, 28, 2.2, 5.3, 0.5, 2.3, 2, 0, 0],
  ['corn', 'Corn, cooked', 'vegetable', 'ear', 90, 96, 3.4, 21, 1.5, 2.4, 1, 0, 0],
  ['green_beans', 'Green beans, cooked', 'vegetable', 'cup', 125, 35, 1.9, 7.9, 0.3, 3.4, 1, 0, 0],

  // ── Fruit ─────────────────────────────────────────────────────
  ['banana', 'Banana', 'fruit', 'medium', 118, 89, 1.1, 23, 0.3, 2.6, 1, 0, 0],
  ['apple', 'Apple', 'fruit', 'medium', 182, 52, 0.3, 14, 0.2, 2.4, 1, 0, 0],
  ['orange', 'Orange', 'fruit', 'medium', 131, 47, 0.9, 12, 0.1, 2.4, 0, 0, 0],
  ['blueberries', 'Blueberries', 'fruit', 'cup', 148, 57, 0.7, 14, 0.3, 2.4, 1, 0, 0],
  ['strawberries', 'Strawberries', 'fruit', 'cup', 152, 32, 0.7, 7.7, 0.3, 2, 1, 0, 0],
  ['grapes', 'Grapes', 'fruit', 'cup', 151, 69, 0.7, 18, 0.2, 0.9, 2, 0, 0],
  ['mango', 'Mango', 'fruit', 'cup', 165, 60, 0.8, 15, 0.4, 1.6, 1, 0, 0],
  ['pineapple', 'Pineapple', 'fruit', 'cup', 165, 50, 0.5, 13, 0.1, 1.4, 1, 0, 0],
  ['grapefruit', 'Grapefruit', 'fruit', 'half', 123, 42, 0.8, 11, 0.1, 1.6, 0, 0, 0],
  ['watermelon', 'Watermelon', 'fruit', 'cup', 152, 30, 0.6, 7.6, 0.2, 0.4, 1, 0, 0],
  ['dates', 'Dates, dried', 'fruit', 'piece', 24, 282, 2.5, 75, 0.4, 8, 2, 0, 0],
  ['raisins', 'Raisins', 'fruit', 'small box', 43, 299, 3.1, 79, 0.5, 3.7, 11, 0, 0],

  // ── Nuts / seeds / fats ───────────────────────────────────────
  ['almonds', 'Almonds', 'nut-fat', 'handful', 28, 579, 21, 22, 50, 12.5, 1, 0, 0],
  ['walnuts', 'Walnuts', 'nut-fat', 'handful', 28, 654, 15, 14, 65, 6.7, 2, 0, 0],
  ['cashews', 'Cashews', 'nut-fat', 'handful', 28, 553, 18, 30, 44, 3.3, 12, 0, 0],
  ['chia', 'Chia seeds', 'nut-fat', 'tbsp', 12, 486, 17, 42, 31, 34, 16, 0, 0],
  ['olive_oil', 'Olive oil', 'nut-fat', 'tbsp', 14, 884, 0, 0, 100, 0, 2, 0, 0],
  ['almond_butter', 'Almond butter', 'nut-fat', 'tbsp', 16, 614, 21, 19, 56, 10, 7, 0, 0],

  // ── Prepared / common meals ───────────────────────────────────
  ['pizza_slice', 'Pizza, cheese', 'prepared', 'slice', 107, 266, 11, 33, 10, 2.3, 598, 0, 0],
  ['burger', 'Cheeseburger', 'prepared', 'burger', 150, 254, 14, 25, 12, 1.3, 497, 0, 0],
  ['burrito', 'Bean & cheese burrito', 'prepared', 'burrito', 200, 206, 8, 30, 6.5, 4, 470, 0, 0],
  ['sushi_roll', 'Sushi roll', 'prepared', 'roll', 200, 145, 5.5, 28, 1.5, 2, 290, 0, 0],
  ['caesar_salad', 'Caesar salad with chicken', 'prepared', 'bowl', 300, 110, 8, 5, 6.5, 2, 320, 0, 0],
  ['sandwich_turkey', 'Turkey sandwich', 'prepared', 'sandwich', 230, 195, 12, 24, 5.5, 3, 560, 0, 0],
  ['ramen', 'Ramen, prepared', 'prepared', 'bowl', 400, 88, 4, 13, 2.5, 1, 760, 0, 0],
  ['stir_fry', 'Vegetable stir-fry with rice', 'prepared', 'bowl', 350, 130, 5, 20, 3.5, 3, 480, 0, 0],
  ['oatmeal_bowl', 'Oatmeal with fruit & nuts', 'prepared', 'bowl', 300, 130, 4.5, 20, 4, 3, 30, 0, 0],
  ['chicken_rice_bowl', 'Chicken & rice bowl', 'prepared', 'bowl', 400, 150, 12, 17, 4, 1.5, 360, 0, 0],
  ['soup_chicken', 'Chicken noodle soup', 'prepared', 'bowl', 245, 38, 2.5, 4.5, 1.2, 0.5, 343, 0, 92],
  ['soup_lentil', 'Lentil soup', 'prepared', 'bowl', 245, 60, 3.8, 10, 0.6, 2.8, 280, 0, 88],

  // ── Snacks / sweets ───────────────────────────────────────────
  ['protein_bar', 'Protein bar', 'snack-sweet', 'bar', 60, 350, 33, 38, 12, 8, 250, 0, 0],
  ['granola_bar', 'Granola bar', 'snack-sweet', 'bar', 35, 471, 8, 64, 20, 5, 290, 0, 0],
  ['dark_chocolate', 'Dark chocolate', 'snack-sweet', 'square', 10, 598, 7.8, 46, 43, 11, 24, 43, 0],
  ['milk_chocolate', 'Milk chocolate', 'snack-sweet', 'bar', 43, 535, 7.6, 59, 30, 3.4, 79, 20, 0],
  ['chips', 'Potato chips', 'snack-sweet', 'small bag', 28, 536, 7, 53, 35, 4.4, 525, 0, 0],
  ['crackers', 'Crackers', 'snack-sweet', 'serving', 30, 502, 9, 61, 25, 3, 750, 0, 0],
  ['popcorn', 'Popcorn, air-popped', 'snack-sweet', 'cup', 8, 387, 13, 78, 4.5, 15, 8, 0, 0],
  ['ice_cream', 'Ice cream, vanilla', 'snack-sweet', 'scoop', 66, 207, 3.5, 24, 11, 0.7, 80, 0, 0],
  ['cookie', 'Cookie', 'snack-sweet', 'cookie', 16, 480, 5.5, 64, 22, 2.3, 350, 5, 0],
  ['muffin', 'Blueberry muffin', 'snack-sweet', 'muffin', 113, 377, 5, 54, 16, 1.5, 330, 0, 0],
  ['donut', 'Donut, glazed', 'snack-sweet', 'donut', 60, 452, 4.9, 51, 25, 1.5, 373, 0, 0],
  ['pretzels', 'Pretzels', 'snack-sweet', 'serving', 30, 380, 10, 80, 2.6, 3, 1240, 0, 0],
  ['trail_mix', 'Trail mix', 'snack-sweet', 'handful', 40, 462, 14, 45, 29, 6, 110, 0, 0],

  // ── Condiments / extras ───────────────────────────────────────
  ['ketchup', 'Ketchup', 'condiment', 'tbsp', 17, 101, 1.2, 25, 0.1, 0.3, 907, 0, 0],
  ['mayo', 'Mayonnaise', 'condiment', 'tbsp', 14, 680, 1, 0.6, 75, 0, 635, 0, 0],
  ['soy_sauce', 'Soy sauce', 'condiment', 'tbsp', 16, 53, 8, 4.9, 0.6, 0.8, 5493, 0, 0],
  ['salad_dressing', 'Ranch dressing', 'condiment', 'tbsp', 15, 430, 1, 6, 45, 0, 1030, 0, 0],
  ['honey', 'Honey', 'condiment', 'tbsp', 21, 304, 0.3, 82, 0, 0.2, 4, 0, 0],
  ['maple_syrup', 'Maple syrup', 'condiment', 'tbsp', 20, 260, 0, 67, 0.1, 0, 12, 0, 0],
];

export const SEED_FOODS: readonly Food[] = ROWS.map((r) => row(r));

/** Quick lookup by id (seed only). */
export const SEED_FOODS_BY_ID: ReadonlyMap<string, Food> = new Map(
  SEED_FOODS.map((f) => [f.id, f]),
);
