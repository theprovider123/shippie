import type { ReactNode } from 'react';

const MOMENTS = [
  {
    title: 'Prediction receipt',
    text: 'Turn a pick into a match ticket people want to defend in the chat.',
  },
  {
    title: 'Room invite',
    text: 'A QR or link card that makes pubs, sofas, offices, and family tables feel like one room.',
  },
  {
    title: 'Only one called it',
    text: 'When the result lands, find the brave pick and make the receipts unavoidable.',
  },
  {
    title: 'City stamp',
    text: 'Host-city paper, local bite, venue context, and a souvenir-style share after every moment.',
  },
];

export function ViralMomentsPanel(props: { action?: ReactNode }) {
  return (
    <section className="viral-moments-panel">
      <div className="panel-head">
        <h2>Receipts people pass on</h2>
        <span>share loops</span>
      </div>
      <div className="viral-moment-grid">
        {MOMENTS.map((moment) => (
          <article key={moment.title}>
            <span />
            <strong>{moment.title}</strong>
            <p>{moment.text}</p>
          </article>
        ))}
      </div>
      {props.action ? <div className="viral-action">{props.action}</div> : null}
    </section>
  );
}
