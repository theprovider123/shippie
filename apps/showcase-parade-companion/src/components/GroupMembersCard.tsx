interface GroupMembersCardProps {
  members: string[];
}

/**
 * Members card — one row per member from the saved plan. Today everyone is
 * "saved" (typed into the plan). When the relay client lands, swap the
 * `saved` chip for a live last-seen indicator (live / 3 min / lost / faded).
 */
export function GroupMembersCard({ members }: GroupMembersCardProps) {
  return (
    <div className="panel group-members">
      <h2>Members</h2>
      {members.length === 0 ? (
        <p className="group-members__empty">
          No one in the group yet. Add names in the Plan card.
        </p>
      ) : (
        <ul className="group-members__list">
          {members.map((name, index) => (
            <li className="member-row" key={`${name}-${index}`}>
              <span className="member-row__chip" aria-hidden>
                {initialsOf(name)}
              </span>
              <span className="member-row__name">{name}</span>
              <span className="member-row__status">saved</span>
            </li>
          ))}
        </ul>
      )}
      <p className="group-members__hint">
        Saved here so the plan still makes sense with no signal.
      </p>
    </div>
  );
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
