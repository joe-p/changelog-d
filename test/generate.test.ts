import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFragment, mergeFragments, renderChangelog, prependChangelog } from "../src/generate.ts";

test("parseFragment splits sections", () => {
  const sections = parseFragment("## Fixes\n\n- a\n- b\n\n## Features\n\n- c\n");
  assert.deepEqual(sections, [
    { title: "Fixes", lines: ["- a", "- b"] },
    { title: "Features", lines: ["- c"] },
  ]);
});

test("parseFragment ignores content before the first heading", () => {
  assert.deepEqual(parseFragment("intro\n\n## Fixes\n\n- a\n"), [{ title: "Fixes", lines: ["- a"] }]);
});

test("mergeFragments groups sections by title in first-seen order", () => {
  const merged = mergeFragments([
    { name: "fix-01.md", content: "## Fixes\n\n- fix #01\n" },
    { name: "fix-02.md", content: "## Fixes\n\n- fix #02\n" },
    { name: "feat-01.md", content: "## Features\n\n- Added a new feature!\n" },
  ]);

  assert.deepEqual(merged, [
    { title: "Features", lines: ["- Added a new feature!"] },
    { title: "Fixes", lines: ["- fix #01", "- fix #02"] },
  ]);
});

test("mergeFragments drops sections with no entries", () => {
  const merged = mergeFragments([
    { name: "a.md", content: "## Fixes\n\n- fix #01\n\n## Features\n" },
  ]);
  assert.deepEqual(merged, [{ title: "Fixes", lines: ["- fix #01"] }]);
});

test("mergeFragments follows the configured section order", () => {
  const fragments = [
    { name: "fix-01.md", content: "## Fixes\n\n- fix #01\n" },
    { name: "feat-01.md", content: "## Features\n\n- Added a new feature!\n" },
  ];

  assert.deepEqual(mergeFragments(fragments, ["Fixes", "Features"]), [
    { title: "Fixes", lines: ["- fix #01"] },
    { title: "Features", lines: ["- Added a new feature!"] },
  ]);
  assert.deepEqual(mergeFragments(fragments, ["Features", "Fixes"]), [
    { title: "Features", lines: ["- Added a new feature!"] },
    { title: "Fixes", lines: ["- fix #01"] },
  ]);
});

test("mergeFragments throws on a section missing from the configured order", () => {
  assert.throws(
    () => mergeFragments([{ name: "a.md", content: "## Chores\n\n- chore\n" }], ["Fixes", "Features"]),
    /Unknown changelog section "## Chores"/,
  );
});

test("renderChangelog produces the expected markdown", () => {
  const output = renderChangelog(
    [
      { title: "Fixes", lines: ["- fix #01", "- fix #02"] },
      { title: "Features", lines: ["- Added a new feature!"] },
    ],
    "Unreleased",
  );

  assert.equal(
    output,
    "# Unreleased\n\n## Fixes\n\n- fix #01\n- fix #02\n\n## Features\n\n- Added a new feature!\n",
  );
});

test("prependChangelog keeps existing content after the new entry", () => {
  const existing = "# Changelog\n\n## 1.0.0\n\n- old\n";
  const result = prependChangelog(existing, "# Unreleased\n\n## Fixes\n\n- new\n");
  assert.equal(
    result,
    "# Unreleased\n\n## Fixes\n\n- new\n\n# Changelog\n\n## 1.0.0\n\n- old\n",
  );
});
