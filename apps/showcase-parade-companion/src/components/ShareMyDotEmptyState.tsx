interface ShareMyDotEmptyStateProps {
  onShare: () => void;
}

/**
 * The "Just you" card on the Group screen when the user has no plan yet.
 * Solo is first-class — same affordances as a multi-person group, just framed
 * for one person. Tapping `Share my dot` creates a one-person group + invite.
 */
export function ShareMyDotEmptyState({ onShare }: ShareMyDotEmptyStateProps) {
  return (
    <div className="panel share-my-dot">
      <h2>Just you</h2>
      <p>
        Share your dot so friends can find you on the day. They can watch you on their map,
        or join you so you see them too.
      </p>
      <button type="button" className="primary-action" onClick={onShare}>
        Share my dot
      </button>
    </div>
  );
}
