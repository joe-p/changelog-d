import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { mergeFragments, prependChangelog, renderChangelog, type Fragment, type Section } from "./generate.ts";
import { applyBump, highestBump, parseVersion, type BumpLevel } from "./bump.ts";

export interface GenerateOptions {
  dir: string;
  output: string;
  title?: string;
  current?: string;
  clear: boolean;
  dryRun: boolean;
  order?: string[];
  bump?: Record<string, BumpLevel>;
}

export interface GenerateResult {
  entry: string;
  title: string;
  level: BumpLevel | undefined;
  fragments: string[];
  written: boolean;
  cleared: string[];
}

export interface BumpOptions {
  dir: string;
  current: string;
  order?: string[];
  bump?: Record<string, BumpLevel>;
}

export interface BumpResult {
  current: string;
  next: string;
  level: BumpLevel | undefined;
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

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const names = await listFragments(options.dir);
  const fragments = await readFragments(options.dir);
  const sections = mergeFragments(fragments, options.order);

  const { title, level } = resolveTitle(sections, options);
  const entry = renderChangelog(sections, title);
  const toStdout = options.output === "-";
  const written = !options.dryRun && !toStdout;

  if (written) {
    const existing = existsSync(options.output) ? await readFile(options.output, "utf8") : "";
    await writeFile(options.output, prependChangelog(existing, entry));
  }

  const cleared: string[] = [];
  if (options.clear && written && names.length > 0) {
    for (const name of names) {
      await rm(path.join(options.dir, name));
      cleared.push(name);
    }
  }

  return { entry, title, level, fragments: names, written, cleared };
}

export function selectBump(sections: Section[], bump: Record<string, BumpLevel>): BumpLevel | undefined {
  return highestBump(
    sections.map((section) => bump[section.title]).filter((level): level is BumpLevel => level !== undefined),
  );
}

function resolveTitle(
  sections: Section[],
  options: Pick<GenerateOptions, "current" | "title" | "bump">,
): { title: string; level: BumpLevel | undefined } {
  if (options.current === undefined) {
    return { title: options.title ?? "Unreleased", level: undefined };
  }

  parseVersion(options.current);
  const level = selectBump(sections, options.bump ?? {});
  return { title: level ? applyBump(options.current, level) : options.current, level };
}

export async function bumpVersion(options: BumpOptions): Promise<BumpResult> {
  const fragments = await readFragments(options.dir);
  const sections = mergeFragments(fragments, options.order);
  const { title: next, level } = resolveTitle(sections, {
    current: options.current,
    bump: options.bump,
  });

  return { current: options.current, next, level };
}
