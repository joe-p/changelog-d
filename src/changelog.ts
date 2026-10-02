import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  mergeFragments,
  mergeSections,
  parseChangelog,
  prependChangelog,
  renderChangelog,
  UNRELEASED_MARKER,
  type Fragment,
  type Section,
  type VersionBlock,
} from "./generate.ts";
import { highestBump, nextVersion, parseVersion, type BumpLevel } from "./bump.ts";

export interface GenerateOptions {
  dir: string;
  output: string;
  clear: boolean;
  dryRun: boolean;
  order?: string[];
  bump?: Record<string, BumpLevel>;
}

export interface GenerateResult {
  entry: string;
  version: string;
  title: string;
  level: BumpLevel | undefined;
  previous: string | undefined;
  fragments: string[];
  written: boolean;
  cleared: string[];
}

export interface ReleaseOptions {
  output: string;
  dir?: string;
  dryRun: boolean;
}

export interface ReleaseResult {
  version: string;
  written: boolean;
}

async function listFragments(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function readFragments(dir: string): Promise<Fragment[]> {
  const names = await listFragments(dir);
  return Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(path.join(dir, name), "utf8"),
    })),
  );
}

export function selectBump(sections: Section[], bump: Record<string, BumpLevel>): BumpLevel | undefined {
  return highestBump(
    sections.map((section) => bump[section.title]).filter((level): level is BumpLevel => level !== undefined),
  );
}

function resolveNextVersion(
  blocks: VersionBlock[],
  sections: Section[],
  bump: Record<string, BumpLevel>,
): { version: string; level: BumpLevel | undefined; previous: string | undefined } {
  const lastReleased = blocks.find((block) => !block.unreleased)?.version;
  const level = selectBump(sections, bump);

  if (lastReleased === undefined) {
    const base = blocks.find((block) => block.unreleased)?.version ?? "1.0.0";
    const version = base === "1.0.0" ? "1.0.0" : nextVersion(base, level);
    return { version, level, previous: undefined };
  }

  return { version: nextVersion(lastReleased, level), level, previous: lastReleased };
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const names = await listFragments(options.dir);
  const fragments = await readFragments(options.dir);
  const toStdout = options.output === "-";
  const existing =
    !toStdout && existsSync(options.output) ? await readFile(options.output, "utf8") : "";

  const blocks = parseChangelog(existing);
  const existingUnreleased = blocks[0]?.unreleased ? blocks[0].sections : [];
  const sections = mergeSections(
    [existingUnreleased, mergeFragments(fragments, options.order)],
    options.order,
  );

  if (sections.length === 0) {
    return {
      entry: "",
      version: "",
      title: "",
      level: undefined,
      previous: blocks.find((block) => !block.unreleased)?.version,
      fragments: names,
      written: false,
      cleared: [],
    };
  }

  const { version, level, previous } = resolveNextVersion(blocks, sections, options.bump ?? {});
  const title = `${version} - ${UNRELEASED_MARKER}`;
  const entry = renderChangelog(sections, title);

  const remainder = blocks
    .filter((block) => !block.unreleased)
    .map((block) => block.raw)
    .join("\n\n");

  const written = !options.dryRun && !toStdout;
  if (written) {
    await writeFile(options.output, prependChangelog(remainder, entry));
  }

  const cleared: string[] = [];
  if (options.clear && written && names.length > 0) {
    for (const name of names) {
      await rm(path.join(options.dir, name));
      cleared.push(name);
    }
  }

  return { entry, version, title, level, previous, fragments: names, written, cleared };
}

export async function release(options: ReleaseOptions): Promise<ReleaseResult> {
  const existing = await readFile(options.output, "utf8");
  const blocks = parseChangelog(existing);
  const top = blocks[0];

  if (!top || !top.unreleased) {
    throw new Error(`No ${UNRELEASED_MARKER} section found in ${options.output}.`);
  }

  const dir = options.dir ?? "changelog.d";
  const pending = await listFragments(dir);
  if (pending.length > 0) {
    throw new Error(
      `Cannot release: ${dir} still contains ${pending.length} pending fragment(s). Run generate first.`,
    );
  }

  parseVersion(top.version);
  const entry = renderChangelog(top.sections, top.version);
  const remainder = blocks
    .slice(1)
    .map((block) => block.raw)
    .join("\n\n");

  if (!options.dryRun) {
    await writeFile(options.output, prependChangelog(remainder, entry));
  }

  return { version: top.version, written: !options.dryRun };
}
