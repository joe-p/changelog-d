export interface Section {
  title: string;
  lines: string[];
}

export interface Fragment {
  name: string;
  content: string;
}

const SECTION_RE = /^##\s+(.*\S)\s*$/;

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

export function mergeFragments(fragments: Fragment[], order?: string[]): Section[] {
  const ordered: Section[] = [];
  const byTitle = new Map<string, Section>();

  const sorted = [...fragments].sort((a, b) => a.name.localeCompare(b.name));

  for (const fragment of sorted) {
    for (const section of parseFragment(fragment.content)) {
      if (order) assertKnownSection(section.title, order);
      if (section.lines.length === 0) continue;

      let merged = byTitle.get(section.title);
      if (!merged) {
        merged = { title: section.title, lines: [] };
        byTitle.set(section.title, merged);
        ordered.push(merged);
      }
      merged.lines.push(...section.lines);
    }
  }

  return order ? orderSections(ordered, order) : ordered;
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
  const trimmed = existing.replace(/^\s+/, "");
  if (trimmed === "") return entry;
  return `${entry}\n${trimmed}`;
}
