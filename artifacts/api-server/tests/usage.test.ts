import test from "node:test";
import assert from "node:assert/strict";
import { canCreateProject, FREE_PROJECT_LIMIT } from "../src/lib/usage";

test("each of the first five projects is free", () => {
  assert.equal(FREE_PROJECT_LIMIT, 5);
  for (let used = 0; used < 5; used++) {
    assert.equal(canCreateProject(false, used), true);
  }
});

test("the sixth and subsequent projects require Pro", () => {
  for (const used of [5, 6, 50]) {
    assert.equal(canCreateProject(false, used), false);
  }
});

test("Pro accounts can keep creating projects after their free tries", () => {
  for (const used of [0, 4, 5, 6, 100]) {
    assert.equal(canCreateProject(true, used), true);
  }
});
