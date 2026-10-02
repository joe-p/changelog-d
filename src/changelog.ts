import { readdir, readFile, writeFile, rm, rename, stat, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  mergeFragments,
  mergeSections,
  parseChangelogDocument,
  prependChangelog,
  renderChangelog,
  UNRELEASED_MARKER,
  type Fragment,
  type Section,
  type SectionTypes,
  type VersionBlock,
} from "./generate.ts";
import {
  baseVersion,
  highestBase,
  highestBump,
  isPrerelease,
  nextPrerelease,
  nextVersion,
  parseVersion,
  prereleaseOf,
  type BumpLevel,
} from "./bump.ts";

export interface GenerateOptions {
  dir: string;
  output: string;
  input?: string;
  clear: boolean;
  dryRun: boolean;
  order?: string[];
  bump?: Record<string, BumpLevel>;
  types?: SectionTypes;
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
  prerelease?: string;
  order?: string[];
  types?: SectionTypes;
}

export interface ReleaseResult {
  version: string;
  prerelease?: string;
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

async function atomicWrite(file: string, content: string): Promise<void> {
  // Resolve symlinks through the existing destination rather than replacing them.
  const destination = existsSync(file) ? await realpath(file) : path.resolve(file);
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    const mode = existsSync(destination) ? (await stat(destination)).mode : undefined;
    await writeFile(temporary, content, { flag: "wx", mode });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

function withPreamble(preamble: string, content: string): string {
  if (preamble === "") return content;
  const separator = preamble.endsWith("\n\n") ? "" : preamble.endsWith("\n") ? "\n" : "\n\n";
  return `${preamble}${separator}${content}`;
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
  const level = selectBump(sections, bump);
  const lastReleased = blocks.find(
    (block) => !block.unreleased && !isPrerelease(block.version),
  )?.version;
  const prereleaseBases = blocks
    .filter((block) => isPrerelease(block.version))
    .map((block) => baseVersion(block.version));

  if (lastReleased === undefined) {
    const base = blocks.find((block) => block.unreleased)?.version ?? "1.0.0";
    const version = base === "1.0.0" ? "1.0.0" : nextVersion(base, level);
    return { version: highestBase(version, ...prereleaseBases), level, previous: undefined };
  }

  const bumped = nextVersion(lastReleased, level);
  return {
    version: highestBase(bumped, ...prereleaseBases),
    level,
    previous: lastReleased,
  };
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const fragments = await readFragments(options.dir);
  const names = fragments.map((fragment) => fragment.name);
  const toStdout = options.output === "-";
  const input = options.input ?? (toStdout ? "CHANGELOG.md" : options.output);
  const existing =
    existsSync(input) ? await readFile(input, "utf8") : "";

  const { blocks, preamble } = parseChangelogDocument(existing, options.types);
  if (blocks.slice(1).some((block) => block.unreleased)) {
    throw new Error("An UNRELEASED section must appear only at the top of the changelog.");
  }
  const existingUnreleased = blocks[0]?.unreleased ? blocks[0].sections : [];
  const sections = mergeSections(
    [existingUnreleased, mergeFragments(fragments, options.order, options.types)],
    options.order,
    options.types,
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
    await atomicWrite(options.output, withPreamble(preamble, prependChangelog(remainder, entry)));
  }

  const cleared: string[] = [];
  if (options.clear && written && names.length > 0) {
    for (const fragment of fragments) {
      const file = path.join(options.dir, fragment.name);
      // Keep fragments edited since the snapshot; a later generate can consume them.
      try {
        if (await readFile(file, "utf8") !== fragment.content) continue;
        await rm(file);
        cleared.push(fragment.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  return { entry, version, title, level, previous, fragments: names, written, cleared };
}

export async function release(options: ReleaseOptions): Promise<ReleaseResult> {
  const existing = await readFile(options.output, "utf8");
  const { blocks, preamble } = parseChangelogDocument(existing, options.types);

  const dir = options.dir ?? "changelog.d";
  const pending = await listFragments(dir);
  if (pending.length > 0) {
    throw new Error(
      `Cannot release: ${dir} still contains ${pending.length} pending fragment(s). Run generate first.`,
    );
  }

  return options.prerelease !== undefined
    ? releasePrerelease(options, blocks, options.prerelease, preamble)
    : releaseFinal(options, blocks, preamble);
}

async function releasePrerelease(
  options: ReleaseOptions,
  blocks: VersionBlock[],
  channel: string,
  preamble: string,
): Promise<ReleaseResult> {
  const top = blocks[0];
  if (!top || !top.unreleased) {
    throw new Error(`No ${UNRELEASED_MARKER} section found in ${options.output}.`);
  }

  parseVersion(top.version);
  const title = nextPrerelease(
    top.version,
    channel,
    blocks.map((block) => block.version),
  );
  const entry = renderChangelog(top.sections, title);
  const remainder = blocks
    .slice(1)
    .map((block) => block.raw)
    .join("\n\n");

  if (!options.dryRun) {
    await atomicWrite(options.output, withPreamble(preamble, prependChangelog(remainder, entry)));
  }

  return { version: baseVersion(top.version), prerelease: title, written: !options.dryRun };
}

async function releaseFinal(
  options: ReleaseOptions,
  blocks: VersionBlock[],
  preamble: string,
): Promise<ReleaseResult> {
  const top = blocks[0];
  if (!top || (!top.unreleased && !isPrerelease(top.version))) {
    throw new Error(`No ${UNRELEASED_MARKER} section found in ${options.output}.`);
  }

  const base = baseVersion(top.version);
  const consumed: VersionBlock[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    if (!block.unreleased && prereleaseOf(block.version) === undefined) break;
    if (baseVersion(block.version) !== base) break;
    consumed.push(block);
    index += 1;
  }

  const sections = mergeSections(consumed.map((block) => block.sections), options.order, options.types);
  const entry = renderChangelog(sections, base);
  const remainder = blocks
    .slice(index)
    .map((block) => block.raw)
    .join("\n\n");

  if (!options.dryRun) {
    await atomicWrite(options.output, withPreamble(preamble, prependChangelog(remainder, entry)));
  }

  return { version: base, written: !options.dryRun };
}
