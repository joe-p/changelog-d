import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bumpVersion, generate } from "../src/changelog.ts";

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "changelog-d-"));
  const dir = path.join(root, "changelog.d");
  await mkdir(dir);
  await writeFile(path.join(dir, "fix-01.md"), "## Fixes\n\n- fix #01\n");
  await writeFile(path.join(dir, "fix-02.md"), "## Fixes\n\n- fix #02\n");
  await writeFile(path.join(dir, "feat-01.md"), "## Features\n\n- Added a new feature!\n");
  return root;
}

test("generate writes the merged entry and clears fragments", async () => {
  const root = await makeFixture();
  const dir = path.join(root, "changelog.d");
  const output = path.join(root, "CHANGELOG.md");

  const result = await generate({ dir, output, title: "Unreleased", clear: true, dryRun: false });

  assert.equal(
    await readFile(output, "utf8"),
    "# Unreleased\n\n## Features\n\n- Added a new feature!\n\n## Fixes\n\n- fix #01\n- fix #02\n",
  );
  assert.deepEqual(await readdir(dir), []);
  assert.equal(result.cleared.length, 3);
  assert.equal(result.written, true);
});

test("generate prepends to an existing changelog", async () => {
  const root = await makeFixture();
  const output = path.join(root, "CHANGELOG.md");
  await writeFile(output, "# Changelog\n\n## 1.0.0\n\n- old\n");

  await generate({
    dir: path.join(root, "changelog.d"),
    output,
    title: "Unreleased",
    clear: false,
    dryRun: false,
  });

  assert.equal(
    await readFile(output, "utf8"),
    "# Unreleased\n\n## Features\n\n- Added a new feature!\n\n## Fixes\n\n- fix #01\n- fix #02\n\n# Changelog\n\n## 1.0.0\n\n- old\n",
  );
});

test("generate titles the section with the next version when a current version is given", async () => {
  const root = await makeFixture();
  const output = path.join(root, "CHANGELOG.md");

  const result = await generate({
    dir: path.join(root, "changelog.d"),
    output,
    current: "1.2.3",
    clear: false,
    dryRun: false,
    order: ["Fixes", "Features"],
    bump: { Fixes: "PATCH", Features: "MINOR" },
  });

  assert.equal(result.title, "1.3.0");
  assert.equal(result.level, "MINOR");
  assert.equal(
    await readFile(output, "utf8"),
    "# 1.3.0\n\n## Fixes\n\n- fix #01\n- fix #02\n\n## Features\n\n- Added a new feature!\n",
  );
});

test("generate keeps the current version when no section is bumpable", async () => {
  const root = await makeFixture();
  const output = path.join(root, "CHANGELOG.md");

  const result = await generate({
    dir: path.join(root, "changelog.d"),
    output,
    current: "1.2.3",
    clear: false,
    dryRun: true,
    order: ["Fixes", "Features"],
    bump: {},
  });

  assert.equal(result.title, "1.2.3");
  assert.equal(result.level, undefined);
});

test("dry run neither writes nor clears", async () => {
  const root = await makeFixture();
  const output = path.join(root, "CHANGELOG.md");

  const result = await generate({
    dir: path.join(root, "changelog.d"),
    output,
    title: "Unreleased",
    clear: true,
    dryRun: true,
  });

  assert.equal(existsSync(output), false);
  assert.equal(result.written, false);
  assert.equal((await readdir(path.join(root, "changelog.d"))).length, 3);
});

test("generate applies the configured order and rejects unknown sections", async () => {
  const root = await makeFixture();
  const dir = path.join(root, "changelog.d");
  const output = path.join(root, "CHANGELOG.md");

  await generate({
    dir,
    output,
    title: "Unreleased",
    clear: false,
    dryRun: false,
    order: ["Fixes", "Features"],
  });
  assert.equal(
    await readFile(output, "utf8"),
    "# Unreleased\n\n## Fixes\n\n- fix #01\n- fix #02\n\n## Features\n\n- Added a new feature!\n",
  );

  await writeFile(path.join(dir, "chore-01.md"), "## Chores\n\n- chore\n");
  await assert.rejects(
    generate({ dir, output, title: "Unreleased", clear: true, dryRun: false, order: ["Fixes"] }),
    /Unknown changelog section "## Chores"/,
  );
  assert.equal(existsSync(path.join(dir, "chore-01.md")), true);
});

test("bumpVersion applies the highest pending bump level", async () => {
  const root = await makeFixture();
  const dir = path.join(root, "changelog.d");

  const minor = await bumpVersion({
    dir,
    current: "1.2.3",
    order: ["Fixes", "Features"],
    bump: { Fixes: "PATCH", Features: "MINOR" },
  });
  assert.deepEqual(minor, { current: "1.2.3", next: "1.3.0", level: "MINOR" });

  await writeFile(path.join(dir, "break-01.md"), "## Breaking Changes\n\n- removed API\n");
  const major = await bumpVersion({
    dir,
    current: "1.2.3",
    order: ["Breaking Changes", "Fixes", "Features"],
    bump: { "Breaking Changes": "MAJOR", Fixes: "PATCH", Features: "MINOR" },
  });
  assert.deepEqual(major, { current: "1.2.3", next: "2.0.0", level: "MAJOR" });
});

test("bumpVersion leaves the version unchanged without bumpable sections", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "changelog-d-"));
  const dir = path.join(root, "changelog.d");
  await mkdir(dir);

  const result = await bumpVersion({ dir, current: "1.2.3", order: ["Fixes"], bump: {} });
  assert.deepEqual(result, { current: "1.2.3", next: "1.2.3", level: undefined });
});
