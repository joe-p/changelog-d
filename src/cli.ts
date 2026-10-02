#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { generate } from "./changelog.ts";
import { DEFAULT_CONFIG_FILE, loadConfig } from "./config.ts";

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `changelog-d - merge changelog.d fragments into an Unreleased section

Usage:
  changelog-d [options]

Options:
  -d, --dir <path>      Directory containing changelog fragments (default: changelog.d)
  -o, --output <path>   File to prepend the section to, or "-" for stdout (default: CHANGELOG.md)
  -t, --title <title>   Heading for the generated section (default: Unreleased)
  -c, --config <path>   Config file defining section order (default: ${DEFAULT_CONFIG_FILE})
      --dry-run         Print the generated section without writing or clearing
      --no-clear        Keep the fragment files after generating
  -h, --help            Show this help
  -v, --version         Show the version

Config file:
  A JSON object with a "sections" array listing the allowed section titles in
  the order they should appear, e.g. { "sections": ["Fixes", "Features"] }.
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
        title: { type: "string", short: "t" },
        config: { type: "string", short: "c" },
        "dry-run": { type: "boolean" },
        "no-clear": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: false,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const { values } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  const config = await loadConfig(values.config);

  const result = await generate({
    dir: values.dir ?? "changelog.d",
    output: values.output ?? "CHANGELOG.md",
    title: values.title ?? "Unreleased",
    clear: !values["no-clear"],
    dryRun: values["dry-run"] ?? false,
    order: config?.sections,
  });

  if (result.fragments.length === 0) {
    process.stdout.write("No changelog fragments found.\n");
    return;
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
