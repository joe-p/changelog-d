import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generate, release } from "../src/changelog.ts";

const ORDER = ["Breaking Changes", "Fixes", "Features"];
const BUMP = { "Breaking Changes": "MAJOR", Fixes: "PATCH", Features: "MINOR" } as const;

async function makeRoot(): Promise<{ root: string; dir: string; output: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "changelog-d-"));
  const dir = path.join(root, "changelog.d");
  const output = path.join(root, "CHANGELOG.md");
  await mkdir(dir);
  return { root, dir, output };
}

test("generate reads the version from the changelog and marks it unreleased", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(output, "# 1.0.0\n\n## Features\n\n- Released 1.0!\n");
  await writeFile(path.join(dir, "fix.md"), "## Fixes\n\n- Some fix\n");

  const first = await generate({ dir, output, clear: true, dryRun: false, order: ORDER, bump: BUMP });
  assert.equal(first.version, "1.0.1");
  assert.equal(first.previous, "1.0.0");
  assert.equal(first.level, "PATCH");
  assert.equal(
    await readFile(output, "utf8"),
    "# 1.0.1 - UNRELEASED\n\n## Fixes\n\n- Some fix\n\n# 1.0.0\n\n## Features\n\n- Released 1.0!\n",
  );
  assert.deepEqual(await readdir(dir), []);

  await writeFile(path.join(dir, "feat.md"), "## Features\n\n- A new feature!\n");

  const second = await generate({ dir, output, clear: true, dryRun: false, order: ORDER, bump: BUMP });
  assert.equal(second.version, "1.1.0");
  assert.equal(second.level, "MINOR");
  assert.equal(
    await readFile(output, "utf8"),
    "# 1.1.0 - UNRELEASED\n\n## Fixes\n\n- Some fix\n\n## Features\n\n- A new feature!\n\n# 1.0.0\n\n## Features\n\n- Released 1.0!\n",
  );
});

test("generate keeps 1.0.0 while the initial release is unreleased", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(path.join(dir, "fix.md"), "## Fixes\n\n- Some fix\n");

  const first = await generate({ dir, output, clear: true, dryRun: false, order: ORDER, bump: BUMP });
  assert.equal(first.version, "1.0.0");
  assert.equal(first.previous, undefined);
  assert.equal(
    await readFile(output, "utf8"),
    "# 1.0.0 - UNRELEASED\n\n## Fixes\n\n- Some fix\n",
  );

  await writeFile(path.join(dir, "feat.md"), "## Features\n\n- A new feature!\n");
  const second = await generate({ dir, output, clear: true, dryRun: false, order: ORDER, bump: BUMP });
  assert.equal(second.version, "1.0.0");
  assert.equal(
    await readFile(output, "utf8"),
    "# 1.0.0 - UNRELEASED\n\n## Fixes\n\n- Some fix\n\n## Features\n\n- A new feature!\n",
  );
});

test("generate is idempotent when fragments are kept", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(path.join(dir, "fix.md"), "## Fixes\n\n- Some fix\n");

  await generate({ dir, output, clear: false, dryRun: false, order: ORDER, bump: BUMP });
  await generate({ dir, output, clear: false, dryRun: false, order: ORDER, bump: BUMP });

  const text = await readFile(output, "utf8");
  assert.equal((text.match(/- Some fix/g) ?? []).length, 1);
});

test("generate does nothing without fragments or an unreleased section", async () => {
  const { dir, output } = await makeRoot();

  const result = await generate({ dir, output, clear: true, dryRun: false, order: ORDER, bump: BUMP });

  assert.equal(result.written, false);
  assert.equal(result.fragments.length, 0);
  assert.equal(existsSync(output), false);
});

test("generate keeps the last released version when no section bumps", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(output, "# 1.2.3\n\n## Features\n\n- old\n");
  await writeFile(path.join(dir, "docs.md"), "## Docs\n\n- docs\n");

  const result = await generate({ dir, output, clear: true, dryRun: false, order: ["Docs"], bump: {} });

  assert.equal(result.version, "1.2.3");
  assert.equal(result.level, undefined);
});

test("release removes the unreleased marker", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(
    output,
    "# 1.1.0 - UNRELEASED\n\n## Features\n\n- A new feature!\n\n# 1.0.0\n\n## Features\n\n- Released 1.0!\n",
  );

  const result = await release({ output, dir, dryRun: false });

  assert.deepEqual(result, { version: "1.1.0", written: true });
  assert.equal(
    await readFile(output, "utf8"),
    "# 1.1.0\n\n## Features\n\n- A new feature!\n\n# 1.0.0\n\n## Features\n\n- Released 1.0!\n",
  );
});

test("release fails without an unreleased section", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(output, "# 1.0.0\n\n## Features\n\n- Released 1.0!\n");

  await assert.rejects(release({ output, dir, dryRun: false }), /No UNRELEASED section/);
});

test("release fails while fragments are pending", async () => {
  const { dir, output } = await makeRoot();
  await writeFile(output, "# 1.1.0 - UNRELEASED\n\n## Features\n\n- A new feature!\n");
  await writeFile(path.join(dir, "fix.md"), "## Fixes\n\n- Some fix\n");

  await assert.rejects(release({ output, dir, dryRun: false }), /pending fragment/);
});

test("release dry run does not write", async () => {
  const { dir, output } = await makeRoot();
  const before = "# 1.1.0 - UNRELEASED\n\n## Features\n\n- A new feature!\n";
  await writeFile(output, before);

  const result = await release({ output, dir, dryRun: true });

  assert.equal(result.written, false);
  assert.equal(await readFile(output, "utf8"), before);
});
