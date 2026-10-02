export const BUMP_LEVELS = ["PATCH", "MINOR", "MAJOR"] as const;

export type BumpLevel = (typeof BUMP_LEVELS)[number];

const BUMP_WEIGHT: Record<BumpLevel, number> = { PATCH: 1, MINOR: 2, MAJOR: 3 };

export function isBumpLevel(value: unknown): value is BumpLevel {
  return typeof value === "string" && (BUMP_LEVELS as readonly string[]).includes(value);
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseVersion(version: string): ParsedVersion {
  const match = VERSION_RE.exec(version.trim());
  if (!match) {
    throw new Error(`Invalid semantic version: "${version}". Expected MAJOR.MINOR.PATCH.`);
  }

  const parsed: ParsedVersion = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  if (match[4]) parsed.prerelease = match[4];
  if (match[5]) parsed.build = match[5];
  return parsed;
}

export function applyBump(version: string, level: BumpLevel): string {
  const { major, minor, patch } = parseVersion(version);

  switch (level) {
    case "MAJOR":
      return `${major + 1}.0.0`;
    case "MINOR":
      return `${major}.${minor + 1}.0`;
    case "PATCH":
      return `${major}.${minor}.${patch + 1}`;
  }
}

export function highestBump(levels: Iterable<BumpLevel>): BumpLevel | undefined {
  let highest: BumpLevel | undefined;
  for (const level of levels) {
    if (!highest || BUMP_WEIGHT[level] > BUMP_WEIGHT[highest]) highest = level;
  }
  return highest;
}

export function nextVersion(base: string, level: BumpLevel | undefined): string {
  return level ? applyBump(base, level) : base;
}
