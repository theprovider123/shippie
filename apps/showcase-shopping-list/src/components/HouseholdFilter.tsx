/**
 * Sticky filter bar showing per-housemate counts. "Anyone" is always
 * present — items without an explicit assignee bucket here.
 */
import type { ListItem } from '../lib/types.ts';

interface HouseholdFilterProps {
  members: readonly string[];
  items: readonly ListItem[];
  /** null = "all", 'anyone' = unassigned bucket, anything else = a name. */
  selected: string | null;
  onSelect: (assignee: string | null) => void;
}

export function HouseholdFilter({
  members,
  items,
  selected,
  onSelect,
}: HouseholdFilterProps) {
  if (members.length === 0) return null;
  const counts = countByAssignee(items, members);
  return (
    <div className="household-filter" role="tablist" aria-label="Household assignee">
      <FilterTab
        label="All"
        active={selected === null}
        count={items.filter((i) => !i.checked).length}
        onClick={() => onSelect(null)}
      />
      {members.map((member) => (
        <FilterTab
          key={member}
          label={member}
          active={selected === member}
          count={counts.byMember[member] ?? 0}
          onClick={() => onSelect(member)}
        />
      ))}
      {counts.anyone > 0 && (
        <FilterTab
          label="Anyone"
          active={selected === 'anyone'}
          count={counts.anyone}
          onClick={() => onSelect('anyone')}
        />
      )}
    </div>
  );
}

interface FilterTabProps {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}

function FilterTab({ label, active, count, onClick }: FilterTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`household-tab${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="count">{count}</span>
    </button>
  );
}

function countByAssignee(
  items: readonly ListItem[],
  members: readonly string[],
): { byMember: Record<string, number>; anyone: number } {
  const byMember: Record<string, number> = {};
  for (const m of members) byMember[m] = 0;
  let anyone = 0;
  for (const item of items) {
    if (item.checked) continue;
    if (item.assignee && byMember[item.assignee] !== undefined) {
      byMember[item.assignee] = (byMember[item.assignee] ?? 0) + 1;
    } else {
      anyone++;
    }
  }
  return { byMember, anyone };
}

/**
 * Apply the assignee filter to a list. Pure helper — kept here so
 * pages can reuse it.
 */
export function applyHouseholdFilter(
  items: readonly ListItem[],
  selected: string | null,
  members: readonly string[],
): ListItem[] {
  if (selected === null) return [...items];
  if (selected === 'anyone') {
    return items.filter((i) => !i.assignee || !members.includes(i.assignee));
  }
  return items.filter((i) => i.assignee === selected);
}
