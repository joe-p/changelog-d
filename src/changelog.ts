import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { mergeFragments, prependChangelog, renderChangelog } from "./generate.ts";

export interface GenerateOptions {
  dir: string;
  output: string;
  title: string;
  clear: boolean;
  dryRun: boolean;
  order?: string[];
}

export interface GenerateResult {
  entry: string;
  fragments: string[];
  written: boolean;
  cleared: string[];
}

async function listFragments(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const names = await listFragments(options.dir);
  const fragments = await Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(path.join(options.dir, name), "utf8"),
    })),
  );

  const entry = renderChangelog(mergeFragments(fragments, options.order), options.title);
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

  return { entry, fragments: names, written, cleared };
}
