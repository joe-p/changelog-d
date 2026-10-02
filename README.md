# changelog-d

Merge `changelog.d` fragments into a changelog, with automatic semantic
versioning.

Drop small markdown files into a `changelog.d` directory as you work, then run
`changelog-d generate` to merge them into a single unreleased section that is
prepended to `CHANGELOG.md`. Fragments are cleared afterwards so the next release
starts clean. Run `changelog-d release` when you are ready to cut the release.

Versions are read from the changelog itself: there is no version to pass by hand.
The next version is the highest bump level among the pending sections applied to
the last released version. Until it is released, a section is titled
`X.Y.Z - UNRELEASED`.

A changelog title and introduction before the first version heading are preserved.
Fragments must start with a `##` section heading and contain at least one entry;
invalid fragments are reported by filename before the changelog is written or
any fragments are cleared.

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
changelog-d generate [options]
changelog-d release [options]
```

`generate` is the default command, so `changelog-d` on its own is equivalent to
`changelog-d generate`.

### Generate an unreleased section

Given a changelog whose latest release is `1.0.0`:

```md
# 1.0.0

## Features

- Released 1.0!
```

and a fragment `changelog.d/fix.md`:

```md
## Fixes

- Some fix
```

running:

```sh
changelog-d generate
```

prepends a new unreleased section and clears the fragment:

```md
# 1.0.1 - UNRELEASED

## Fixes

- Some fix

# 1.0.0

## Features

- Released 1.0!
```

Add another fragment `changelog.d/feat.md`:

```md
## Features

- A new feature!
```

and run `changelog-d generate` again. The existing unreleased section is merged
with the new fragment and the version is recomputed from the last released
version (`1.0.0`), so the minor bump wins:

```md
# 1.1.0 - UNRELEASED

## Fixes

- Some fix

## Features

- A new feature!

# 1.0.0

## Features

- Released 1.0!
```

### Release

When you are ready to ship, remove the ` - UNRELEASED` suffix:

```sh
changelog-d release
```

```md
# 1.1.0

## Fixes

- Some fix

## Features

- A new feature!

# 1.0.0

## Features

- Released 1.0!
```

`release` fails if the top section is not unreleased, or if `changelog.d` still
contains pending fragments (run `generate` first).

### Pre-releases

Use `release --alpha` (or `--beta`, `--rc`, `--pre <id>`) to tag the top
unreleased section as a prerelease instead of finalizing it:

```sh
changelog-d release --alpha
```

```md
# 1.0.1-alpha.1

## Fixes

- Fixed a bug

# 1.0.0

## Features

- Released 1.0!
```

The number increments for the same version and channel (`1.0.1-alpha.1` becomes
`1.0.1-alpha.2`), and a different channel restarts at `.1`. New fragments still
generate a plain `1.0.1 - UNRELEASED` on top of the prerelease:

```md
# 1.0.1 - UNRELEASED

## Fixes

- Some new fix

# 1.0.1-alpha.1

## Fixes

- Fixed a bug

# 1.0.0

## Features

- Released 1.0!
```

A plain `release` finalizes the version by merging the unreleased section and all
same-version prerelease sections into `1.0.1` and removing the prerelease blocks:

```md
# 1.0.1

## Fixes

- Some new fix
- Fixed a bug

# 1.0.0

## Features

- Released 1.0!
```

If there is no unreleased section, a plain `release` promotes the top prerelease
to a final release.

### The initial release

When there is no released version yet, the first `generate` creates
`# 1.0.0 - UNRELEASED`. While `1.0.0` is still unreleased, the version stays
`1.0.0` regardless of the bump levels of the pending sections, so your first
release is always `1.0.0`. Once `release` has been run, later changes bump
normally from `1.0.0`.

### Preview without writing

```sh
changelog-d generate --dry-run
changelog-d release --dry-run
```

`--dry-run` prints what would happen without writing to the changelog or clearing
fragments. Use `--no-clear` to write the changelog but keep the fragments, or
`-o -` to write the generated section to stdout. Stdout generation reads the
version and existing unreleased content from `CHANGELOG.md`; use `--input <path>`
to read a different changelog. Stdout generation never clears fragments.

### Options

| Option                | Description                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `-d, --dir <path>`    | Directory containing fragments (default: `changelog.d`)                                          |
| `-o, --output <path>` | Changelog file, or `-` for stdout (default: `CHANGELOG.md`)                                      |
| `--input <path>`      | `generate` only: existing changelog to read (default: output path, or `CHANGELOG.md` for stdout) |
| `-c, --config <path>` | Config file (default: `changelog-d.json`)                                                        |
| `--alpha`             | `release` only: tag as a prerelease, e.g. `1.0.1-alpha.1`                                        |
| `--beta`              | `release` only: tag as a beta prerelease, e.g. `1.0.1-beta.1`                                    |
| `--rc`                | `release` only: tag as a release candidate, e.g. `1.0.1-rc.1`                                    |
| `--pre <id>`          | `release` only: tag with a custom prerelease id                                                  |
| `--dry-run`           | Print the result without writing or clearing                                                     |
| `--no-clear`          | Keep fragment files after generating                                                             |
| `-h, --help`          | Show help                                                                                        |
| `-v, --version`       | Show the package version                                                                         |

## Configuration

By default `changelog-d` looks for `changelog-d.json`. It lists the allowed
sections in the order they should appear, along with the semantic version bump
each section implies:

```json
{
  "sections": [
    { "title": "Breaking Changes", "bump": "MAJOR" },
    { "title": "Fixes", "bump": "PATCH" },
    { "title": "Features", "bump": "MINOR" },
    { "title": "Upgrade Guide", "type": "raw" }
  ]
}
```

- `title` is required and must be unique.
- `bump` is optional and must be `MAJOR`, `MINOR`, or `PATCH` (case-insensitive).
- `type` is optional and must be `list` (the default) or `raw` (case-insensitive).
- A fragment section that is not listed causes an error.

The highest bump level among the pending sections is applied to the last released
version. For example, `Breaking Changes` and `Features` fragments on top of
`1.2.3` produce `2.0.0`.

### Section types

A `list` section (the default) holds markdown list items. Multiline items retain
their continuation lines, nested lists, code blocks, and internal blank lines.
Identical complete items across fragments are collapsed, so `- Fix a bug` only
ever appears once; repeated lines within different items are preserved.

A `raw` section preserves the fragment markdown verbatim, including blank lines,
indentation, code blocks and nested headings. This is useful for prose or a
migration guide. When several fragments contribute to the same raw section their
bodies are concatenated with a blank line between them; an identical body is
never added twice.

Outside fenced code blocks, a raw section may not contain a level-1 (`#`) or
level-2 (`##`) heading, because those delimit versions and sections. Use `###`
or deeper for nested headings:

````md
## Upgrade Guide

Run the migration before starting the server:

```sh
migrate up
```

### From 1.x

Replace `oldThing()` with `newThing()`.
````

## Programmatic API

```ts
import { generate, release, parseChangelog } from "changelog-d";

await generate({
  dir: "changelog.d",
  output: "CHANGELOG.md",
  clear: true,
  dryRun: false,
  order: ["Breaking Changes", "Fixes", "Features", "Upgrade Guide"],
  bump: { "Breaking Changes": "MAJOR", Fixes: "PATCH", Features: "MINOR" },
  types: { "Upgrade Guide": "raw" },
});

await release({ output: "CHANGELOG.md", dir: "changelog.d", dryRun: false });
await release({ output: "CHANGELOG.md", dir: "changelog.d", dryRun: false, prerelease: "alpha" });

const blocks = parseChangelog("# 1.0.0\n\n## Features\n\n- hello\n", { Features: "list" });
```

## License

ISC
