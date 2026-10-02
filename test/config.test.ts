import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseConfig, loadConfig } from "../src/config.ts";

test("parseConfig reads a section order", () => {
  assert.deepEqual(parseConfig('{"sections":["Fixes","Features"]}', "test"), {
    sections: ["Fixes", "Features"],
  });
});

test("parseConfig rejects invalid JSON", () => {
  assert.throws(() => parseConfig("{oops", "test"), /test: invalid JSON/);
});

test("parseConfig rejects a missing or empty sections array", () => {
  assert.throws(() => parseConfig("{}", "test"), /"sections" must be a non-empty array/);
  assert.throws(() => parseConfig('{"sections":[]}', "test"), /"sections" must be a non-empty array/);
});

test("parseConfig rejects non-string entries", () => {
  assert.throws(() => parseConfig('{"sections":["Fixes",3]}', "test"), /must be a non-empty string/);
});

test("parseConfig rejects duplicate sections", () => {
  assert.throws(
    () => parseConfig('{"sections":["Fixes","Fixes"]}', "test"),
    /duplicate section\(s\): Fixes/,
  );
});

test("loadConfig reports an explicitly missing config file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "changelog-d-config-"));
  await assert.rejects(loadConfig(path.join(dir, "missing.json")), /Config file not found/);
});

test("loadConfig reads a config file from disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "changelog-d-config-"));
  const file = path.join(dir, "changelog-d.json");
  await writeFile(file, '{"sections":["Fixes"]}');
  assert.deepEqual(await loadConfig(file), { sections: ["Fixes"] });
});
