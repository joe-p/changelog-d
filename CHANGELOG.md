# 0.5.0 - October 3rd, 2026

## Features

- Stamp the release date next to the version when running `release`, e.g. `1.1.0 - January 1st, 2026`.

# 0.4.0

## Breaking Changes

- Rename the package and CLI from `changelog-d` to `semfrag`. The default config file is now `semfrag.json` and the `changelog-d` binary is now `semfrag`.

# 0.3.0

## Features

- Add `semfrag notes` to print the changelog body of the latest release, and use it to generate GitHub release notes.

# 0.2.0

## Features

- Add `semfrag latest` to print the most recent released version from the changelog.
- Add a GitHub Actions workflow that releases and tags on every merge to `main`.

# 0.1.0

## Features

- Add `semfrag init` to create an empty changelog with a `1.0.0` or `0.1.0` unreleased heading, a default `semfrag.json`, and the fragments directory.
- Support `0.y.z` versions: the initial version stays fixed until the first release, and a `0.y.z` config makes `Breaking Changes` bump `MINOR`.
