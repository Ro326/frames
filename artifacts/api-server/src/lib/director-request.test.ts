import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  matchesDirectorRequest, sharedDirectorRequest,
  type DirectorRequest, type DirectorRequestScope, type DirectorRequestStore,
} from "./director-request";

const scope: DirectorRequestScope = {
  userId: 1, projectId: 2, fingerprint: "full-input-hash",
  revision: "2026-10-24T12:00:00.000Z", inputSummary: "Project 2",
};
// Atomic claim emulates the production transaction's project row lock. Separate
// callers share only this durable store, not promises or process-local state.
function storeFixture() {
  const records: Array<{ userId: number; request: DirectorRequest }> = [];
  const store: DirectorRequestStore = {
    async claim(current) {
      const existing = records.find((record) => record.userId === current.userId &&
        matchesDirectorRequest(record.request.data, current));
      if (existing) return { request: structuredClone(existing.request), owner: false };
      const request: DirectorRequest = { id: records.length + 1, data: {
        state: "running", project_id: current.projectId,
        input_fingerprint: current.fingerprint, revision: current.revision,
      } };
      records.push({ userId: current.userId, request: structuredClone(request) });
      return { request, owner: true };
    },
    async read(id, userId) {
      const record = records.find((item) => item.request.id === id && item.userId === userId);
      assert.ok(record, "owner-scoped reservation must exist");
      return structuredClone(record.request);
    },
    async write(request) {
      records.find((item) => item.request.id === request.id)!.request = structuredClone(request);
    },
  };
  return { store, records };
}

test("concurrent clients share one paid execution and return the saved result", async () => {
  const { store } = storeFixture();
  let calls = 0;
  const options = {
    scope, store, pollMs: 1,
    execute: async (request: DirectorRequest) => {
      calls++;
      await delay(15);
      request.data = { ...request.data, state: "succeeded", saved_revision: "saved-revision" };
      await store.write(request);
      return { plan: "shared draft" };
    },
    result: async () => ({ plan: "shared draft" }),
  };
  const results = await Promise.all(Array.from({ length: 12 }, () => sharedDirectorRequest(options)));
  assert.equal(calls, 1);
  assert.deepEqual(results, Array.from({ length: 12 }, () => ({ plan: "shared draft" })));
  // A later client observing the saved project also reuses the same generation.
  await sharedDirectorRequest({ ...options, scope: { ...scope, revision: "saved-revision" } });
  assert.equal(calls, 1);
});

test("timeout uncertainty survives new clients, arbitrary age and project revisions", async () => {
  const { store } = storeFixture();
  let calls = 0;
  const options = {
    scope, store, waitMs: 0,
    execute: async (request: DirectorRequest): Promise<string> => {
      calls++;
      request.data.state = "uncertain";
      await store.write(request);
      throw new Error("Provider timed out after dispatch");
    },
    result: async () => "never",
  };
  await assert.rejects(sharedDirectorRequest(options), /timed out/);
  for (const revision of [scope.revision, "2030-01-01T00:00:00.000Z"]) {
    await assert.rejects(sharedDirectorRequest({ ...options, scope: { ...scope, revision } }),
      (error: unknown) => (error as { status: number }).status === 409);
  }
  assert.equal(calls, 1);
});

test("abandoned running reservation is not stolen when a follower's wait expires", async () => {
  const { store } = storeFixture();
  await store.claim(scope);
  await assert.rejects(sharedDirectorRequest({
    scope, store, waitMs: 0,
    execute: async () => assert.fail("must not dispatch"),
    result: async () => assert.fail("not saved"),
  }), /No new run was started/);
});

test("different projects, owners and full input fingerprints do not share a run", async () => {
  const { store } = storeFixture();
  for (const current of [
    scope, { ...scope, userId: 3 }, { ...scope, projectId: 4 },
    { ...scope, fingerprint: "different-full-input-with-same-summary" },
  ]) assert.equal((await store.claim(current)).owner, true);
});

test("finished results are reused only for their source or saved revision", () => {
  const data: DirectorRequest["data"] = {
    state: "succeeded", project_id: scope.projectId,
    input_fingerprint: scope.fingerprint, revision: scope.revision, saved_revision: "saved",
  };
  assert.equal(matchesDirectorRequest(data, scope), true);
  assert.equal(matchesDirectorRequest(data, { ...scope, revision: "saved" }), true);
  assert.equal(matchesDirectorRequest(data, { ...scope, revision: "edited" }), false);
  assert.equal(matchesDirectorRequest({ ...data, state: "failed" }, scope), false);
});

test("a follower receives the owner's failure without making a provider call", async () => {
  const { store, records } = storeFixture();
  const { request } = await store.claim(scope);
  const pending = sharedDirectorRequest({
    scope, store, pollMs: 1,
    execute: async () => assert.fail("follower must not execute"),
    result: async () => assert.fail("no result"),
  });
  request.data = { ...request.data, state: "failed", failure: { status: 503, message: "Budget limit" } };
  await store.write(request);
  await assert.rejects(pending, (error: unknown) =>
    (error as { status: number }).status === 503 && (error as Error).message === "Budget limit");
  assert.equal(records.length, 1);
});

test("failure to reserve prevents dispatch; failure reading a shared result never dispatches", async () => {
  const { store } = storeFixture();
  await assert.rejects(sharedDirectorRequest({
    scope, store: { ...store, claim: async () => { throw new Error("Database unavailable"); } },
    execute: async () => assert.fail("unreserved call"),
    result: async () => "unused",
  }), /Database unavailable/);
  const { request } = await store.claim(scope);
  request.data.state = "succeeded";
  await store.write(request);
  await assert.rejects(sharedDirectorRequest({
    scope, store,
    execute: async () => assert.fail("must not execute"),
    result: async () => { throw Object.assign(new Error("Plan changed"), { status: 409 }); },
  }), /Plan changed/);
});

for (const state of ["running", "uncertain"] as const) {
  test(`already-returned output recovers from a ${state} reservation without dispatch`, async () => {
    const { store } = storeFixture();
    const { request } = await store.claim(scope);
    request.data = { ...request.data, state, result_response: { status: "hitl_triggered", output: "validated draft" } };
    await store.write(request);
    const output = await sharedDirectorRequest({
      scope, store, waitMs: 0,
      execute: async () => assert.fail("recovery must never dispatch"),
      result: async (saved) => {
        assert.deepEqual(saved.data.result_response, request.data.result_response);
        return "recovered draft";
      },
    });
    assert.equal(output, "recovered draft");
  });
}
