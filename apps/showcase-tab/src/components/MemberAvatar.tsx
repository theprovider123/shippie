interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[1]![0]!).toUpperCase();
}

export function MemberAvatar({ name, size = 'md' }: Props) {
  return (
    <span className="tab-avatar" data-size={size} title={name}>
      {initials(name)}
    </span>
  );
}
