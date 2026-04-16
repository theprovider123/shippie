/**
 * Changelog extractor for a deploy.
 *
 * Preference order:
 *   1. CHANGELOG.md at repo root — return the top section
 *   2. git log --oneline between prev deploy and HEAD (GitHub path only)
 *   3. Default: "Initial release" (v1) / "Updates in v{n}" (v2+)
 *
 * This runs against the in-memory file tree of a completed deploy —
 * the git path is left as a stub until the GitHub App lands (Week 6 deferred).
 *
 * Spec v6 §8 (auto-packaging — changelog).
 */

export interface ChangelogInput {
  files: Map<string, Buffer>;
  version: number;
}

export interface ChangelogResult {
  source: 'CHANGELOG.md' | 'git' | 'default';
  entries: string[];
  summary: string;
}

export function extractChangelog(input: ChangelogInput): ChangelogResult {
  const fromFile = extractFromChangelogMd(input.files);
  if (fromFile) return fromFile;

  // Git source is stubbed — deferred until GitHub webhook path ships
  return {
    source: 'default',
    entries: [],
    summary: input.version === 1 ? 'Initial release' : `Updates in v${input.version}`,
  };
}

function extractFromChangelogMd(files: Map<string, Buffer>): ChangelogResult | null {
  const candidates = ['CHANGELOG.md', 'changelog.md', 'CHANGELOG.MD', 'CHANGES.md'];
  let content: string | undefined;
  for (const name of candidates) {
    const buf = files.get(name);
    if (buf) {
      content = buf.toString('utf8');
      break;
    }
  }
  if (!content) return null;

  // Return the first section: everything up to the second "## " heading
  const lines = content.split(/\r?\n/);
  const sectionStart = lines.findIndex((l) => l.startsWith('## '));
  if (sectionStart === -1) {
    const firstLine = lines.find((l) => l.trim().length > 0) ?? '';
    return { source: 'CHANGELOG.md', entries: [], summary: firstLine };
  }

  const rest = lines.slice(sectionStart + 1);
  const nextSection = rest.findIndex((l) => l.startsWith('## '));
  const sectionLines = nextSection === -1 ? rest : rest.slice(0, nextSection);

  const entries = sectionLines
    .filter((l) => /^[-*]\s/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);

  return {
    source: 'CHANGELOG.md',
    entries,
    summary: lines[sectionStart]!.replace(/^##\s+/, '').trim(),
  };
}
