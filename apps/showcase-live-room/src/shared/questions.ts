export interface Question {
  prompt: string;
  answer: string;
}

export const QUESTIONS: readonly Question[] = [
  { prompt: 'Capital of Iceland?', answer: 'Reykjavík' },
  { prompt: 'Year the World Wide Web was invented?', answer: '1989' },
  { prompt: 'Which planet has the most moons?', answer: 'Saturn' },
];
