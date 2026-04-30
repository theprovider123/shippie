export function isSurpriseUnlocked(
  surprise: { unlock_mode: 'at_time' | 'at_next_visit'; deliver_at: string | null },
  coupleNextVisitDate: string | null,
  now: Date = new Date(),
): boolean {
  if (surprise.unlock_mode === 'at_time') {
    return !!surprise.deliver_at && new Date(surprise.deliver_at) <= now;
  }
  return !!coupleNextVisitDate && new Date(coupleNextVisitDate) <= now;
}
