// The gates in Group of Death are famous World Cup MOMENTS — fly through the
// right answer. Short answers that fit on a wall. Evergreen, no live data.

export interface Gate {
  q: string;
  correct: string;
  wrong: string;
}

export const GATES: Gate[] = [
  { q: "'Goal of the Century' scorer?", correct: "Maradona", wrong: "Pelé" },
  { q: "Hand of God was against?", correct: "England", wrong: "Brazil" },
  { q: "Zidane headbutted?", correct: "Materazzi", wrong: "Cannavaro" },
  { q: "Maracanazo 1950 winner?", correct: "Uruguay", wrong: "Brazil" },
  { q: "Germany 7-1 — who won?", correct: "Germany", wrong: "Brazil" },
  { q: "Won the 2014 final?", correct: "Germany", wrong: "Argentina" },
  { q: "Götze's 2014 winner for?", correct: "Germany", wrong: "Argentina" },
  { q: "Iniesta's 2010 winner for?", correct: "Spain", wrong: "Holland" },
  { q: "Baggio's 1994 miss gave it to?", correct: "Brazil", wrong: "Italy" },
  { q: "Suárez handball vs?", correct: "Ghana", wrong: "Uruguay" },
  { q: "The Cruyff turn — nation?", correct: "Holland", wrong: "Germany" },
  { q: "Roger Milla danced for?", correct: "Cameroon", wrong: "Senegal" },
  { q: "1966 hat-trick hero?", correct: "Hurst", wrong: "Charlton" },
  { q: "Ronaldo's 2002 goals beat?", correct: "Germany", wrong: "France" },
  { q: "Carlos Alberto 1970 goal for?", correct: "Brazil", wrong: "Italy" },
  { q: "Bergkamp's 1998 stunner vs?", correct: "Argentina", wrong: "Brazil" },
  { q: "Owen's 1998 solo goal for?", correct: "England", wrong: "Argentina" },
  { q: "Gazza cried at?", correct: "Italia 90", wrong: "USA 94" },
  { q: "Pelé won his first WC aged?", correct: "17", wrong: "21" },
  { q: "Mineirazo humbled which hosts?", correct: "Brazil", wrong: "Russia" },
  { q: "Tardelli's scream — 1982 for?", correct: "Italy", wrong: "Spain" },
  { q: "Forlán's 2010 Golden Ball for?", correct: "Uruguay", wrong: "Ghana" },
  { q: "Beckham 1998 red — kicked?", correct: "Simeone", wrong: "Verón" },
  { q: "James' 2014 Golden Boot for?", correct: "Colombia", wrong: "Chile" },
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
