import type { RailGroups, RailTool } from './rail-groups';

export type ToolSwitcherSectionId = 'open' | 'saved' | 'recent' | 'browse' | 'results';

export interface ToolSwitcherSection {
  id: ToolSwitcherSectionId;
  label: string;
  tools: RailTool[];
  total: number;
  hidden: number;
}

export interface ToolSwitcherInput {
  groups: RailGroups;
  allApps: RailTool[];
  query?: string;
  maxPerSection?: number;
}

function matches(tool: RailTool, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    tool.name.toLowerCase().includes(q) ||
    tool.slug.toLowerCase().includes(q) ||
    tool.icon.toLowerCase().includes(q) ||
    (tool.category ?? '').toLowerCase().includes(q)
  );
}

function uniqueBySlug(tools: RailTool[]): RailTool[] {
  const seen = new Set<string>();
  const out: RailTool[] = [];
  for (const tool of tools) {
    if (seen.has(tool.slug)) continue;
    seen.add(tool.slug);
    out.push(tool);
  }
  return out;
}

function section(
  id: ToolSwitcherSectionId,
  label: string,
  tools: RailTool[],
  max: number,
): ToolSwitcherSection | null {
  if (tools.length === 0) return null;
  return {
    id,
    label,
    tools: tools.slice(0, max),
    total: tools.length,
    hidden: Math.max(0, tools.length - max),
  };
}

export function buildToolSwitcherSections(input: ToolSwitcherInput): ToolSwitcherSection[] {
  const max = input.maxPerSection ?? 80;
  const query = (input.query ?? '').trim();
  const orderedAll = uniqueBySlug([
    ...input.groups.open,
    ...input.groups.saved,
    ...input.groups.recent,
    ...input.allApps,
  ]);

  if (query) {
    return [
      section('results', 'Results', orderedAll.filter((tool) => matches(tool, query)), max),
    ].filter((s): s is ToolSwitcherSection => Boolean(s));
  }

  const quickSlugs = new Set([
    ...input.groups.open.map((tool) => tool.slug),
    ...input.groups.saved.map((tool) => tool.slug),
    ...input.groups.recent.map((tool) => tool.slug),
  ]);
  const browse = input.allApps.filter((tool) => !quickSlugs.has(tool.slug));

  return [
    section('open', 'Running', input.groups.open, max),
    section('saved', 'Saved', input.groups.saved, max),
    section('recent', 'Recent', input.groups.recent, max),
    section('browse', 'Browse', browse, max),
  ].filter((s): s is ToolSwitcherSection => Boolean(s));
}
