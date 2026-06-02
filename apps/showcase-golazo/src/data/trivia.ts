// Evergreen World Cup / football trivia — no live data, never goes stale. Each
// question has 4 options; `answer` is the index of the correct one.

export interface TriviaQ {
  q: string;
  options: [string, string, string, string];
  answer: number;
}

export const TRIVIA: TriviaQ[] = [
  { q: "Which country has won the most World Cups?", options: ["Germany", "Brazil", "Italy", "Argentina"], answer: 1 },
  { q: "Who scored the 'Hand of God' goal in 1986?", options: ["Pelé", "Maradona", "Zico", "Platini"], answer: 1 },
  { q: "Where was the first World Cup held in 1930?", options: ["Brazil", "Italy", "Uruguay", "France"], answer: 2 },
  { q: "Which player has scored the most World Cup goals?", options: ["Klose", "Ronaldo", "Müller", "Messi"], answer: 0 },
  { q: "Who won the 2022 World Cup?", options: ["France", "Argentina", "Croatia", "Morocco"], answer: 1 },
  { q: "How many players are on the pitch per team?", options: ["10", "11", "12", "9"], answer: 1 },
  { q: "Which nation hosts (with Canada & Mexico) in 2026?", options: ["USA", "Brazil", "Qatar", "Spain"], answer: 0 },
  { q: "What's awarded to the World Cup's top scorer?", options: ["Golden Ball", "Golden Boot", "Golden Glove", "Silver Ball"], answer: 1 },
  { q: "Which country knocked out favourites in 2022 as the surprise package, reaching the semis?", options: ["Japan", "Morocco", "Senegal", "Ghana"], answer: 1 },
  { q: "Zinedine Zidane was sent off in the 2006 final for…", options: ["A dive", "A headbutt", "Two yellows", "Handball"], answer: 1 },
  { q: "Which is NOT a real World Cup mascot?", options: ["Zakumi", "Footix", "Striker", "Goleo"], answer: 2 },
  { q: "How often is the World Cup held?", options: ["Every 2 years", "Every 3 years", "Every 4 years", "Every 5 years"], answer: 2 },
  { q: "Who lifts the trophy — captain of the…", options: ["Hosts", "Winners", "Top scorers", "Fair-play team"], answer: 1 },
  { q: "Which English club shares its name with a 1966 hero's surname — 'Moore'?", options: ["Bobby Moore (West Ham)", "Stan Moore", "Joe Moore", "Moore City"], answer: 0 },
  { q: "Pelé won his first World Cup aged…", options: ["17", "21", "25", "19"], answer: 0 },
  { q: "How many teams play at the 2026 World Cup?", options: ["32", "40", "48", "24"], answer: 2 },
];

/** A fresh shuffled set of n questions. */
export function pickTrivia(n: number): TriviaQ[] {
  const pool = [...TRIVIA];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
