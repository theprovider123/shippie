interface GroupIdentityCardProps {
  name: string;
  memberCount: number;
  updatedAtIso?: string;
  solo?: boolean;
  displayName?: string;
  supporterTag?: string;
  onShowInvite: () => void;
  onStartGroup?: () => void;
  onJoinInvite?: () => void;
  onShareApp?: () => void;
  onEditName?: () => void;
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
  onStartGroup,
  onJoinInvite,
  onShareApp,
  onEditName,
}: GroupIdentityCardProps) {
  // "Me" is the default name when onboarding was skipped — surface a CTA so
  // the user doesn't ship as `Me #ABCD` for the whole parade.
  const nameNeedsAttention = (displayName ?? '').trim() === 'Me';

  if (solo) {
    return (
      <div className="panel group-identity group-identity--solo">
        <h2>Just you</h2>
        <p>
          Start a parade group before you go, or join one from a link.
          The plan saves to this phone for no-signal moments.
        </p>
        {supporterTag ? (
          <p className="identity-tag">
            You appear as <strong>{displayName || 'Me'} #{supporterTag}</strong>
            {nameNeedsAttention && onEditName ? (
              <>
                {' · '}
                <button type="button" className="identity-tag__cta" onClick={onEditName}>
                  Set your name
                </button>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="group-identity__actions">
          <button
            type="button"
            className="primary-action"
            onClick={onStartGroup ?? onShowInvite}
          >
            Start group
          </button>
          {onJoinInvite ? (
            <button type="button" className="secondary-action" onClick={onJoinInvite}>
              Join link
            </button>
          ) : null}
        </div>
        <div className="group-identity__actions group-identity__actions--secondary">
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
