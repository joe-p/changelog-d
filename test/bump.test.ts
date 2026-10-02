import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBump, highestBump, isBumpLevel, parseVersion } from "../src/bump.ts";

test("parseVersion accepts plain, v-prefixed and prerelease versions", () => {
  assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion("v1.2.3"), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion("1.2.3-beta.1"), {
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: "beta.1",
  });
});

test("parseVersion rejects invalid versions", () => {
  assert.throws(() => parseVersion("1.2"), /Invalid semantic version/);
  assert.throws(() => parseVersion("not-a-version"), /Invalid semantic version/);
});

test("applyBump bumps and resets the right components", () => {
  assert.equal(applyBump("1.2.3", "PATCH"), "1.2.4");
  assert.equal(applyBump("1.2.3", "MINOR"), "1.3.0");
  assert.equal(applyBump("1.2.3", "MAJOR"), "2.0.0");
  assert.equal(applyBump("1.2.3-beta.1", "PATCH"), "1.2.4");
});

test("isBumpLevel only accepts known levels", () => {
  assert.equal(isBumpLevel("MAJOR"), true);
  assert.equal(isBumpLevel("major"), false);
  assert.equal(isBumpLevel("HUGE"), false);
});

test("highestBump picks the most significant level", () => {
  assert.equal(highestBump(["PATCH", "MINOR", "PATCH"]), "MINOR");
  assert.equal(highestBump(["PATCH", "MAJOR", "MINOR"]), "MAJOR");
  assert.equal(highestBump([]), undefined);
});
