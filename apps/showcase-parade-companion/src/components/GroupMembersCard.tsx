import type { GroupLiveMember, GroupLiveStatus } from '../lib/group-live';

interface GroupMembersCardProps {
  members: string[];
  liveMembers?: GroupLiveMember[];
  liveStatus?: GroupLiveStatus;
}

/**
 * Members card — saved plan members plus live join/presence packets from the
 * group room. Saved names keep the plan useful offline; live chips tell fans
 * who has actually joined with signal.
 */
export function GroupMembersCard({ members, liveMembers = [], liveStatus = 'idle' }: GroupMembersCardProps) {
  const rows = mergeRows(members, liveMembers);
  return (
    <div className="panel group-members">
      <div className="group-members__head">
        <h2>Members</h2>
        <span className={`group-live-chip group-live-chip--${liveStatus}`}>{statusLabel(liveStatus)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="group-members__empty">
          No one in the group yet. Add names in the Plan card.
        </p>
      ) : (
        <ul className="group-members__list">
          {rows.map((row, index) => (
            <li className="member-row" key={`${row.name}-${index}`}>
              <span className="member-row__chip" aria-hidden>
                {initialsOf(row.name)}
              </span>
              <span className="member-row__name">{row.name}</span>
              <span className={`member-row__status ${row.live ? 'is-live' : ''}`}>
                {row.live ? liveAge(row.live.lastSeenAt) : 'saved'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="group-members__hint">
        Saved names work offline. Live dots appear when phones catch signal.
      </p>
    </div>
  );
}

function mergeRows(members: string[], liveMembers: GroupLiveMember[]): Array<{ name: string; live: GroupLiveMember | null }> {
  const rows: Array<{ name: string; live: GroupLiveMember | null }> = [];
  const seen = new Set<string>();
  for (const member of members) {
    const key = member.toLowerCase();
    const live = liveMembers.find((item) => item.memberName.toLowerCase() === key) ?? null;
    rows.push({ name: member, live });
    seen.add(key);
  }
  for (const live of liveMembers) {
    const key = live.memberName.toLowerCase();
    if (seen.has(key)) continue;
    rows.push({ name: live.memberName, live });
    seen.add(key);
  }
  return rows.slice(0, 12);
}

function statusLabel(status: GroupLiveStatus): string {
  if (status === 'open') return 'live';
  if (status === 'connecting') return 'joining';
  if (status === 'closed') return 'offline';
  if (status === 'failed') return 'retrying';
  if (status === 'unsupported') return 'saved';
  return 'saved';
}

function liveAge(iso: string): string {
  const ageMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ageMs) || ageMs < 90_000) return 'live';
  if (ageMs < 60 * 60_000) return `${Math.round(ageMs / 60_000)}m`;
  return 'old';
}

function initialsOf(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2 && parts[1]) {
    return `${(parts[0]?.[0] ?? '').toUpperCase()}${(parts[1][0] ?? '').toUpperCase()}`;
  }
  return cleaned.slice(0, 2).toUpperCase();
}
