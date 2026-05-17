import { templateConfig } from '../lib/room-template.ts';
import type { RoomTemplate } from '../shared/types.ts';

const PROMPTS: Record<ReturnType<typeof templateConfig>['tone'], string[]> = {
  family: ['Who are we cheering for?', 'Best celebration so far?', 'Who gets the next snack?', 'Best flag in the room?', 'Who gets player of the match?'],
  friendly: ['Who scores first?', 'Biggest confidence pick?', 'Room verdict?', 'Best chant from the crowd?', 'Most nervous prediction?'],
  pub: ['VAR verdict?', 'Who is having a nightmare?', 'Rate that goal', 'Next goal?', 'Ref report card?', 'Pub table MVP?'],
  spicy: ['Who bottled that prediction?', 'Receipts check?', 'Most confident wrong person?', 'Who owes the room an apology?', 'Wildest take that might land?'],
};

export function BanterPanel(props: {
  template: RoomTemplate;
  disabled: boolean;
  onPrompt: (text: string) => Promise<boolean>;
}) {
  const config = templateConfig(props.template);
  return (
    <section className="banter-panel">
      <div className="panel-head">
        <h2>Banter prompts</h2>
        <span>{config.tone}</span>
      </div>
      <div className="prompt-grid">
        {PROMPTS[config.tone].map((prompt) => (
          <button key={prompt} disabled={props.disabled} onClick={() => void props.onPrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
