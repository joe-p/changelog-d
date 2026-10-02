#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { generate } from "./changelog.ts";
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

const HELP = `changelog-d - merge changelog.d fragments into a changelog section

Usage:
  changelog-d [version] [options]

Arguments:
  version               Previous released version. When given, the section is titled
                        with the next version implied by the pending fragments
                        instead of "Unreleased".

Options:
  -d, --dir <path>      Directory containing changelog fragments (default: changelog.d)
  -o, --output <path>   File to prepend the section to, or "-" for stdout (default: CHANGELOG.md)
  -t, --title <title>   Heading for the generated section when no version is given (default: Unreleased)
  -c, --config <path>   Config file defining section order and bump levels (default: ${DEFAULT_CONFIG_FILE})
      --current <ver>   Previous version (alternative to the positional argument)
      --dry-run         Print the generated section without writing or clearing
      --no-clear        Keep the fragment files after generating
  -h, --help            Show this help
  -v, --version         Show the version

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

  Sections found in fragments that are not listed cause an error. When a version is
  given, the highest bump level among the pending sections is applied to it to title
  the generated section.
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
        title: { type: "string", short: "t" },
        config: { type: "string", short: "c" },
        current: { type: "string" },
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

  if (positionals.length > 1) {
    fail(`unexpected argument: ${positionals[1]}`);
  }

  const current = positionals[0] ?? values.current;
  if (current !== undefined && values.title !== undefined) {
    fail("cannot combine --title with a version");
  }

  const config = await loadConfig(values.config);

  const result = await generate({
    dir: values.dir ?? "changelog.d",
    output: values.output ?? "CHANGELOG.md",
    title: values.title,
    current,
    clear: !values["no-clear"],
    dryRun: values["dry-run"] ?? false,
    order: config ? sectionOrder(config) : undefined,
    bump: config ? sectionBumps(config) : undefined,
  });

  if (result.fragments.length === 0) {
    process.stdout.write("No changelog fragments found.\n");
    return;
  }

  if (current !== undefined) {
    if (result.level) {
      process.stderr.write(`changelog-d: applying ${result.level} bump\n`);
    } else {
      process.stderr.write("changelog-d: no bump-level sections found; version unchanged\n");
    }
  }

  if (values["dry-run"] || values.output === "-") {
    process.stdout.write(result.entry);
    return;
  }

  process.stdout.write(
    `Generated ${values.output ?? "CHANGELOG.md"} from ${result.fragments.length} fragment(s)` +
      (result.cleared.length > 0 ? ` and cleared ${result.cleared.length} file(s).\n` : ".\n"),
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
