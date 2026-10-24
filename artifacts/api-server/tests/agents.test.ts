import test from "node:test";
import assert from "node:assert/strict";
import { requestAgentJson, InvalidAgentResponse, type AgentAttempt } from "../src/lib/json-agent";
import { directorOutputSchema, directorPlan } from "../src/lib/director-output";
import { DIRECTOR_PROMPT, CHECKER_PROMPT } from "../../../server/prompts.js";

const message = (text: string) => ({ content: [{ type: "text", text }] });
const validObject = (value: unknown): { ok: boolean } => {
  if (!value || typeof value !== "object" || typeof (value as { ok?: unknown }).ok !== "boolean") {
    throw new Error("Invalid shape");
  }
  return value as { ok: boolean };
};

test("valid JSON returns immediately and records one successful call", async () => {
  const events: AgentAttempt[] = [];
  let calls = 0;
  const output = await requestAgentJson({
    call: async () => { calls++; return message('{"ok":true}'); },
    validate: validObject,
    audit: async (event) => { events.push(event); },
  });
  assert.equal(calls, 1);
  assert.deepEqual(output, { ok: true });
  assert.deepEqual(events, [{ attempt: 1, status: "success", response: { ok: true } }]);
});

test("a parse failure retries once, logging the failed and successful calls", async () => {
  const events: AgentAttempt[] = [];
  const output = await requestAgentJson({
    call: async (attempt) => message(attempt === 1 ? '{"ok":' : '{"ok":false}'),
    validate: validObject,
    audit: async (event) => { events.push(event); },
  });
  assert.deepEqual(output, { ok: false });
  assert.deepEqual(events.map((event) => [event.attempt, event.status]), [
    [1, "invalid_response"], [2, "success"],
  ]);
});

test("invalid shapes are also retried, and fenced JSON is not accepted", async () => {
  let calls = 0;
  const events: AgentAttempt[] = [];
  await assert.rejects(requestAgentJson({
    call: async () => { calls++; return message(calls === 1 ? '{"ok":"yes"}' : '```json\n{"ok":true}\n```'); },
    validate: validObject,
    audit: async (event) => { events.push(event); },
  }), InvalidAgentResponse);
  assert.equal(calls, 2);
  assert.deepEqual(events.map((event) => event.status), ["invalid_response", "invalid_response"]);
});

test("two malformed responses stop after exactly two calls", async () => {
  let calls = 0;
  const events: AgentAttempt[] = [];
  await assert.rejects(requestAgentJson({
    call: async () => { calls++; return message("not JSON"); },
    validate: validObject,
    audit: async (event) => { events.push(event); },
  }), (error: unknown) => error instanceof InvalidAgentResponse && error.status === 502);
  assert.equal(calls, 2);
  assert.equal(events.length, 2);
});

test("provider errors are audited and are not misclassified as parse failures", async () => {
  const failure = new Error("Provider unavailable");
  const events: AgentAttempt[] = [];
  let calls = 0;
  await assert.rejects(requestAgentJson({
    call: async () => { calls++; throw failure; },
    validate: validObject,
    audit: async (event) => { events.push(event); },
  }), failure);
  assert.equal(calls, 1);
  assert.deepEqual(events, [{ attempt: 1, status: "error" }]);
});

test("an audit failure does not accidentally cause another model invocation", async () => {
  let calls = 0;
  const failure = new Error("Database unavailable");
  await assert.rejects(requestAgentJson({
    call: async () => { calls++; return message('{"ok":true}'); },
    validate: validObject,
    audit: async () => { throw failure; },
  }), failure);
  assert.equal(calls, 1);
});

function directorFixture() {
  return {
    title: "A day on location",
    total_duration_sec: 60,
    shots: Array.from({ length: 8 }, (_, index) => ({
      slot: index + 1,
      section: index === 0 ? "Intro" : index === 7 ? "Outro" : "Body",
      description: `Film subject ${index + 1}`,
      angle: "Wide",
      movement: "Static",
      type: index >= 2 ? "B-roll" : "A-roll",
      objects: ["Phone", "Tripod"],
      duration_sec: index === 0 ? 2 : index === 7 ? 10 : 8,
      tip: "Use a match cut into the next section.",
    })),
    voiceover_script: "Today we are creating something worth sharing.",
    prep_checklist: ["Charge your phone", "Clean your lens"],
  };
}

test("Director output maps its exact field names into the existing shot-plan contract", () => {
  const output = directorOutputSchema.parse(directorFixture());
  const plan = directorPlan(output);
  assert.equal(plan.shots.length, 8);
  assert.deepEqual(plan.shots[0]!.props, ["Phone", "Tripod"]);
  assert.equal(plan.shots[0]!.duration, 2);
  assert.equal(plan.voiceover, output.voiceover_script);
  assert.deepEqual(plan.checklist, output.prep_checklist);
  assert.equal(new Set(plan.shots.map((shot) => shot.id)).size, 8);
  assert.ok(plan.shots.every((shot) => !shot.approved));
});

test("Director rejects fewer than 8 shots, invalid slots, and insufficient B-roll", () => {
  const tooShort = directorFixture();
  tooShort.shots.pop();
  assert.equal(directorOutputSchema.safeParse(tooShort).success, false);
  const slots = directorFixture();
  slots.shots[0]!.slot = 2;
  assert.equal(directorOutputSchema.safeParse(slots).success, false);
  const broll = directorFixture();
  broll.shots.forEach((shot) => { shot.type = "A-roll"; });
  assert.equal(directorOutputSchema.safeParse(broll).success, false);
});

test("prompt exports retain the user-supplied identity, rules and wording", () => {
  assert.ok(DIRECTOR_PROMPT.startsWith("[You are Frames Director,"));
  assert.ok(DIRECTOR_PROMPT.endsWith("Voiceover must fit the duration (~2.5 words/sec).]"));
  assert.ok(DIRECTOR_PROMPT.includes("Rules: 8–14 shots; strong 2-second hook first;"));
  assert.ok(CHECKER_PROMPT.includes("Infer movement from frame differences."));
  assert.ok(CHECKER_PROMPT.endsWith('("Step back 2 steps so the full pass is in frame").]'));
});
