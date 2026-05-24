interface GroupIdentityCardProps {
  name: string;
  memberCount: number;
  updatedAtIso?: string;
  solo?: boolean;
  displayName?: string;
  supporterTag?: string;
  onShowInvite: () => void;
  onShareApp?: () => void;
  onShareMyDot?: () => void;
}

/**
 * Identity & Share — the first card in the Group Hub. Big italic group name,
 * member count, plan freshness, and an always-visible **Show invite** primary
 * button. Solo state replaces the button with **Share my dot**.
 */
export function GroupIdentityCard({
  name,
  memberCount,
  updatedAtIso,
  solo,
  displayName,
  supporterTag,
  onShowInvite,
  onShareApp,
  onShareMyDot,
}: GroupIdentityCardProps) {
  if (solo) {
    return (
      <div className="panel group-identity group-identity--solo">
        <h2>Just you</h2>
        <p>
          Share your dot so friends can find you on the day. They can watch on their map,
          or join you so you see them too.
        </p>
        {supporterTag ? (
          <p className="identity-tag">
            You appear as <strong>{displayName || 'Me'} #{supporterTag}</strong>
          </p>
        ) : null}
        <div className="group-identity__actions">
          <button
            type="button"
            className="primary-action"
            onClick={onShareMyDot ?? onShowInvite}
          >
            Share my dot
          </button>
          {onShareApp ? (
            <button type="button" className="secondary-action" onClick={onShareApp}>
              Share app
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="panel group-identity">
      <div className="group-identity__head">
        <h2>{name}</h2>
        <button
          type="button"
          className="primary-action group-identity__invite"
          onClick={onShowInvite}
        >
          Invite group
        </button>
      </div>
      <p className="group-identity__meta">
        {memberCount} {memberCount === 1 ? 'member' : 'members'}
        {updatedAtIso ? ` · saved ${agoLabel(updatedAtIso)}` : ''}
      </p>
      {onShareApp ? (
        <button type="button" className="secondary-action group-identity__app-share" onClick={onShareApp}>
          Share app only
        </button>
      ) : null}
    </div>
  );
}

function agoLabel(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return 'just now';
  if (seconds < 90) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}
