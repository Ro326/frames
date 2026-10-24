import test from "node:test";
import assert from "node:assert/strict";
import {
  CreateProjectBody,
  GetActivityResponse,
  SaveProfileBody,
  UpdateProjectBody,
} from "@workspace/api-zod";

test("Zod 4 preserves project input validation and integer bounds", () => {
  const project = {
    brief: "Film a cooking tutorial",
    niche: "food",
    targetLength: 60,
    vibe: "calm",
    manual: true,
  };
  assert.deepEqual(CreateProjectBody.parse(project), project);
  for (const targetLength of [9, 601, 60.5, "60"]) {
    assert.equal(CreateProjectBody.safeParse({ ...project, targetLength }).success, false);
  }
});

test("profile validation accepts valid input and rejects invalid email", () => {
  const profile = { name: "Creator", email: "creator@example.com", phone: "+15555550100" };
  assert.deepEqual(SaveProfileBody.parse(profile), profile);
  assert.equal(SaveProfileBody.safeParse({ ...profile, email: "not-an-email" }).success, false);
});

test("collection validators retain shot limits and structured event output", () => {
  const shot = {
    id: "shot-1",
    section: "Intro",
    description: "Show the ingredients",
    angle: "overhead",
    movement: "static",
    type: "B-roll",
    props: ["bowl"],
    duration: 5,
    tip: "Use natural light",
    approved: false,
  };
  const plan = { shots: [shot], voiceover: "", checklist: [] };
  assert.deepEqual(UpdateProjectBody.parse(plan), plan);
  assert.equal(
    UpdateProjectBody.safeParse({ ...plan, shots: Array(51).fill(shot) }).success,
    false,
  );
  const events = [{
    id: 1,
    userId: 1,
    agentName: "director",
    inputSummary: "test",
    outputJson: { count: 1, nested: { ok: true } },
    humanDecision: null,
    timestamp: "2026-10-24T00:00:00Z",
  }];
  assert.deepEqual(GetActivityResponse.parse(events), events);
});
