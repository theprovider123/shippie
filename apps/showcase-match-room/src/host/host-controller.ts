export const POPULAR_PLAYERS = [
  'Kylian Mbappe',
  'Jude Bellingham',
  'Aitana Bonmati',
  'Erling Haaland',
  'Alexia Putellas',
  'Vinicius Junior',
  'Sam Kerr',
  'Lionel Messi',
  'Cristiano Ronaldo',
  'Mohamed Salah',
  'Lamine Yamal',
  'Sophia Smith',
  'Harry Kane',
  'Lautaro Martinez',
  'Caroline Graham Hansen',
  'Rodri',
];

export const ROOM_MEMBER_EXAMPLES = [
  'Amina',
  'Leo',
  'Sofia',
  'Mateo',
  'Priya',
  'Noah',
  'Kenji',
  'Lucia',
  'Maya',
  'Omar',
  'Ella',
  'Rafa',
];

export const DRAW_SEEDS = ['azteca-opening', 'group-chat-glory', 'pub-table-7', 'family-final', 'office-lunch-five'];

export function randomPlayerPlaceholder(): string {
  return sample(POPULAR_PLAYERS, 6).join(', ');
}

export function randomMemberPlaceholder(): string {
  return sample(ROOM_MEMBER_EXAMPLES, 6).join(', ');
}

export function randomDrawSeed(): string {
  return DRAW_SEEDS[Math.floor(Math.random() * DRAW_SEEDS.length)] ?? 'azteca-opening';
}

export function durationFromMinutes(minutes: number): number {
  return Math.max(15, Math.round(minutes * 60));
}

function sample(values: string[], count: number): string[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index] ?? '';
    const replacement = copy[swap] ?? '';
    copy[index] = replacement;
    copy[swap] = current;
  }
  return copy.slice(0, count);
}
