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

// ── Famous World Cup moments — the ones every fan argues about ──────────────
export const MOMENTS: TriviaQ[] = [
  { q: "Maradona's 'Goal of the Century' (1986) was against?", options: ["England", "Belgium", "Italy", "Brazil"], answer: 0 },
  { q: "Who did Zidane headbutt in the 2006 final?", options: ["Cannavaro", "Materazzi", "Gattuso", "Buffon"], answer: 1 },
  { q: "Ronaldo's two goals in the 2002 final beat?", options: ["Germany", "Brazil", "Turkey", "Spain"], answer: 0 },
  { q: "Luis Suárez's handball on the line (2010) denied?", options: ["Ghana", "Nigeria", "Senegal", "Uruguay"], answer: 0 },
  { q: "Götze's extra-time winner in 2014 beat?", options: ["Brazil", "Netherlands", "Argentina", "Germany"], answer: 2 },
  { q: "Iniesta's winning goal in 2010 was against?", options: ["Germany", "Netherlands", "Spain", "Uruguay"], answer: 1 },
  { q: "The 'Maracanazo' (1950) — who shocked Brazil at home?", options: ["Uruguay", "Argentina", "Sweden", "Italy"], answer: 0 },
  { q: "Roberto Baggio skied the decisive 1994 penalty against?", options: ["Brazil", "Bulgaria", "Spain", "Germany"], answer: 0 },
  { q: "Carlos Alberto's iconic 1970 team goal was for?", options: ["Italy", "Brazil", "Uruguay", "Mexico"], answer: 1 },
  { q: "Germany's 7-1 thrashing of Brazil happened in?", options: ["2010", "2014", "2018", "2006"], answer: 1 },
  { q: "Dennis Bergkamp's stunning 1998 goal knocked out?", options: ["Argentina", "Brazil", "Croatia", "Italy"], answer: 0 },
  { q: "Michael Owen's wonder-goal in 1998 was against?", options: ["Romania", "Argentina", "Colombia", "Germany"], answer: 1 },
  { q: "Beckham was sent off in 1998 for kicking out at?", options: ["Simeone", "Verón", "Batistuta", "Ortega"], answer: 0 },
  { q: "Roger Milla's corner-flag dance lit up which World Cup?", options: ["1986", "1990", "1994", "1982"], answer: 1 },
  { q: "Just Fontaine's record 13 goals came at the 1958 World Cup for?", options: ["France", "Brazil", "Sweden", "Hungary"], answer: 0 },
  { q: "Cruyff's famous 'turn' in 1974 — he played for?", options: ["Netherlands", "Germany", "Argentina", "Poland"], answer: 0 },
  { q: "James Rodríguez won the 2014 Golden Boot for?", options: ["Brazil", "Colombia", "Chile", "Uruguay"], answer: 1 },
  { q: "Mbappé in the 2018 final — youngest to score in a final since?", options: ["Pelé", "Maradona", "Ronaldo", "Müller"], answer: 0 },
  { q: "'Toto' Schillaci was top scorer at which World Cup?", options: ["1986", "1990", "1994", "1982"], answer: 1 },
  { q: "Paolo Rossi dragged Italy to glory in?", options: ["1978", "1982", "1986", "1974"], answer: 1 },
  { q: "Marco Tardelli's iconic scream came in the 1982 final vs?", options: ["Brazil", "West Germany", "Poland", "France"], answer: 1 },
  { q: "Cafu lifted the trophy as captain in?", options: ["1998", "2002", "1994", "2006"], answer: 1 },
  { q: "Diego Forlán won the 2010 Golden Ball for?", options: ["Uruguay", "Argentina", "Spain", "Ghana"], answer: 0 },
  { q: "Hosts who won on home soil in 1978?", options: ["Argentina", "Brazil", "Spain", "Mexico"], answer: 0 },
  { q: "Zidane scored twice (headers) in the 1998 final against?", options: ["Italy", "Brazil", "Croatia", "Germany"], answer: 1 },
  { q: "Lineker's Golden Boot (6 goals) came at?", options: ["Mexico 1986", "Italia 1990", "Spain 1982", "USA 1994"], answer: 0 },
  { q: "'They think it's all over… it is now' described the end of?", options: ["1966 final", "1970 final", "1982 final", "1990 semi"], answer: 0 },
  { q: "The 'Miracle of Bern' (1954) — who beat Hungary?", options: ["West Germany", "Austria", "Brazil", "Uruguay"], answer: 0 },
  { q: "Pickford's save in the 2018 shootout helped England beat?", options: ["Colombia", "Sweden", "Croatia", "Tunisia"], answer: 0 },
  { q: "Senegal's shock opening win in 2002 was against holders?", options: ["France", "Brazil", "Italy", "Germany"], answer: 0 },
  { q: "North Korea's famous run reached the quarters in?", options: ["1966", "1970", "1962", "1958"], answer: 0 },
  { q: "Which keeper was Argentina's penalty hero in 1990?", options: ["Goycochea", "Zenga", "Pfaff", "Taffarel"], answer: 0 },
  { q: "The 'Hand of God' and 'Goal of the Century' came in the same 1986 match vs?", options: ["England", "Belgium", "West Germany", "Uruguay"], answer: 0 },
];

/** A fresh shuffled set of n questions, drawn from trivia + famous moments. */
export function pickTrivia(n: number): TriviaQ[] {
  const pool = [...TRIVIA, ...MOMENTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
