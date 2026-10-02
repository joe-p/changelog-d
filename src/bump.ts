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

const VERSION_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(version: string): ParsedVersion {
  const match = VERSION_RE.exec(version.trim());
  if (
    !match ||
    match.slice(1, 4).some((part) => !Number.isSafeInteger(Number(part))) ||
    match[4]
      ?.split(".")
      .some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))
  ) {
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
      return checkedVersion(`${major + 1}.0.0`);
    case "MINOR":
      return checkedVersion(`${major}.${minor + 1}.0`);
    case "PATCH":
      return checkedVersion(`${major}.${minor}.${patch + 1}`);
  }
}

export function baseVersion(version: string): string {
  const { major, minor, patch } = parseVersion(version);
  return `${major}.${minor}.${patch}`;
}

export function prereleaseOf(version: string): string | undefined {
  try {
    return parseVersion(version).prerelease;
  } catch {
    return undefined;
  }
}

export function isPrerelease(version: string): boolean {
  return prereleaseOf(version) !== undefined;
}

function checkedVersion(version: string): string {
  parseVersion(version);
  return version;
}

export function prereleaseVersion(base: string, channel: string, number: number): string {
  if (
    !/^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(channel) ||
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw new Error("Invalid prerelease channel or number.");
  }
  return checkedVersion(`${baseVersion(base)}-${channel}.${number}`);
}

export function nextPrerelease(base: string, channel: string, versions: Iterable<string>): string {
  const target = baseVersion(base);
  let highest = 0;

  for (const version of versions) {
    const prerelease = prereleaseOf(version);
    if (prerelease === undefined || baseVersion(version) !== target) continue;

    const match = /^(.*)\.(\d+)$/.exec(prerelease);
    if (!match || match[1] !== channel) continue;
    highest = Math.max(highest, Number(match[2]));
  }

  return prereleaseVersion(target, channel, highest + 1);
}

export function compareBase(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function highestBase(...versions: string[]): string {
  let highest: string | undefined;
  for (const version of versions) {
    if (highest === undefined || compareBase(version, highest) > 0) highest = version;
  }
  return highest === undefined ? "0.0.0" : baseVersion(highest);
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
