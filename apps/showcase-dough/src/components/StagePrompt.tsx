import type { Stage } from '../lib/schedule.ts';
import { formatHM } from '../lib/schedule.ts';

interface Props {
  stage: Stage;
}

/**
 * Standalone full-bleed stage prompt — used by the Timeline page
 * header to show what the baker is doing *right now*.
 */
export function StagePrompt({ stage }: Props) {
  return (
    <div className="stage-prompt">
      <p className="eyebrow">now</p>
      <h2>{stage.label}</h2>
      <p className="stage-prompt-body">{stage.prompt}</p>
      {stage.subPrompts && stage.subPrompts.length > 0 ? (
        <ul className="sub-prompts">
          {stage.subPrompts.map((sp, i) => (
            <li key={i}>
              <strong>+{formatHM(sp.offsetMin)} · {sp.label}</strong>
              <p className="muted small">{sp.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
