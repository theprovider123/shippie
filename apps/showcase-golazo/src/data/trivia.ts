// Evergreen World Cup / football trivia. Facts are written as historical
// prompts ("through 2022", named tournament years) so the pool does not go
// stale during the 2026 cycle. Each question has 4 options; `answer` is the
// index of the correct one.

export interface TriviaQ {
  id: string;
  q: string;
  options: [string, string, string, string];
  answer: number;
}

type RawTriviaQ = Omit<TriviaQ, "id">;
type TriviaStorage = Pick<Storage, "getItem" | "setItem">;

export const TRIVIA_RECENT_KEY = "golazo:trivia:recent";
export const TRIVIA_HISTORY_LIMIT = 96;

function hashQuestion(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function questionSlug(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
}

function withIds(pack: string, questions: RawTriviaQ[]): TriviaQ[] {
  return questions.map((q) => ({
    id: `${pack}:${questionSlug(q.q)}:${hashQuestion(q.q)}`,
    ...q,
  }));
}

function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function defaultStorage(): TriviaStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const TRIVIA = withIds("basics", [
  { q: "Which country has won the most World Cups through 2022?", options: ["Germany", "Brazil", "Italy", "Argentina"], answer: 1 },
  { q: "Who scored the 'Hand of God' goal in 1986?", options: ["Pele", "Maradona", "Zico", "Platini"], answer: 1 },
  { q: "Where was the first World Cup held in 1930?", options: ["Brazil", "Italy", "Uruguay", "France"], answer: 2 },
  { q: "Which player has scored the most World Cup goals through 2022?", options: ["Klose", "Ronaldo", "Muller", "Messi"], answer: 0 },
  { q: "Who won the 2022 World Cup?", options: ["France", "Argentina", "Croatia", "Morocco"], answer: 1 },
  { q: "How many players are on the pitch per team at kick-off?", options: ["10", "11", "12", "9"], answer: 1 },
  { q: "Which nation hosts with Canada and Mexico in 2026?", options: ["USA", "Brazil", "Qatar", "Spain"], answer: 0 },
  { q: "What's awarded to the World Cup's top scorer?", options: ["Golden Ball", "Golden Boot", "Golden Glove", "Silver Ball"], answer: 1 },
  { q: "Which country reached the 2022 semi-finals as Africa's first World Cup semi-finalist?", options: ["Japan", "Morocco", "Senegal", "Ghana"], answer: 1 },
  { q: "Zinedine Zidane was sent off in the 2006 final for...", options: ["A dive", "A headbutt", "Two yellows", "Handball"], answer: 1 },
  { q: "Which is NOT a real World Cup mascot?", options: ["Zakumi", "Footix", "Volley", "Goleo"], answer: 2 },
  { q: "How often is the men's World Cup held?", options: ["Every 2 years", "Every 3 years", "Every 4 years", "Every 5 years"], answer: 2 },
  { q: "Who lifts the trophy at the end of the final?", options: ["The hosts", "The winners", "The top scorers", "The fair-play team"], answer: 1 },
  { q: "Who captained England to the 1966 World Cup?", options: ["Bobby Moore", "Bobby Charlton", "Nobby Stiles", "Gordon Banks"], answer: 0 },
  { q: "Pele won his first World Cup aged...", options: ["17", "21", "25", "19"], answer: 0 },
  { q: "How many teams play at the 2026 World Cup?", options: ["32", "40", "48", "24"], answer: 2 },
  { q: "Who scored a hat-trick in the 1966 World Cup final?", options: ["Bobby Charlton", "Geoff Hurst", "Martin Peters", "Roger Hunt"], answer: 1 },
  { q: "England's all-time top men's scorer through 2024?", options: ["Wayne Rooney", "Bobby Charlton", "Harry Kane", "Gary Lineker"], answer: 2 },
  { q: "Gazza cried at which World Cup?", options: ["Italia '90", "Mexico '86", "USA '94", "France '98"], answer: 0 },
  { q: "Who knocked England out in 1986?", options: ["Germany", "Argentina", "Brazil", "France"], answer: 1 },
  { q: "Nation in the most men's World Cup finals through 2022?", options: ["Brazil", "Italy", "Germany", "Argentina"], answer: 2 },
  { q: "Who scored the winner in the 2010 final?", options: ["Villa", "Xavi", "Iniesta", "Puyol"], answer: 2 },
  { q: "The Maracana is in which city?", options: ["Sao Paulo", "Rio de Janeiro", "Buenos Aires", "Lisbon"], answer: 1 },
  { q: "Golden Boot at the 2018 World Cup?", options: ["Mbappe", "Lukaku", "Harry Kane", "Griezmann"], answer: 2 },
  { q: "England's semi-final manager at Italia '90?", options: ["Graham Taylor", "Bobby Robson", "Terry Venables", "Glenn Hoddle"], answer: 1 },
  { q: "Which club produced the 'Class of 92'?", options: ["Leeds", "Liverpool", "Man Utd", "Arsenal"], answer: 2 },
  { q: "A regulation football goal is how wide?", options: ["6 yards", "8 yards", "10 yards", "12 yards"], answer: 1 },
  { q: "Keeper who captained Spain in the 2010 final?", options: ["De Gea", "Casillas", "Reina", "Valdes"], answer: 1 },
  { q: "How long is a regulation match before stoppage time?", options: ["80 minutes", "90 minutes", "100 minutes", "75 minutes"], answer: 1 },
  { q: "How long is each half in normal time?", options: ["30 minutes", "35 minutes", "45 minutes", "50 minutes"], answer: 2 },
  { q: "How far is the penalty spot from the goal line?", options: ["10 yards", "12 yards", "14 yards", "18 yards"], answer: 1 },
  { q: "Two yellow cards for one player in a match mean...", options: ["A warning only", "A red card", "A free substitution", "A penalty"], answer: 1 },
  { q: "VAR stands for...", options: ["Video Assistant Referee", "Verified Action Replay", "Virtual Area Review", "Voice Assisted Ref"], answer: 0 },
  { q: "A clean sheet means a team...", options: ["Scored first", "Conceded no goals", "Won by three", "Had no bookings"], answer: 1 },
  { q: "A hat-trick means one player scores...", options: ["Two goals", "Three goals", "Four goals", "A penalty"], answer: 1 },
  { q: "A brace means one player scores...", options: ["Two goals", "Three goals", "Four goals", "A header"], answer: 0 },
  { q: "Nil-nil is the same as...", options: ["1-1", "2-0", "0-0", "No match"], answer: 2 },
  { q: "If a knockout match is level after extra time, it usually goes to...", options: ["Corners", "A replay", "Penalties", "Golden goal"], answer: 2 },
  { q: "World Cup knockout extra time is two halves of...", options: ["10 minutes", "15 minutes", "20 minutes", "30 minutes"], answer: 1 },
  { q: "The 2026 knockout stage begins with the...", options: ["Round of 16", "Round of 32", "Quarter-finals", "Semi-finals"], answer: 1 },
  { q: "How many groups are in the 2026 World Cup group stage?", options: ["8", "10", "12", "16"], answer: 2 },
  { q: "How many teams are in each 2026 World Cup group?", options: ["3", "4", "5", "6"], answer: 1 },
  { q: "Which countries host the 2026 World Cup?", options: ["USA, Canada, Mexico", "USA, Brazil, Mexico", "Canada, Spain, Portugal", "Mexico, Argentina, USA"], answer: 0 },
  { q: "The 2026 World Cup is the first men's edition hosted by...", options: ["One country", "Two countries", "Three countries", "Four countries"], answer: 2 },
  { q: "Which country hosted the 1994 World Cup?", options: ["USA", "France", "Italy", "Mexico"], answer: 0 },
  { q: "Which country hosted the 1986 World Cup?", options: ["Spain", "Mexico", "Argentina", "Italy"], answer: 1 },
  { q: "Which country hosted the 1970 World Cup?", options: ["Brazil", "Mexico", "Chile", "England"], answer: 1 },
  { q: "Which two countries co-hosted the 2002 World Cup?", options: ["Japan and South Korea", "USA and Canada", "Spain and Portugal", "Brazil and Argentina"], answer: 0 },
  { q: "Which country hosted the first World Cup in Africa?", options: ["Morocco", "Egypt", "South Africa", "Nigeria"], answer: 2 },
  { q: "Which ball name belongs to the 2010 World Cup?", options: ["Jabulani", "Brazuca", "Telstar 18", "Al Rihla"], answer: 0 },
  { q: "Which ball name belongs to the 2014 World Cup?", options: ["Fevernova", "Brazuca", "Teamgeist", "Tricolore"], answer: 1 },
  { q: "Which ball name belongs to the 2022 World Cup?", options: ["Al Rihla", "Jabulani", "Brazuca", "Questra"], answer: 0 },
  { q: "Which trophy was retired after Brazil's third World Cup title?", options: ["Jules Rimet Trophy", "Henri Delaunay Trophy", "Copa America Trophy", "Confederations Cup"], answer: 0 },
  { q: "What is awarded when the defending team last touches the ball over its own goal line?", options: ["Goal kick", "Corner", "Throw-in", "Drop ball"], answer: 1 },
  { q: "What restarts play after the ball crosses the touchline?", options: ["Throw-in", "Corner", "Penalty", "Kick-off"], answer: 0 },
  { q: "The centre spot is used for...", options: ["Penalties", "Corners", "Kick-offs", "Goal kicks"], answer: 2 },
  { q: "Which colour card means a sending-off?", options: ["Yellow", "Blue", "Red", "Green"], answer: 2 },
  { q: "What does a goalkeeper usually wear?", options: ["The same kit as everyone", "A different colour kit", "No gloves allowed", "A captain's armband only"], answer: 1 },
  { q: "A match official adds stoppage time for...", options: ["Lost playing time", "Weather only", "Home advantage", "Goal difference"], answer: 0 },
  { q: "Goal-line technology first appeared at a men's World Cup in...", options: ["2006", "2010", "2014", "2018"], answer: 2 },
  { q: "VAR first appeared at a men's World Cup in...", options: ["2010", "2014", "2018", "2022"], answer: 2 },
  { q: "The first men's World Cup was played in...", options: ["1926", "1930", "1934", "1938"], answer: 1 },
  { q: "The first World Cup final was won by...", options: ["Argentina", "Uruguay", "Brazil", "Italy"], answer: 1 },
  { q: "The first World Cup final was played at...", options: ["Wembley", "Maracana", "Estadio Centenario", "Azteca"], answer: 2 },
  { q: "The 1966 World Cup final was played at...", options: ["Old Trafford", "Wembley", "Anfield", "Hampden Park"], answer: 1 },
  { q: "The World Cup final in 2010 was played in which country?", options: ["Germany", "South Africa", "Brazil", "Russia"], answer: 1 },
  { q: "The World Cup final in 2014 was played in which country?", options: ["Brazil", "Russia", "Qatar", "South Africa"], answer: 0 },
  { q: "The World Cup final in 2018 was played in which country?", options: ["France", "Russia", "Germany", "Poland"], answer: 1 },
  { q: "The World Cup final in 2022 was played in which country?", options: ["Qatar", "UAE", "Saudi Arabia", "Bahrain"], answer: 0 },
  { q: "Which team is known as the Selecao?", options: ["Brazil", "Germany", "Spain", "Portugal"], answer: 0 },
  { q: "Which country is nicknamed La Albiceleste?", options: ["Argentina", "Italy", "Uruguay", "France"], answer: 0 },
  { q: "Which country is nicknamed Les Bleus?", options: ["France", "Belgium", "Netherlands", "Croatia"], answer: 0 },
]);

export const MOMENTS = withIds("moments", [
  { q: "Maradona's 'Goal of the Century' in 1986 was against...", options: ["England", "Belgium", "Italy", "Brazil"], answer: 0 },
  { q: "Who did Zidane headbutt in the 2006 final?", options: ["Cannavaro", "Materazzi", "Gattuso", "Buffon"], answer: 1 },
  { q: "Ronaldo's two goals in the 2002 final beat...", options: ["Germany", "Brazil", "Turkey", "Spain"], answer: 0 },
  { q: "Luis Suarez's handball on the line in 2010 denied...", options: ["Ghana", "Nigeria", "Senegal", "Uruguay"], answer: 0 },
  { q: "Gotze's extra-time winner in 2014 beat...", options: ["Brazil", "Netherlands", "Argentina", "Germany"], answer: 2 },
  { q: "Iniesta's winning goal in 2010 was against...", options: ["Germany", "Netherlands", "Spain", "Uruguay"], answer: 1 },
  { q: "The 'Maracanazo' in 1950 saw who shock Brazil?", options: ["Uruguay", "Argentina", "Sweden", "Italy"], answer: 0 },
  { q: "Roberto Baggio skied the decisive 1994 penalty against...", options: ["Brazil", "Bulgaria", "Spain", "Germany"], answer: 0 },
  { q: "Carlos Alberto's iconic 1970 team goal was for...", options: ["Italy", "Brazil", "Uruguay", "Mexico"], answer: 1 },
  { q: "Germany's 7-1 thrashing of Brazil happened in...", options: ["2010", "2014", "2018", "2006"], answer: 1 },
  { q: "Dennis Bergkamp's stunning 1998 goal knocked out...", options: ["Argentina", "Brazil", "Croatia", "Italy"], answer: 0 },
  { q: "Michael Owen's wonder-goal in 1998 was against...", options: ["Romania", "Argentina", "Colombia", "Germany"], answer: 1 },
  { q: "Beckham was sent off in 1998 for kicking out at...", options: ["Simeone", "Veron", "Batistuta", "Ortega"], answer: 0 },
  { q: "Roger Milla's corner-flag dance lit up which World Cup?", options: ["1986", "1990", "1994", "1982"], answer: 1 },
  { q: "Just Fontaine's record 13 goals came at the 1958 World Cup for...", options: ["France", "Brazil", "Sweden", "Hungary"], answer: 0 },
  { q: "Cruyff's famous 'turn' in 1974 came while playing for...", options: ["Netherlands", "Germany", "Argentina", "Poland"], answer: 0 },
  { q: "James Rodriguez won the 2014 Golden Boot for...", options: ["Brazil", "Colombia", "Chile", "Uruguay"], answer: 1 },
  { q: "Mbappe in the 2018 final was the youngest final scorer since...", options: ["Pele", "Maradona", "Ronaldo", "Muller"], answer: 0 },
  { q: "'Toto' Schillaci was top scorer at which World Cup?", options: ["1986", "1990", "1994", "1982"], answer: 1 },
  { q: "Paolo Rossi dragged Italy to glory in...", options: ["1978", "1982", "1986", "1974"], answer: 1 },
  { q: "Marco Tardelli's iconic scream came in the 1982 final vs...", options: ["Brazil", "West Germany", "Poland", "France"], answer: 1 },
  { q: "Cafu lifted the trophy as Brazil captain in...", options: ["1998", "2002", "1994", "2006"], answer: 1 },
  { q: "Diego Forlan won the 2010 Golden Ball for...", options: ["Uruguay", "Argentina", "Spain", "Ghana"], answer: 0 },
  { q: "Hosts who won on home soil in 1978?", options: ["Argentina", "Brazil", "Spain", "Mexico"], answer: 0 },
  { q: "Zidane scored twice in the 1998 final against...", options: ["Italy", "Brazil", "Croatia", "Germany"], answer: 1 },
  { q: "Lineker's Golden Boot with 6 goals came at...", options: ["Mexico 1986", "Italia 1990", "Spain 1982", "USA 1994"], answer: 0 },
  { q: "'They think it's all over... it is now' described the end of the...", options: ["1966 final", "1970 final", "1982 final", "1990 semi"], answer: 0 },
  { q: "The 'Miracle of Bern' in 1954 saw who beat Hungary?", options: ["West Germany", "Austria", "Brazil", "Uruguay"], answer: 0 },
  { q: "Pickford's save in the 2018 shootout helped England beat...", options: ["Colombia", "Sweden", "Croatia", "Tunisia"], answer: 0 },
  { q: "Senegal's shock opening win in 2002 was against holders...", options: ["France", "Brazil", "Italy", "Germany"], answer: 0 },
  { q: "North Korea's famous run reached the quarters in...", options: ["1966", "1970", "1962", "1958"], answer: 0 },
  { q: "Which keeper was Argentina's penalty hero in 1990?", options: ["Goycochea", "Zenga", "Pfaff", "Taffarel"], answer: 0 },
  { q: "The 'Hand of God' and 'Goal of the Century' came in the same 1986 match vs...", options: ["England", "Belgium", "West Germany", "Uruguay"], answer: 0 },
  { q: "Pele scored twice in the 1958 final against...", options: ["Sweden", "France", "West Germany", "Chile"], answer: 0 },
  { q: "Gordon Banks' 'save of the century' in 1970 denied...", options: ["Pele", "Maradona", "Eusebio", "Beckenbauer"], answer: 0 },
  { q: "Cameroon shocked the holders in the opening match of Italia '90 by beating...", options: ["Argentina", "Brazil", "Italy", "England"], answer: 0 },
  { q: "England lost the Italia '90 semi-final to West Germany on...", options: ["Away goals", "Penalties", "Golden goal", "A replay"], answer: 1 },
  { q: "France beat Brazil in the 1998 final by what score?", options: ["1-0", "2-1", "3-0", "4-2"], answer: 2 },
  { q: "Ahn Jung-hwan's golden goal in 2002 knocked out...", options: ["Italy", "Spain", "Portugal", "Germany"], answer: 0 },
  { q: "The fastest World Cup goal, by Hakan Sukur in 2002, was against...", options: ["South Korea", "Brazil", "Germany", "Senegal"], answer: 0 },
  { q: "Fabio Grosso scored the decisive penalty in the 2006 final for...", options: ["France", "Italy", "Germany", "Spain"], answer: 1 },
  { q: "Spain lost their opening 2010 match to...", options: ["Switzerland", "Chile", "Honduras", "Portugal"], answer: 0 },
  { q: "Asamoah Gyan hit the bar with a last-minute penalty in 2010 against...", options: ["Uruguay", "Germany", "USA", "Netherlands"], answer: 0 },
  { q: "Robin van Persie's 'Flying Dutchman' header in 2014 was against...", options: ["Spain", "Chile", "Brazil", "Mexico"], answer: 0 },
  { q: "James Rodriguez's famous 2014 volley came against...", options: ["Uruguay", "Brazil", "Japan", "Greece"], answer: 0 },
  { q: "Germany beat Argentina in the 2014 final by...", options: ["1-0", "2-0", "2-1", "3-1"], answer: 0 },
  { q: "Benjamin Pavard's 2018 thunderbolt was against...", options: ["Argentina", "Uruguay", "Croatia", "Belgium"], answer: 0 },
  { q: "Croatia beat England in the 2018 semi-final after...", options: ["Penalties", "Extra time", "A replay", "Golden goal"], answer: 1 },
  { q: "France beat Croatia in the 2018 final by what score?", options: ["2-0", "3-1", "4-2", "1-0"], answer: 2 },
  { q: "Saudi Arabia's 2022 group-stage shock was against...", options: ["Argentina", "France", "Brazil", "Spain"], answer: 0 },
  { q: "Japan beat which two former winners in the 2022 group stage?", options: ["Germany and Spain", "Brazil and Italy", "France and England", "Argentina and Uruguay"], answer: 0 },
  { q: "Morocco knocked out which team in the 2022 quarter-finals?", options: ["Portugal", "Spain", "France", "Belgium"], answer: 0 },
  { q: "The 2022 final was decided by...", options: ["Golden goal", "Penalties", "A replay", "Away goals"], answer: 1 },
  { q: "Richarlison's scissor-kick goal at the 2022 World Cup was against...", options: ["Serbia", "Switzerland", "Cameroon", "Croatia"], answer: 0 },
  { q: "Canada's first men's World Cup goal was scored by...", options: ["Alphonso Davies", "Jonathan David", "Atiba Hutchinson", "Cyle Larin"], answer: 0 },
  { q: "Alphonso Davies scored Canada's first men's World Cup goal against...", options: ["Croatia", "Belgium", "Morocco", "France"], answer: 0 },
  { q: "Kylian Mbappe scored how many goals in the 2022 final?", options: ["One", "Two", "Three", "Four"], answer: 2 },
  { q: "Emiliano Martinez's huge extra-time 2022 final save denied...", options: ["Kolo Muani", "Giroud", "Griezmann", "Coman"], answer: 0 },
  { q: "Wout Weghorst's late 2022 equaliser came for...", options: ["Netherlands", "Belgium", "Denmark", "Germany"], answer: 0 },
  { q: "Australia reached the 2022 last 16 after beating...", options: ["Denmark", "France", "Argentina", "Mexico"], answer: 0 },
  { q: "Costa Rica's 2014 run included topping a group with Italy, England and...", options: ["Uruguay", "Spain", "Portugal", "Croatia"], answer: 0 },
  { q: "Ghana reached the 2010 quarter-finals after beating...", options: ["USA", "England", "Chile", "Japan"], answer: 0 },
  { q: "The 2006 'Battle of Nuremberg' was Portugal against...", options: ["Netherlands", "France", "England", "Italy"], answer: 0 },
  { q: "Rivaldo's famous corner-flag theatrics in 2002 came against...", options: ["Turkey", "China", "Costa Rica", "Belgium"], answer: 0 },
  { q: "Ronaldo's 2002 redemption final came four years after the final in...", options: ["France 1998", "USA 1994", "Italia 1990", "Germany 2006"], answer: 0 },
  { q: "The vuvuzela sound is most associated with which World Cup?", options: ["South Africa 2010", "Brazil 2014", "Russia 2018", "Qatar 2022"], answer: 0 },
  { q: "The opening match of the 1990 World Cup produced a shock win for...", options: ["Cameroon", "Romania", "Colombia", "Costa Rica"], answer: 0 },
  { q: "Diana Ross's famous missed penalty was part of which World Cup opening ceremony?", options: ["USA 1994", "France 1998", "Korea/Japan 2002", "Germany 2006"], answer: 0 },
  { q: "Eusebio starred for Portugal at which World Cup?", options: ["1966", "1970", "1958", "1974"], answer: 0 },
  { q: "The 1966 quarter-final where North Korea led Portugal 3-0 ended with Portugal winning thanks largely to...", options: ["Eusebio", "Pele", "Best", "Cruyff"], answer: 0 },
  { q: "The 1982 Brazil side were knocked out by a Paolo Rossi hat-trick for...", options: ["Italy", "Argentina", "France", "West Germany"], answer: 0 },
]);

export const RECORDS_AND_AWARDS = withIds("records", [
  { q: "Most men's World Cup titles through 2022?", options: ["Brazil", "Germany", "Italy", "Argentina"], answer: 0 },
  { q: "Brazil had how many men's World Cup titles through 2022?", options: ["4", "5", "6", "7"], answer: 1 },
  { q: "Miroslav Klose's World Cup goal total is...", options: ["14", "15", "16", "17"], answer: 2 },
  { q: "Most men's World Cup appearances by a player through 2022?", options: ["Lionel Messi", "Lothar Matthaus", "Cristiano Ronaldo", "Paolo Maldini"], answer: 0 },
  { q: "Lionel Messi had how many men's World Cup appearances through 2022?", options: ["23", "24", "25", "26"], answer: 3 },
  { q: "Most goals by one player in a single men's World Cup tournament?", options: ["Just Fontaine", "Ronaldo", "Gerd Muller", "Kylian Mbappe"], answer: 0 },
  { q: "Just Fontaine scored 13 goals at which World Cup?", options: ["1954", "1958", "1962", "1966"], answer: 1 },
  { q: "Oldest player at a men's World Cup through 2022?", options: ["Essam El Hadary", "Roger Milla", "Dino Zoff", "Gianluigi Buffon"], answer: 0 },
  { q: "Oldest World Cup goalscorer through 2022?", options: ["Roger Milla", "Pepe", "Dino Zoff", "Tim Cahill"], answer: 0 },
  { q: "Youngest World Cup goalscorer through 2022?", options: ["Pele", "Michael Owen", "Kylian Mbappe", "Lionel Messi"], answer: 0 },
  { q: "Youngest player at a men's World Cup through 2022?", options: ["Norman Whiteside", "Pele", "Samuel Eto'o", "Femi Opabunmi"], answer: 0 },
  { q: "Most goals by one player in a single World Cup match?", options: ["4", "5", "6", "7"], answer: 1 },
  { q: "Who scored five goals in one World Cup match in 1994?", options: ["Oleg Salenko", "Romario", "Batistuta", "Stoichkov"], answer: 0 },
  { q: "First goalkeeper to win the World Cup Golden Ball?", options: ["Oliver Kahn", "Dino Zoff", "Iker Casillas", "Lev Yashin"], answer: 0 },
  { q: "The award for best player at the World Cup is the...", options: ["Golden Ball", "Golden Boot", "Golden Glove", "Golden Whistle"], answer: 0 },
  { q: "The award for best goalkeeper is the...", options: ["Golden Ball", "Golden Glove", "Golden Boot", "Golden Net"], answer: 1 },
  { q: "The Golden Glove award was formerly named after...", options: ["Lev Yashin", "Dino Zoff", "Gordon Banks", "Peter Schmeichel"], answer: 0 },
  { q: "Golden Ball winner in 2022?", options: ["Lionel Messi", "Kylian Mbappe", "Luka Modric", "Antoine Griezmann"], answer: 0 },
  { q: "Golden Boot winner in 2022?", options: ["Lionel Messi", "Kylian Mbappe", "Julian Alvarez", "Olivier Giroud"], answer: 1 },
  { q: "Golden Glove winner in 2022?", options: ["Emiliano Martinez", "Hugo Lloris", "Yassine Bounou", "Dominik Livakovic"], answer: 0 },
  { q: "Young Player Award winner in 2022?", options: ["Enzo Fernandez", "Jude Bellingham", "Jamal Musiala", "Gavi"], answer: 0 },
  { q: "Golden Ball winner in 2018?", options: ["Luka Modric", "Kylian Mbappe", "Eden Hazard", "Antoine Griezmann"], answer: 0 },
  { q: "Golden Boot winner in 2018?", options: ["Harry Kane", "Romelu Lukaku", "Kylian Mbappe", "Cristiano Ronaldo"], answer: 0 },
  { q: "Golden Ball winner in 2014?", options: ["Lionel Messi", "Thomas Muller", "Manuel Neuer", "James Rodriguez"], answer: 0 },
  { q: "Golden Boot winner in 2014?", options: ["James Rodriguez", "Thomas Muller", "Neymar", "Lionel Messi"], answer: 0 },
  { q: "Golden Ball winner in 2010?", options: ["Diego Forlan", "Andres Iniesta", "Wesley Sneijder", "David Villa"], answer: 0 },
  { q: "Golden Boot winner in 2010?", options: ["Thomas Muller", "David Villa", "Wesley Sneijder", "Diego Forlan"], answer: 0 },
  { q: "Golden Boot winner in 2006?", options: ["Miroslav Klose", "Ronaldo", "Thierry Henry", "Zinedine Zidane"], answer: 0 },
  { q: "Golden Ball winner in 2006?", options: ["Zinedine Zidane", "Fabio Cannavaro", "Andrea Pirlo", "Miroslav Klose"], answer: 0 },
  { q: "Golden Boot winner in 2002?", options: ["Ronaldo", "Rivaldo", "Miroslav Klose", "Ronaldinho"], answer: 0 },
  { q: "Golden Ball winner in 2002?", options: ["Oliver Kahn", "Ronaldo", "Ronaldinho", "Michael Ballack"], answer: 0 },
  { q: "Golden Boot winner in 1998?", options: ["Davor Suker", "Ronaldo", "Zinedine Zidane", "Christian Vieri"], answer: 0 },
  { q: "Golden Ball winner in 1994?", options: ["Romario", "Baggio", "Stoichkov", "Bebeto"], answer: 0 },
  { q: "Golden Ball winner in 1990?", options: ["Salvatore Schillaci", "Lothar Matthaus", "Diego Maradona", "Paul Gascoigne"], answer: 0 },
  { q: "Golden Ball winner in 1986?", options: ["Diego Maradona", "Gary Lineker", "Michel Platini", "Zico"], answer: 0 },
  { q: "Golden Ball winner in 1982?", options: ["Paolo Rossi", "Zico", "Karl-Heinz Rummenigge", "Dino Zoff"], answer: 0 },
  { q: "Golden Boot winner in 1986?", options: ["Gary Lineker", "Maradona", "Careca", "Emilio Butragueno"], answer: 0 },
  { q: "Who won the 1930 World Cup final?", options: ["Uruguay", "Argentina", "Brazil", "Italy"], answer: 0 },
  { q: "Who did Uruguay beat in the 1930 final?", options: ["Argentina", "Brazil", "Chile", "USA"], answer: 0 },
  { q: "Who won the 1934 World Cup?", options: ["Italy", "Czechoslovakia", "Uruguay", "Germany"], answer: 0 },
  { q: "Who won the 1938 World Cup?", options: ["Italy", "Hungary", "Brazil", "France"], answer: 0 },
  { q: "Who won the 1954 World Cup?", options: ["West Germany", "Hungary", "Brazil", "Uruguay"], answer: 0 },
  { q: "Who won the 1958 World Cup?", options: ["Brazil", "Sweden", "France", "West Germany"], answer: 0 },
  { q: "Who won the 1962 World Cup?", options: ["Brazil", "Czechoslovakia", "Chile", "Yugoslavia"], answer: 0 },
  { q: "Who won the 1966 World Cup?", options: ["England", "West Germany", "Portugal", "Soviet Union"], answer: 0 },
  { q: "Who won the 1970 World Cup?", options: ["Brazil", "Italy", "West Germany", "Uruguay"], answer: 0 },
  { q: "Who won the 1974 World Cup?", options: ["West Germany", "Netherlands", "Poland", "Brazil"], answer: 0 },
  { q: "Who won the 1978 World Cup?", options: ["Argentina", "Netherlands", "Brazil", "Italy"], answer: 0 },
  { q: "Who won the 1982 World Cup?", options: ["Italy", "West Germany", "Brazil", "France"], answer: 0 },
  { q: "Who won the 1986 World Cup?", options: ["Argentina", "West Germany", "France", "Belgium"], answer: 0 },
  { q: "Who won the 1990 World Cup?", options: ["West Germany", "Argentina", "Italy", "England"], answer: 0 },
  { q: "Who won the 1994 World Cup?", options: ["Brazil", "Italy", "Sweden", "Bulgaria"], answer: 0 },
  { q: "Who won the 1998 World Cup?", options: ["France", "Brazil", "Croatia", "Netherlands"], answer: 0 },
  { q: "Who won the 2002 World Cup?", options: ["Brazil", "Germany", "Turkey", "South Korea"], answer: 0 },
  { q: "Who won the 2006 World Cup?", options: ["Italy", "France", "Germany", "Portugal"], answer: 0 },
  { q: "Who won the 2010 World Cup?", options: ["Spain", "Netherlands", "Germany", "Uruguay"], answer: 0 },
  { q: "Who won the 2014 World Cup?", options: ["Germany", "Argentina", "Netherlands", "Brazil"], answer: 0 },
  { q: "Who won the 2018 World Cup?", options: ["France", "Croatia", "Belgium", "England"], answer: 0 },
  { q: "Who did Argentina beat in the 2022 final?", options: ["France", "Croatia", "Morocco", "Netherlands"], answer: 0 },
]);

export const HOSTS_AND_FORMAT = withIds("hosts", [
  { q: "How many matches are scheduled at the 2026 World Cup?", options: ["64", "80", "96", "104"], answer: 3 },
  { q: "How many host venues are used for the 2026 World Cup?", options: ["12", "14", "16", "18"], answer: 2 },
  { q: "How many 2026 host cities are in the USA?", options: ["8", "9", "10", "11"], answer: 3 },
  { q: "How many 2026 host cities are in Canada?", options: ["1", "2", "3", "4"], answer: 1 },
  { q: "How many 2026 host cities are in Mexico?", options: ["2", "3", "4", "5"], answer: 1 },
  { q: "Which 2026 host country also hosted the World Cup in 1970 and 1986?", options: ["Mexico", "Canada", "USA", "Brazil"], answer: 0 },
  { q: "Which 2026 host country also hosted the World Cup in 1994?", options: ["USA", "Mexico", "Canada", "Italy"], answer: 0 },
  { q: "The 2026 opener is at...", options: ["Mexico City Stadium", "New York New Jersey Stadium", "Los Angeles Stadium", "Dallas Stadium"], answer: 0 },
  { q: "The 2026 final is scheduled for...", options: ["New York New Jersey Stadium", "Mexico City Stadium", "Toronto Stadium", "Seattle Stadium"], answer: 0 },
  { q: "Which Canadian city is a 2026 host?", options: ["Vancouver", "Montreal", "Ottawa", "Calgary"], answer: 0 },
  { q: "Which Canadian city is also a 2026 host?", options: ["Toronto", "Edmonton", "Quebec City", "Winnipeg"], answer: 0 },
  { q: "BC Place is in which 2026 host city?", options: ["Vancouver", "Toronto", "Seattle", "San Francisco Bay Area"], answer: 0 },
  { q: "BMO Field is in which 2026 host city?", options: ["Toronto", "Vancouver", "Boston", "Philadelphia"], answer: 0 },
  { q: "Estadio Akron is in which 2026 host city?", options: ["Guadalajara", "Monterrey", "Mexico City", "Miami"], answer: 0 },
  { q: "Estadio BBVA is in which 2026 host city?", options: ["Monterrey", "Guadalajara", "Mexico City", "Houston"], answer: 0 },
  { q: "The Azteca's 2026 tournament name is...", options: ["Mexico City Stadium", "Azteca National", "Central Mexico Arena", "Mexico Final Stadium"], answer: 0 },
  { q: "Which 2026 host city is in Texas?", options: ["Dallas", "Boston", "Seattle", "Philadelphia"], answer: 0 },
  { q: "Which other 2026 host city is in Texas?", options: ["Houston", "Kansas City", "Miami", "Atlanta"], answer: 0 },
  { q: "Which 2026 host city is in Florida?", options: ["Miami", "Dallas", "Seattle", "Boston"], answer: 0 },
  { q: "Which 2026 host city is in Georgia?", options: ["Atlanta", "Houston", "Philadelphia", "Kansas City"], answer: 0 },
  { q: "Which 2026 host city is in Washington state?", options: ["Seattle", "Boston", "Dallas", "New York New Jersey"], answer: 0 },
  { q: "Which 2026 host city is in Pennsylvania?", options: ["Philadelphia", "Seattle", "Los Angeles", "Kansas City"], answer: 0 },
  { q: "Which 2026 host area uses the New York New Jersey label?", options: ["New York New Jersey", "Boston", "Philadelphia", "Miami"], answer: 0 },
  { q: "Which 2026 host city is in California?", options: ["Los Angeles", "Houston", "Atlanta", "Boston"], answer: 0 },
  { q: "Which 2026 host area is in Northern California?", options: ["San Francisco Bay Area", "Los Angeles", "Dallas", "Seattle"], answer: 0 },
  { q: "Which 2026 host city is in Missouri?", options: ["Kansas City", "Boston", "Philadelphia", "Miami"], answer: 0 },
  { q: "In 2026, the top two teams in each group advance plus...", options: ["Eight best third-place teams", "All third-place teams", "Four best fourth-place teams", "No one else"], answer: 0 },
  { q: "The 2026 group stage has how many total groups?", options: ["8", "10", "12", "16"], answer: 2 },
  { q: "The 2026 final venue is also home to which NFL teams?", options: ["Giants and Jets", "Cowboys and Texans", "Rams and Chargers", "Eagles and Steelers"], answer: 0 },
  { q: "The Dallas 2026 venue is best known as the home of the...", options: ["Cowboys", "Texans", "Chiefs", "Dolphins"], answer: 0 },
  { q: "The Los Angeles 2026 venue is best known as the home of the...", options: ["Rams and Chargers", "Raiders and 49ers", "Giants and Jets", "Cowboys and Texans"], answer: 0 },
  { q: "The Seattle 2026 venue is best known as the home of the...", options: ["Seahawks", "Patriots", "Falcons", "Commanders"], answer: 0 },
  { q: "The Atlanta 2026 venue is best known as the home of the...", options: ["Falcons", "Dolphins", "Eagles", "Broncos"], answer: 0 },
  { q: "The Houston 2026 venue is best known as the home of the...", options: ["Texans", "Cowboys", "Chiefs", "Bills"], answer: 0 },
  { q: "The Miami 2026 venue is best known as the home of the...", options: ["Dolphins", "Buccaneers", "Jaguars", "Falcons"], answer: 0 },
]);

export const TRIVIA_BANK: TriviaQ[] = [
  ...TRIVIA,
  ...MOMENTS,
  ...RECORDS_AND_AWARDS,
  ...HOSTS_AND_FORMAT,
];

export interface PickTriviaOptions {
  excludeRecent?: boolean;
  rng?: () => number;
  storage?: TriviaStorage | null;
}

export function readTriviaRecent(storage: TriviaStorage | null = defaultStorage()): string[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(TRIVIA_RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberTrivia(items: readonly TriviaQ[] | readonly string[], storage: TriviaStorage | null = defaultStorage()): void {
  if (!storage) return;
  const ids = items.map((item) => typeof item === "string" ? item : item.id).filter(Boolean);
  const seen = new Set<string>();
  const recent = [...ids, ...readTriviaRecent(storage)].filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, TRIVIA_HISTORY_LIMIT);
  try {
    storage.setItem(TRIVIA_RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* private mode / quota: trivia still works, only anti-repeat memory resets */
  }
}

/** A shuffled set of n questions. Recent questions are avoided when possible. */
export function pickTrivia(n: number, options: PickTriviaOptions = {}): TriviaQ[] {
  const count = Math.min(Math.max(0, Math.floor(n)), TRIVIA_BANK.length);
  const recent = options.excludeRecent === false ? new Set<string>() : new Set(readTriviaRecent(options.storage ?? defaultStorage()));
  const fresh = shuffle(TRIVIA_BANK.filter((q) => !recent.has(q.id)), options.rng);
  const picked = fresh.slice(0, count);
  if (picked.length >= count) return picked;

  const fallback = shuffle(TRIVIA_BANK.filter((q) => recent.has(q.id)), options.rng);
  return [...picked, ...fallback.slice(0, count - picked.length)];
}

/** Draw and remember a deck, used by playable quiz modes. */
export function drawTrivia(n: number, options: PickTriviaOptions = {}): TriviaQ[] {
  const picked = pickTrivia(n, options);
  rememberTrivia(picked, options.storage ?? defaultStorage());
  return picked;
}
