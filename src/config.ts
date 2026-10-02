import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isBumpLevel, type BumpLevel } from "./bump.ts";
import { isSectionType, type SectionType, type SectionTypes } from "./generate.ts";

export const DEFAULT_CONFIG_FILE = "changelog-d.json";

export interface SectionConfig {
  title: string;
  bump?: BumpLevel;
  type?: SectionType;
}

export interface ChangelogConfig {
  sections: SectionConfig[];
}

export function sectionOrder(config: ChangelogConfig): string[] {
  return config.sections.map((section) => section.title);
}

export function sectionBumps(config: ChangelogConfig): Record<string, BumpLevel> {
  const bumps: Record<string, BumpLevel> = {};
  for (const section of config.sections) {
    if (section.bump) bumps[section.title] = section.bump;
  }
  return bumps;
}

export function sectionTypes(config: ChangelogConfig): SectionTypes {
  const types: SectionTypes = {};
  for (const section of config.sections) {
    if (section.type) types[section.title] = section.type;
  }
  return types;
}

export function parseConfig(raw: string, source: string): ChangelogConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error instanceof Error ? error.message : error})`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${source}: expected a JSON object`);
  }

  const { sections } = parsed as Record<string, unknown>;
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error(`${source}: "sections" must be a non-empty array of section objects`);
  }

  const titles: string[] = [];
  const result: SectionConfig[] = [];

  for (const [index, entry] of sections.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${source}: sections[${index}] must be an object`);
    }

    const { title, bump, type } = entry as Record<string, unknown>;
    if (typeof title !== "string" || title.trim() === "") {
      throw new Error(`${source}: sections[${index}].title must be a non-empty string`);
    }
    if (titles.includes(title)) {
      throw new Error(`${source}: duplicate section "${title}"`);
    }
    titles.push(title);

    const section: SectionConfig = { title };
    if (bump !== undefined) {
      const normalized = typeof bump === "string" ? bump.toUpperCase() : bump;
      if (!isBumpLevel(normalized)) {
        throw new Error(
          `${source}: invalid bump level for "${title}": ${JSON.stringify(bump)}. Expected MAJOR, MINOR or PATCH.`,
        );
      }
      section.bump = normalized;
    }
    if (type !== undefined) {
      const normalized = typeof type === "string" ? type.toLowerCase() : type;
      if (!isSectionType(normalized)) {
        throw new Error(
          `${source}: invalid section type for "${title}": ${JSON.stringify(type)}. Expected list or raw.`,
        );
      }
      section.type = normalized;
    }

    result.push(section);
  }

  return { sections: result };
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
