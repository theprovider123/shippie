// Binary "this or that" football questions for Group of Death — short answers
// that fit on a wall gap. Evergreen pub knowledge, no live data.

export interface Gate {
  q: string;
  correct: string;
  wrong: string;
}

export const GATES: Gate[] = [
  { q: "Most World Cups won?", correct: "Brazil", wrong: "Germany" },
  { q: "Won the 2022 World Cup?", correct: "Argentina", wrong: "France" },
  { q: "Won the 1966 World Cup?", correct: "England", wrong: "Germany" },
  { q: "Scored the Hand of God?", correct: "Maradona", wrong: "Pelé" },
  { q: "Most World Cup goals?", correct: "Klose", wrong: "Ronaldo" },
  { q: "First World Cup hosts?", correct: "Uruguay", wrong: "Brazil" },
  { q: "Teams at the 2026 World Cup?", correct: "48", wrong: "32" },
  { q: "Zidane's 2006 red card?", correct: "Headbutt", wrong: "Dive" },
  { q: "Messi plays for?", correct: "Argentina", wrong: "Brazil" },
  { q: "Mbappé plays for?", correct: "France", wrong: "Belgium" },
  { q: "The Three Lions?", correct: "England", wrong: "Wales" },
  { q: "La Roja?", correct: "Spain", wrong: "Italy" },
  { q: "The Azzurri?", correct: "Italy", wrong: "Spain" },
  { q: "Pelé's country?", correct: "Brazil", wrong: "Argentina" },
  { q: "Penalty spot distance?", correct: "12 yards", wrong: "18 yards" },
  { q: "A match lasts?", correct: "90 mins", wrong: "80 mins" },
  { q: "Two yellows means?", correct: "Sent off", wrong: "Free kick" },
  { q: "Wembley is in?", correct: "London", wrong: "Manchester" },
  { q: "Surprise of 2022?", correct: "Morocco", wrong: "Ghana" },
  { q: "Golden Boot is for?", correct: "Top scorer", wrong: "Best keeper" },
  { q: "Held every?", correct: "4 years", wrong: "2 years" },
  { q: "Samba football?", correct: "Brazil", wrong: "Spain" },
  { q: "2026 co-hosts USA,", correct: "Canada", wrong: "Brazil" },
  { q: "Ronaldo plays for?", correct: "Portugal", wrong: "Spain" },
];

/** A reshuffled deck so no two runs feel the same. */
export function shuffleGates(): Gate[] {
  const pool = [...GATES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
