/**
 * Plain dates — formatted the way a housemate would say them in the
 * kitchen, not the way a project-management app would.
 */

export function relativeDay(then: number, now: number = Date.now()): string {
  const d = Math.floor((now - then) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'a week ago';
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  if (d < 60) return 'a month ago';
  return `${Math.floor(d / 30)} months ago`;
}

export function shortTime(then: number): string {
  const d = new Date(then);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
