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
  // ── British / pub-quiz football ──
  { q: "Who scored a hat-trick in the 1966 World Cup final?", options: ["Bobby Charlton", "Geoff Hurst", "Martin Peters", "Roger Hunt"], answer: 1 },
  { q: "England's all-time top scorer?", options: ["Wayne Rooney", "Bobby Charlton", "Harry Kane", "Gary Lineker"], answer: 2 },
  { q: "Gazza cried at which World Cup?", options: ["Italia '90", "Mexico '86", "USA '94", "France '98"], answer: 0 },
  { q: "Who knocked England out in 1986 (Hand of God)?", options: ["Germany", "Argentina", "Brazil", "France"], answer: 1 },
  { q: "Nation in the most World Cup finals?", options: ["Brazil", "Italy", "Germany", "Argentina"], answer: 2 },
  { q: "Who scored the winner in the 2010 final?", options: ["Villa", "Xavi", "Iniesta", "Puyol"], answer: 2 },
  { q: "The Maracanã is in which city?", options: ["São Paulo", "Rio de Janeiro", "Buenos Aires", "Lisbon"], answer: 1 },
  { q: "Golden Boot at the 2018 World Cup?", options: ["Mbappé", "Lukaku", "Harry Kane", "Griezmann"], answer: 2 },
  { q: "England's semi-final manager at Italia '90?", options: ["Graham Taylor", "Bobby Robson", "Terry Venables", "Glenn Hoddle"], answer: 1 },
  { q: "Which club produced the 'Class of 92'?", options: ["Leeds", "Liverpool", "Man Utd", "Arsenal"], answer: 2 },
  { q: "A regulation goal is how wide?", options: ["6 yards", "8 yards", "10 yards", "12 yards"], answer: 1 },
  { q: "Keeper who captained Spain in 2010?", options: ["De Gea", "Casillas", "Reina", "Valdés"], answer: 1 },
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
