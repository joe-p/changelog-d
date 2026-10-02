#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { generate, release } from "./changelog.ts";
import {
  DEFAULT_CONFIG_FILE,
  loadConfig,
  sectionBumps,
  sectionOrder,
} from "./config.ts";

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `changelog-d - merge changelog.d fragments into a changelog

Usage:
  changelog-d [generate] [options]
  changelog-d release [options]

Commands:
  generate              Merge pending fragments into an unreleased section and
                        prepend it to the changelog. This is the default command.
  release               Mark the top unreleased section as released by removing
                        the " - UNRELEASED" suffix. Fails if fragments are pending.

Options:
  -d, --dir <path>      Directory containing changelog fragments (default: changelog.d)
  -o, --output <path>   Changelog file, or "-" for stdout (default: CHANGELOG.md)
  -c, --config <path>   Config file defining section order and bump levels (default: ${DEFAULT_CONFIG_FILE})
      --dry-run         Print the result without writing or clearing
      --no-clear        Keep the fragment files after generating
  -h, --help            Show this help
  -v, --version         Show the version

Versions are read from the changelog itself. The next version is the highest
bump level among the pending sections applied to the last released version. While
the top section is "1.0.0 - UNRELEASED" and 1.0.0 has not been released, the
version stays 1.0.0 regardless of bump level.

Config file:
  A JSON object with a "sections" array listing the allowed sections in the order
  they should appear. Each section has a "title" and an optional semantic version
  "bump" level (MAJOR, MINOR or PATCH), e.g.

    {
      "sections": [
        { "title": "Breaking Changes", "bump": "MAJOR" },
        { "title": "Fixes", "bump": "PATCH" },
        { "title": "Features", "bump": "MINOR" }
      ]
    }

  Sections found in fragments that are not listed cause an error.
`;

function fail(message: string): never {
  process.stderr.write(`changelog-d: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        dir: { type: "string", short: "d" },
        output: { type: "string", short: "o" },
        config: { type: "string", short: "c" },
        "dry-run": { type: "boolean" },
        "no-clear": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: true,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  const command = positionals[0] ?? "generate";
  if (command !== "generate" && command !== "release") {
    fail(`unknown command: ${command}`);
  }
  if (positionals.length > 1) {
    fail(`unexpected argument: ${positionals[1]}`);
  }

  const dir = values.dir ?? "changelog.d";
  const output = values.output ?? "CHANGELOG.md";
  const dryRun = values["dry-run"] ?? false;

  if (command === "release") {
    const result = await release({ output, dir, dryRun });
    if (dryRun) {
      process.stdout.write(`Would release ${result.version} in ${output}.\n`);
      return;
    }
    process.stdout.write(`Released ${result.version} in ${output}.\n`);
    return;
  }

  const config = await loadConfig(values.config);

  const result = await generate({
    dir,
    output,
    clear: !values["no-clear"],
    dryRun,
    order: config ? sectionOrder(config) : undefined,
    bump: config ? sectionBumps(config) : undefined,
  });

  if (result.fragments.length === 0) {
    process.stdout.write("No changelog fragments found.\n");
    return;
  }

  if (dryRun || values.output === "-") {
    process.stdout.write(result.entry);
    return;
  }

  const from = result.previous ?? "initial";
  const bump = result.level && result.previous ? ` (${result.level})` : "";
  process.stderr.write(`changelog-d: ${from} -> ${result.version}${bump}\n`);

  process.stdout.write(
    `Generated ${output} from ${result.fragments.length} fragment(s)` +
      (result.cleared.length > 0 ? ` and cleared ${result.cleared.length} file(s).\n` : ".\n"),
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
