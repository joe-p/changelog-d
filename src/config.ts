import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const DEFAULT_CONFIG_FILE = "changelog-d.json";

export interface ChangelogConfig {
  sections: string[];
}

export function parseConfig(raw: string, source: string): ChangelogConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error instanceof Error ? error.message : error})`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${source}: expected a JSON object`);
  }

  const { sections } = parsed as Record<string, unknown>;
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error(`${source}: "sections" must be a non-empty array of section titles`);
  }

  for (const section of sections) {
    if (typeof section !== "string" || section.trim() === "") {
      throw new Error(`${source}: every entry in "sections" must be a non-empty string`);
    }
  }

  const duplicates = sections.filter((section, i) => sections.indexOf(section) !== i);
  if (duplicates.length > 0) {
    throw new Error(`${source}: duplicate section(s): ${[...new Set(duplicates)].join(", ")}`);
  }

  return { sections: sections as string[] };
}

export async function readConfig(configPath: string): Promise<ChangelogConfig> {
  const raw = await readFile(configPath, "utf8");
  return parseConfig(raw, configPath);
}

export async function loadConfig(configPath?: string): Promise<ChangelogConfig | undefined> {
  if (configPath) {
    if (!existsSync(configPath)) throw new Error(`Config file not found: ${configPath}`);
    return readConfig(configPath);
  }

  if (!existsSync(DEFAULT_CONFIG_FILE)) return undefined;
  return readConfig(DEFAULT_CONFIG_FILE);
}
