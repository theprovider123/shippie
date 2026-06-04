// Maker label + route regression guard.
//
// The maker backend OWNS /maker/* and uses one vocabulary ("Apps", "Manage").
// This static scan fails the build if a regression reintroduces:
//   - the old split labels "All apps" / "Your apps"
//   - a user-facing /dashboard URL inside the maker surface (the real pages
//     moved to /maker; /dashboard is a redirect alias only)
//   - stale maker Home metric counters in place of live source-table metrics
//
// Component IMPORT paths under $components/dashboard/ are allowed (that's the
// physical component directory, not a URL). Runs in `bun run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/routes/maker', 'src/lib/components/maker'];
const EXTRA_FILES = ['src/routes/you/+page.svelte'];

/** @type {Array<{ re: RegExp; msg: string }>} */
const RULES = [
  { re: /\bAll apps\b/, msg: 'forbidden label "All apps" (use "Apps" / "Manage apps")' },
  { re: /\bYour apps\b/, msg: 'forbidden label "Your apps" (use "Apps")' },
  { re: /\/dashboard\/apps/, msg: 'user-facing /dashboard/apps URL (use /maker/apps)' },
  { re: /["'`]\/dashboard(["'`?])/, msg: 'user-facing /dashboard URL (use /maker)' },
];
const MAKER_HOME_FILES = new Set([
  join('src', 'routes', 'maker', 'apps', '[slug]', '+page.server.ts'),
  join('src', 'routes', 'maker', 'apps', '[slug]', '+page.svelte'),
]);
const STALE_HOME_METRIC_RE = /\b(?:installCount|feedbackOpenCount)\b/;

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(svelte|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...ROOTS.flatMap(walk), ...EXTRA_FILES];
const violations = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // Allow the component directory import path.
    if (line.includes('$components/dashboard/') || line.includes("components/dashboard/")) {
      // strip the import portion so a URL on the same line is still checked
      if (/^\s*import\b/.test(line)) return;
    }
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push(`${file}:${i + 1}  ${rule.msg}\n    ${line.trim()}`);
      }
    }
    if (MAKER_HOME_FILES.has(file) && STALE_HOME_METRIC_RE.test(line)) {
      violations.push(
        `${file}:${i + 1}  stale maker Home metric counter (use live analytics/feedback source tables)\n    ${line.trim()}`,
      );
    }
  });
}

if (violations.length > 0) {
  console.error(`[maker-labels] ${violations.length} regression(s):\n`);
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`[maker-labels] OK — scanned ${files.length} maker files, no label/route regressions.`);
