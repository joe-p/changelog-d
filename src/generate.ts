import { parseVersion } from "./bump.ts";

export const SECTION_TYPES = ["list", "raw"] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && (SECTION_TYPES as readonly string[]).includes(value);
}

export type SectionTypes = Record<string, SectionType>;

export interface Section {
  title: string;
  type?: SectionType;
  lines: string[];
  body?: string;
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

const RAW_HEADING_RE = /^#{1,2}(\s|$)/;

export function parseFragment(content: string, types: SectionTypes = {}): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  let rawLines: string[] | undefined;

  const flushRaw = (): void => {
    if (!current || rawLines === undefined) return;
    current.body = rawLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  };

  let fence: string | undefined;
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(rawLine);
    const inFence = fence !== undefined;
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && rawLine.trim() === marker)
        fence = undefined;
    }
    const match = !inFence && !fenceMatch ? SECTION_RE.exec(rawLine) : null;
    if (match) {
      flushRaw();
      const title = match[1]!;
      current = { title, lines: [] };
      if (types[title] === "raw") {
        current.type = "raw";
        rawLines = [];
      } else {
        rawLines = undefined;
      }
      sections.push(current);
      continue;
    }
    if (!current) {
      if (rawLine.trim() !== "")
        throw new Error(`Line ${index + 1}: expected a ## section heading before content.`);
      continue;
    }
    if (rawLines !== undefined) {
      if (!inFence && RAW_HEADING_RE.test(rawLine)) {
        throw new Error(
          `Raw section "## ${current.title}" may not contain a level-1 or level-2 heading: ${JSON.stringify(
            rawLine.trim(),
          )}. Use ### or deeper.`,
        );
      }
      rawLines.push(rawLine);
      continue;
    }
    if (!inFence && RAW_HEADING_RE.test(rawLine)) {
      throw new Error(
        `Line ${index + 1}: unexpected heading ${JSON.stringify(rawLine)}. Use ### or deeper.`,
      );
    }
    current.lines.push(rawLine.trimEnd());
  }

  flushRaw();
  for (const section of sections) {
    while (section.lines[0] === "") section.lines.shift();
    while (section.lines.at(-1) === "") section.lines.pop();
  }
  return sections;
}

function listItems(lines: string[]): string[][] {
  const itemPattern = /^( *)(?:[-+*]|\d+[.)])\s+/;
  let fence: string | undefined;
  const matches = lines.map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker)
        fence = undefined;
      return null;
    }
    return fence ? null : itemPattern.exec(line);
  });
  const indents = matches.flatMap((match) => {
    return match ? [match[1]!.length] : [];
  });
  const indent = Math.min(...indents);
  const items: string[][] = [];
  for (const [index, line] of lines.entries()) {
    const match = matches[index];
    if (items.length === 0 || (match && match[1]!.length === indent)) items.push([]);
    items.at(-1)!.push(line);
  }
  return items;
}

export function mergeSections(
  groups: Section[][],
  order?: string[],
  types: SectionTypes = {},
): Section[] {
  const ordered: Section[] = [];
  const byTitle = new Map<string, Section>();
  const rawBodies = new Map<string, Set<string>>();

  for (const group of groups) {
    for (const section of group) {
      if (order) assertKnownSection(section.title, order);

      if ((section.type ?? types[section.title]) === "raw") {
        const body = section.body ?? "";
        if (body.trim() === "") continue;

        let merged = byTitle.get(section.title);
        if (!merged) {
          merged = { title: section.title, type: "raw", lines: [], body: "" };
          byTitle.set(section.title, merged);
          rawBodies.set(section.title, new Set());
          ordered.push(merged);
        }

        let seen = rawBodies.get(section.title);
        if (!seen) {
          seen = new Set();
          rawBodies.set(section.title, seen);
        }
        if (seen.has(body)) continue;
        seen.add(body);
        merged.body = merged.body === "" ? body : `${merged.body}\n\n${body}`;
        continue;
      }

      if (section.lines.length === 0) continue;

      let merged = byTitle.get(section.title);
      if (!merged) {
        merged = { title: section.title, lines: [] };
        byTitle.set(section.title, merged);
        ordered.push(merged);
      }
      const seen = new Set(
        listItems(merged.lines).map((item) => item.join("\n").replace(/\n+$/, "")),
      );
      for (const item of listItems(section.lines)) {
        const key = item.join("\n").replace(/\n+$/, "");
        if (!seen.has(key)) {
          merged.lines.push(...item);
          seen.add(key);
        }
      }
    }
  }

  return order ? orderSections(ordered, order) : ordered;
}

export function mergeFragments(
  fragments: Fragment[],
  order?: string[],
  types: SectionTypes = {},
): Section[] {
  const sorted = [...fragments].sort((a, b) => a.name.localeCompare(b.name));
  return mergeSections(
    sorted.map((fragment) => {
      try {
        const sections = parseFragment(fragment.content, types);
        if (!sections.some((section) => section.lines.length > 0 || section.body?.trim())) {
          throw new Error("Fragment contains no section entries.");
        }
        if (order) for (const section of sections) assertKnownSection(section.title, order);
        return sections;
      } catch (error) {
        throw new Error(
          `${fragment.name}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }),
    order,
    types,
  );
}

export function parseChangelog(markdown: string, types: SectionTypes = {}): VersionBlock[] {
  return parseChangelogDocument(markdown, types).blocks;
}

export function parseChangelogDocument(
  markdown: string,
  types: SectionTypes = {},
): { preamble: string; blocks: VersionBlock[] } {
  const lines = markdown.split(/\r?\n/);
  const blocks: VersionBlock[] = [];
  let start = -1;
  let heading: { version: string; unreleased: boolean } | undefined;
  let firstVersion = -1;

  const push = (end: number): void => {
    if (!heading || start < 0) return;
    blocks.push({
      version: heading.version,
      unreleased: heading.unreleased,
      sections: parseFragment(lines.slice(start + 1, end).join("\n"), types),
      raw: lines.slice(start, end).join("\n").replace(/\s+$/, ""),
    });
  };

  let fence: string | undefined;
  for (const [index, line] of lines.entries()) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker)
        fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = VERSION_HEADING_RE.exec(line);
    if (!match) continue;

    const title = match[1]!;
    const unreleased = UNRELEASED_HEADING_RE.exec(title);
    if (!unreleased && !/^v?\d/.test(title)) {
      if (start < 0) continue;
      throw new Error(`Unexpected level-1 heading: ${JSON.stringify(title)}.`);
    }
    parseVersion(unreleased ? unreleased[1]!.trim() : title);
    push(index);
    if (firstVersion < 0) firstVersion = index;
    heading = unreleased
      ? { version: unreleased[1]!.trim(), unreleased: true }
      : { version: title, unreleased: false };
    start = index;
  }

  push(lines.length);
  return {
    preamble: lines.slice(0, firstVersion < 0 ? lines.length : firstVersion).join("\n"),
    blocks,
  };
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
    if (section.type === "raw") {
      parts.push(`## ${section.title}`, section.body ?? "");
    } else {
      parts.push(`## ${section.title}`, section.lines.join("\n"));
    }
  }

  return parts.join("\n\n") + "\n";
}

export function prependChangelog(existing: string, entry: string): string {
  const trimmed = existing.replace(/^\s+/, "").replace(/\s+$/, "");
  if (trimmed === "") return entry;
  return `${entry}\n${trimmed}\n`;
}
