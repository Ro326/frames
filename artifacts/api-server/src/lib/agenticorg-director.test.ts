import test from "node:test";
import assert from "node:assert/strict";
import { directorReady, directorMessage, directorReviewPending, reusableDirectorDraft, runAgenticOrgDirector, redactAgenticOrg, type DirectorTrace } from "./agenticorg-director";
import { requestAgentJson } from "./json-agent";
import { directorOutputSchema } from "./director-output";

const config = { baseUrl: "https://agenticorg.hackathon.pinelabs.com", apiKey: "test-only-key", agentId: "00000000-0000-4000-8000-000000000001" };
const input = { brief: "Film coffee", niche: "food", length: 30, vibe: "Natural" };
const plan = {
  title: "Coffee", total_duration_sec: 30,
  shots: Array.from({ length: 8 }, (_, i) => ({
    slot: i + 1, section: i === 0 ? "Intro" : i === 7 ? "Outro" : "Body", description: "Film the cup",
    angle: "Top-down", movement: "Static", type: i < 3 ? "B-roll" : "A-roll", objects: ["Cup"], duration_sec: 3, tip: "Keep cup visible",
  })),
  voiceover_script: "Coffee time.", prep_checklist: ["Cup"],
};
test("Director requires HTTPS origin, key and UUID; credentials/paths in base URLs are rejected", () => {
  assert.equal(directorReady(config), true);
  for (const bad of ["http://example.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test/?key=x"]) {
    assert.equal(directorReady({ ...config, baseUrl: bad }), false);
  }
  assert.equal(directorReady({ ...config, agentId: "Frames Director" }), false);
  assert.equal(directorReady({ ...config, apiKey: "" }), false);
});
test("calls exact UUID /run endpoint with task JSON and no agent lookup or extra requests", async () => {
  let calls = 0;
  const trace: DirectorTrace = { attempted: false };
  const fetcher = (async (url, init) => {
    calls++;
    assert.equal(url, `${config.baseUrl}/api/v1/agents/${config.agentId}/run`);
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${config.apiKey}`);
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.context, {});
    assert.equal(body.action, "process");
    const task = JSON.parse(body.inputs.task);
    assert.equal(task.instructions, "Exact prompt");
    for (const key of ["brief", "niche", "length", "vibe"] as const) assert.equal(task[key], input[key]);
    return Response.json({ status: "completed", output: plan });
  }) as typeof fetch;
  const result = await runAgenticOrgDirector(input, "Exact prompt", trace, config, fetcher);
  assert.equal(calls, 1);
  assert.equal(trace.attempted, true);
  assert.equal(trace.http_status, 200);
  assert.equal(directorOutputSchema.parse(JSON.parse(result.content[0]!.text!)).shots.length, 8);
});
for (const status of ["pending", "running", "failed", "budget_exceeded", "unknown"]) {
  test(`${status} never saves a plan even with plausible output`, () => {
    assert.throws(() => directorMessage({ status, output: plan }));
  });
}
test("one retry for invalid JSON; both invocations are audited separately", async () => {
  const audit: unknown[] = [];
  let calls = 0;
  const result = await requestAgentJson({
    call: async () => directorMessage({ status: "completed", output: ++calls === 1 ? "not JSON" : plan }),
    validate: (output) => directorOutputSchema.parse(output),
    audit: async (event) => { audit.push(event); },
  });
  assert.equal(result.shots.length, 8);
  assert.equal(calls, 2);
  assert.deepEqual(audit.map((x) => (x as { status: string }).status), ["invalid_response", "success"]);
});
test("valid human-review output is available as a draft in one call without marking provider review complete", async () => {
  const events: unknown[] = [];
  let calls = 0;
  const result = await requestAgentJson({
    call: async () => { calls++; return directorMessage({ status: "hitl_triggered", output: plan }); },
    validate: (value) => directorOutputSchema.parse(value),
    audit: async (event) => { events.push(event); },
  });
  assert.equal(result.shots.length, 8);
  assert.equal(directorReviewPending({ status: "hitl_triggered" }), true);
  assert.equal(directorReviewPending({ status: "completed" }), false);
  assert.equal(calls, 1);
  assert.equal(events.length, 1);
});
test("awaiting approval also exposes only strictly validated draft output", () => {
  const message = directorMessage({ status: "awaiting_approval", output: plan });
  assert.equal(directorOutputSchema.parse(JSON.parse(message.content[0]!.text!)).shots.length, 8);
  assert.throws(() => directorMessage({ status: "hitl_triggered", output: null }), /has not returned a draft/);
  assert.throws(() => directorMessage({ status: "hitl_triggered", output: plan, error: "Failure" }), /reported a Director error/);
  assert.throws(() => directorOutputSchema.parse(JSON.parse(directorMessage({ status: "hitl_triggered", output: { shots: [] } }).content[0]!.text!)));
});
test("recover matching audited drafts without a new agent call; reject stale, changed or truncated inputs", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const raw = { status: "hitl_triggered", output: plan };
  const current = { inputSummary: "Project 1: food, 30s, Natural. Coffee", updatedAt: now, inputHash: "matching-hash" };
  const event = { inputSummary: current.inputSummary, timestamp: now, outputJson: { response: raw } };
  assert.equal(reusableDirectorDraft(event, current), raw);
  assert.equal(reusableDirectorDraft({ ...event, timestamp: new Date(now.getTime() - 1) }, current), null);
  assert.equal(reusableDirectorDraft({ ...event, inputSummary: "Project 2" }, current), null);
  assert.equal(reusableDirectorDraft({ ...event, outputJson: { response: raw, input_fingerprint: "different-hash" } }, current), null);
  assert.equal(reusableDirectorDraft({ ...event, outputJson: { response: raw, input_fingerprint: current.inputHash } }, current), raw);
  assert.equal(reusableDirectorDraft({ ...event, inputSummary: "x".repeat(1200) }, { ...current, inputSummary: "x".repeat(1200) }), null);
  assert.equal(reusableDirectorDraft({ ...event, outputJson: { response: { status: "running", output: plan } } }, current), null);
});
test("HTTP execution errors are explicit and never trigger a name lookup", async () => {
  let calls = 0;
  const trace: DirectorTrace = { attempted: false };
  await assert.rejects(runAgenticOrgDirector(input, "Prompt", trace, config, (async () => {
    calls++; return Response.json({ detail: "Not authorized" }, { status: 403 });
  }) as typeof fetch), /agents:run/);
  assert.equal(calls, 1);
  assert.equal(trace.http_status, 403);
});
test("audit outputs redact credentials and secret UUID values", () => {
  const value = redactAgenticOrg({ agent_id: config.agentId, token: "sensitive", output: `${config.apiKey} ${config.agentId}`, confidence: 0.9 }, config);
  assert.deepEqual(value, { output: "[redacted] [redacted]", confidence: 0.9 });
});
