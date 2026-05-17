import { useMemo, useState } from 'react';
import { dailyTrivia, scoreTrivia } from '../lib/trivia-engine.ts';

export function TriviaPanel() {
  const questions = useMemo(() => dailyTrivia(new Date('2026-06-11T12:00:00Z')), []);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answered = questions.every((question) => answers[question.id] !== undefined);
  const score = answered ? scoreTrivia(questions.map((question) => answers[question.id] ?? -1), questions) : null;

  return (
    <section className="trivia-panel">
      <div className="panel-head">
        <h2>90-second quiz</h2>
        <span>{score === null ? `${Object.keys(answers).length}/${questions.length}` : `${score}/${questions.length}`}</span>
      </div>
      {questions.slice(0, 3).map((question) => (
        <article key={question.id} className="trivia-question">
          <h3>{question.question}</h3>
          <div className="prompt-grid">
            {question.options.map((option, index) => (
              <button
                key={option}
                className={answers[question.id] === index ? 'selected' : ''}
                onClick={() => setAnswers((current) => ({ ...current, [question.id]: index }))}
              >
                {option}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
