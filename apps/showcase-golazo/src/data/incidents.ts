// Evergreen, made-up match incidents for the pass-the-phone pub games. No data
// feeds — just believable scenarios you can argue about over a pint.

export type CardOutcome = "yellow" | "red" | "none";

export interface CardIncident {
  id: string;
  text: string;
  outcome: CardOutcome;
}

export const CARD_INCIDENTS: CardIncident[] = [
  { id: "c1", text: "Centre-back hauls down the striker who was clean through on goal.", outcome: "red" },
  { id: "c2", text: "Midfielder slides in late, catches the ankle, ball long gone.", outcome: "yellow" },
  { id: "c3", text: "Keeper races out and takes ball then man, last defender behind him.", outcome: "yellow" },
  { id: "c4", text: "Striker pulls his shirt off celebrating a worldie in the 90th.", outcome: "yellow" },
  { id: "c5", text: "Two-footed lunge over the ball, studs showing, halfway line.", outcome: "red" },
  { id: "c6", text: "Winger goes down theatrically, replays show zero contact.", outcome: "yellow" },
  { id: "c7", text: "Full-back shoulders the winger off the ball, fair and strong.", outcome: "none" },
  { id: "c8", text: "Keeper time-wasting, rolls it out then picks it back up.", outcome: "yellow" },
  { id: "c9", text: "Defender already booked, cynical trip to stop the break.", outcome: "red" },
  { id: "c10", text: "Clean sliding tackle, all ball, striker tumbles over the top.", outcome: "none" },
  { id: "c11", text: "Elbow off the ball jumping for a header, caught on camera.", outcome: "red" },
  { id: "c12", text: "Tactical foul, arm across the chest, breaks up a counter.", outcome: "yellow" },
];

export interface PenShout {
  id: string;
  text: string;
  /** The pub's "official" verdict — purely to argue against. */
  verdict: "pen" | "no";
}

export const PEN_SHOUTS: PenShout[] = [
  { id: "p1", text: "Defender's arm is out from his body, ball strikes it in the box.", verdict: "pen" },
  { id: "p2", text: "Striker knocks it past the keeper, looks for the contact, goes down.", verdict: "no" },
  { id: "p3", text: "Shirt tug at a corner — but everyone's grappling in there.", verdict: "no" },
  { id: "p4", text: "Keeper spreads himself, gets a toe, then takes the striker's standing leg.", verdict: "pen" },
  { id: "p5", text: "Ball flicks up onto a sliding defender's hand from a yard away.", verdict: "no" },
  { id: "p6", text: "Clear trip from behind, defender nowhere near the ball.", verdict: "pen" },
  { id: "p7", text: "Coming-together, both players lean in, ref waves play on.", verdict: "no" },
  { id: "p8", text: "Defender plants his standing foot on the winger's heel chasing the ball.", verdict: "pen" },
];
