/**
 * Line-based diff for version comparison.
 *
 * We do a simple LCS-based diff that classifies each line as added,
 * removed, or unchanged. Good enough for "what did I change between
 * v2 and v3 of the budget section." Not a Myers diff — version
 * snapshots are small (whole pitch ~ a few KB of markdown), so the
 * O(m*n) LCS table is fine.
 */

export type DiffOp = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Compute a line diff. Returns lines in the order they should be
 * displayed: removals + additions appear in-place, unchanged lines
 * are kept on both sides.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  // LCS table.
  const m = a.length;
  const n = b.length;
  // dp[i][j] = length of LCS of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i + 1]![j + 1] = dp[i]![j]! + 1;
      } else {
        dp[i + 1]![j + 1] = Math.max(dp[i]![j + 1]!, dp[i + 1]![j]!);
      }
    }
  }

  // Walk back to produce the diff.
  const out: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ op: 'unchanged', text: a[i - 1]! });
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      out.push({ op: 'removed', text: a[i - 1]! });
      i--;
    } else {
      out.push({ op: 'added', text: b[j - 1]! });
      j--;
    }
  }
  while (i > 0) {
    out.push({ op: 'removed', text: a[i - 1]! });
    i--;
  }
  while (j > 0) {
    out.push({ op: 'added', text: b[j - 1]! });
    j--;
  }
  out.reverse();
  return out;
}

/** Summary counts for a UI badge ("+12 / −5"). */
export function diffStats(lines: DiffLine[]): { added: number; removed: number; unchanged: number } {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const l of lines) {
    if (l.op === 'added') added++;
    else if (l.op === 'removed') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}
