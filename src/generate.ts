export interface Section {
  title: string;
  lines: string[];
}

export interface Fragment {
  name: string;
  content: string;
}

export const UNRELEASED_MARKER = "UNRELEASED";

export interface VersionBlock {
  version: string;
  unreleased: boolean;
  sections: Section[];
  raw: string;
}

const SECTION_RE = /^##\s+(.*\S)\s*$/;
const VERSION_HEADING_RE = /^#\s+(.*\S)\s*$/;
const UNRELEASED_HEADING_RE = /^(.*?)\s*-\s*UNRELEASED\s*$/i;

export function parseFragment(content: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const match = SECTION_RE.exec(rawLine);
    if (match) {
      current = { title: match[1]!, lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (rawLine.trim() === "") continue;
    current.lines.push(rawLine.trimEnd());
  }

  return sections;
}

export function mergeSections(groups: Section[][], order?: string[]): Section[] {
  const ordered: Section[] = [];
  const byTitle = new Map<string, Section>();

  for (const group of groups) {
    for (const section of group) {
      if (order) assertKnownSection(section.title, order);
      if (section.lines.length === 0) continue;

      let merged = byTitle.get(section.title);
      if (!merged) {
        merged = { title: section.title, lines: [] };
        byTitle.set(section.title, merged);
        ordered.push(merged);
      }
      for (const line of section.lines) {
        if (!merged.lines.includes(line)) merged.lines.push(line);
      }
    }
  }

  return order ? orderSections(ordered, order) : ordered;
}

export function mergeFragments(fragments: Fragment[], order?: string[]): Section[] {
  const sorted = [...fragments].sort((a, b) => a.name.localeCompare(b.name));
  return mergeSections(
    sorted.map((fragment) => parseFragment(fragment.content)),
    order,
  );
}

export function parseChangelog(markdown: string): VersionBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: VersionBlock[] = [];
  let start = -1;
  let heading: { version: string; unreleased: boolean } | undefined;

  const push = (end: number): void => {
    if (!heading || start < 0) return;
    blocks.push({
      version: heading.version,
      unreleased: heading.unreleased,
      sections: parseFragment(lines.slice(start + 1, end).join("\n")),
      raw: lines.slice(start, end).join("\n").replace(/\s+$/, ""),
    });
  };

  for (const [index, line] of lines.entries()) {
    const match = VERSION_HEADING_RE.exec(line);
    if (!match) continue;

    push(index);
    const title = match[1]!;
    const unreleased = UNRELEASED_HEADING_RE.exec(title);
    heading = unreleased
      ? { version: unreleased[1]!.trim(), unreleased: true }
      : { version: title, unreleased: false };
    start = index;
  }

  push(lines.length);
  return blocks;
}

function assertKnownSection(title: string, order: string[]): void {
  if (!order.includes(title)) {
    throw new Error(
      `Unknown changelog section "## ${title}". Expected one of: ${order
        .map((section) => `"## ${section}"`)
        .join(", ")}.`,
    );
  }
}

export function orderSections(sections: Section[], order: string[]): Section[] {
  const index = new Map(order.map((title, position) => [title, position]));
  return [...sections].sort(
    (a, b) => (index.get(a.title) ?? Infinity) - (index.get(b.title) ?? Infinity),
  );
}

export function renderChangelog(sections: Section[], title = "Unreleased"): string {
  const parts: string[] = [`# ${title}`];

  for (const section of sections) {
    parts.push(`## ${section.title}`, section.lines.join("\n"));
  }

  return parts.join("\n\n") + "\n";
}

export function prependChangelog(existing: string, entry: string): string {
  const trimmed = existing.replace(/^\s+/, "").replace(/\s+$/, "");
  if (trimmed === "") return entry;
  return `${entry}\n${trimmed}\n`;
}
