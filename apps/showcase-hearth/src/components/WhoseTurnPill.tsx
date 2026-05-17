interface Props {
  choreLabel: string;
  whoseName: string | null;
  isYou: boolean;
}

export function WhoseTurnPill({ choreLabel, whoseName, isYou }: Props) {
  return (
    <div className="hearth-turn-pill" data-is-you={isYou}>
      <span className="hearth-turn-chore">{choreLabel}</span>
      <span className="hearth-turn-arrow">→</span>
      <span className="hearth-turn-name">{isYou ? 'me' : whoseName ?? 'nobody yet'}</span>
    </div>
  );
}
