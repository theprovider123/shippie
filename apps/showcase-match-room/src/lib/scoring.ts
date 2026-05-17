export interface PredictionScoreInput {
  predictionHome: number;
  predictionAway: number;
  actualHome: number;
  actualAway: number;
}

export function scorePrediction(input: PredictionScoreInput): 0 | 1 | 3 {
  if (input.predictionHome === input.actualHome && input.predictionAway === input.actualAway) return 3;
  const predictedSign = Math.sign(input.predictionHome - input.predictionAway);
  const actualSign = Math.sign(input.actualHome - input.actualAway);
  return predictedSign === actualSign ? 1 : 0;
}
