import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generate } from "../src/changelog.ts";

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
