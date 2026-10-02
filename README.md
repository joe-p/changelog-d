# changelog-d

Merge `changelog.d` fragments into a changelog section.

Drop small markdown files into a `changelog.d` directory as you work, then run
`changelog-d` to merge them into a single, ordered section that is prepended to
your changelog. Fragments are cleared afterwards so the next release starts clean.

## Install

```sh
pnpm add -D changelog-d
```

## Usage

Create a fragment for each change. A fragment is a markdown file with one or more
section headings:

```md
## Fixes

- Fix a crash when the config file is missing
```

```sh
changelog-d [version] [options]
```

### Generate an Unreleased section

```sh
changelog-d
```

Reads every `*.md` file in `changelog.d`, merges the sections, and prepends the
result to `CHANGELOG.md`:

```md
# Unreleased

## Fixes

- Fix a crash when the config file is missing

## Features

- Add a `--config` flag
```

### Generate a released section

Pass the previous released version as a positional argument (or with
`--current`). The section is then titled with the next version implied by the
pending fragments instead of `Unreleased`:

```sh
changelog-d 1.2.3
```

```md
# 1.3.0

## Fixes

- Fix a crash when the config file is missing
```

The next version is computed from the highest bump level among the pending
sections (see [Configuration](#configuration)). If no pending section has a bump
level, the current version is used unchanged.

### Preview without writing

```sh
changelog-d 1.2.3 --dry-run
```

Prints the generated section to stdout without writing to the changelog or
clearing fragments. Use `--no-clear` to write the changelog but keep the
fragments, or `-o -` to write the section to stdout.

### Options

| Option | Description |
| --- | --- |
| `-d, --dir <path>` | Directory containing fragments (default: `changelog.d`) |
| `-o, --output <path>` | File to prepend to, or `-` for stdout (default: `CHANGELOG.md`) |
| `-t, --title <title>` | Heading when no version is given (default: `Unreleased`) |
| `-c, --config <path>` | Config file (default: `changelog-d.json`) |
| `--current <ver>` | Previous version, as an alternative to the positional argument |
| `--dry-run` | Print the section without writing or clearing |
| `--no-clear` | Keep fragment files after generating |
| `-h, --help` | Show help |
| `-v, --version` | Show the package version |

`--title` and a version are mutually exclusive.

## Configuration

By default `changelog-d` looks for `changelog-d.json`. It lists the allowed
sections in the order they should appear, along with the semantic version bump
each section implies:

```json
{
  "sections": [
    { "title": "Breaking Changes", "bump": "MAJOR" },
    { "title": "Fixes", "bump": "PATCH" },
    { "title": "Features", "bump": "MINOR" }
  ]
}
```

- `title` is required and must be unique.
- `bump` is optional and must be `MAJOR`, `MINOR`, or `PATCH` (case-insensitive).
- A fragment section that is not listed causes an error.

When a version is passed, the highest bump level among the pending sections is
applied to it. For example, `Breaking Changes` and `Features` fragments passed
with `1.2.3` produce `2.0.0`.

## Programmatic API

```ts
import { generate } from "changelog-d";

await generate({
  dir: "changelog.d",
  output: "CHANGELOG.md",
  current: "1.2.3",
  clear: true,
  dryRun: false,
  order: ["Breaking Changes", "Fixes", "Features"],
  bump: { "Breaking Changes": "MAJOR", Fixes: "PATCH", Features: "MINOR" },
});
```

## License

ISC
