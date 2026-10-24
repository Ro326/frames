import { db, projectsTable, agentEventsTable, eq, and, type StoredProject } from "@workspace/db";
import { GetProjectResponse } from "@workspace/api-zod";
import { localCoverage, parseCoverageResponse, type Coverage } from "./coverage-model";

type HttpTrace = { path: string; status: number; request: unknown; response?: unknown };
function auditResponse(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") {
    let text = value;
    for (const key of [process.env.AGENTICORG_API_KEY, process.env.AGENTICORG_AGENT_ID]) {
      if (key) text = text.replaceAll(key, "[redacted]");
    }
    return text.slice(0, 12000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => auditResponse(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/secret|token|password|authorization|credential|private.?key|api.?key|connector.?config/i.test(key))
    .slice(0, 60).map(([key, item]) => [key, auditResponse(item, depth + 1)]));
  return value;
}

export async function refreshCoverage(row: StoredProject): Promise<StoredProject> {
  const project = GetProjectResponse.parse({ ...row, coverage: undefined, createdAt: row.createdAt.toISOString(), approvedAt: row.approvedAt?.toISOString() ?? null });
  const input = {
    plan: { title: project.title, brief: project.brief, niche: project.niche, length: project.targetLength,
      vibe: project.vibe, shots: project.shots, voiceover_script: project.voiceover, prep_checklist: project.checklist },
    clip_verdicts: project.shots.map((shot) => ({ slot: shot.id, verdict: shot.verdict ?? null,
      approved: shot.approved, clip_present: !!shot.clipName })),
    response_contract: {
      coverage_pct: "number 0–100", status: "short summary",
      slots: [{ slot: "exact shot id", status: "approved | needs_fix | missing", note: "short explanation" }],
      next_shot: "{slot: exact shot id, instruction: concrete filming instruction}, or null when all shots approved",
      rules: "Account for every shot exactly once. Preserve approved=true including human overrides; never approve other shots. Choose a not-yet-approved next shot. Only report 100 and next_shot=null when every shot is approved. Return JSON only.",
    },
  };
  let coverage: Coverage;
  let response: unknown = null;
  let errorMessage: string | undefined;
  const trace: HttpTrace[] = [];
  const signal = AbortSignal.timeout(30_000);
  const request = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const call: HttpTrace = { path: "/api/v1/agents/[redacted]/run", status: 0, request: body ? auditResponse(body) : null };
    trace.push(call);
    const res = await fetch(`${process.env.AGENTICORG_BASE_URL?.replace(/\/$/, "")}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${process.env.AGENTICORG_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal, redirect: "error",
    });
    call.status = res.status;
    const result: unknown = await res.json().catch(() => null);
    call.response = auditResponse(result);
    if (!res.ok) throw new Error(`AgenticOrg returned HTTP ${res.status}.`);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("AgenticOrg returned an invalid response.");
    return result as Record<string, unknown>;
  };
  try {
    if (!process.env.AGENTICORG_API_KEY) throw new Error("AGENTICORG_API_KEY is not configured.");
    const base = new URL(process.env.AGENTICORG_BASE_URL || "");
    if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
      throw new Error("AGENTICORG_BASE_URL must be an HTTPS origin.");
    }
    const agentId = process.env.AGENTICORG_AGENT_ID;
    if (!agentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
      throw new Error("AGENTICORG_AGENT_ID must be configured as a UUID.");
    }
    response = await request(`/api/v1/agents/${encodeURIComponent(agentId)}/run`, {
      action: "process", inputs: { task: JSON.stringify(input) }, context: {},
    });
    const task = response as Record<string, unknown>;
    if (["running", "pending", "submitted", "working", "failed", "error", "cancelled", "rejected", "awaiting_approval"].includes(String(task.status))) {
      throw new Error(`AgenticOrg task is ${String(task.status)}.`);
    }
    coverage = parseCoverageResponse(response, project);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "AgenticOrg coverage failed.";
    coverage = localCoverage(project, "Coverage Producer unavailable. Showing local approvals.");
  }
  await db.insert(agentEventsTable).values({
    userId: row.userId, agentName: "AgenticOrg Coverage Producer",
    inputSummary: `Project ${row.id}: full plan and ${project.shots.length} clip verdicts`,
    outputJson: {
      status: errorMessage ? "failed" : "success", attempted: !!process.env.AGENTICORG_API_KEY,
      request: input, response: auditResponse(response), coverage,
      http_calls: trace, error: errorMessage ?? null, fallback: !!errorMessage,
      timestamp: new Date().toISOString(),
    },
  });
  // Never attach an old agent report to shots that changed during the remote call.
  await db.update(projectsTable).set({ coverage }).where(and(eq(projectsTable.id, row.id), eq(projectsTable.updatedAt, row.updatedAt)));
  const [latest] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.id));
  return latest ?? row;
}
