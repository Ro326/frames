import type { AgentMessage } from "./json-agent";

type Config = { baseUrl?: string; apiKey?: string; agentId?: string };
export type DirectorTrace = { attempted: boolean; http_status?: number; response?: unknown; recovered_from_event?: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const environment = (): Config => ({
  baseUrl: process.env.AGENTICORG_BASE_URL, apiKey: process.env.AGENTICORG_API_KEY,
  agentId: process.env.AGENTICORG_AGENT_ID,
});
export function directorReady(config = environment()): boolean {
  try {
    const url = new URL(config.baseUrl || "");
    return !!config.apiKey && uuid.test(config.agentId || "") && url.protocol === "https:" &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}
export function redactAgenticOrg(value: unknown, config = environment(), depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    let text = value;
    for (const secret of [config.apiKey, config.agentId, process.env.AGENTICORG_CHECKER_AGENT_ID]) {
      if (secret) text = text.replaceAll(secret, "[redacted]");
    }
    return text.slice(0, 20000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redactAgenticOrg(v, config, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/secret|token|password|authorization|credential|private.?key|api.?key|connector.?config|agent_id/i.test(key))
    .slice(0, 80).map(([k, v]) => [k, redactAgenticOrg(v, config, depth + 1)]));
  return value;
}
function problem(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
export function directorReviewPending(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return ["hitl_triggered", "awaiting_approval"].includes(String((raw as Record<string, unknown>).status));
}
export function reusableDirectorDraft(
  event: { inputSummary: string; timestamp: Date; outputJson: unknown },
  current: { inputSummary: string; updatedAt: Date; inputHash: string },
): unknown | null {
  if (event.inputSummary !== current.inputSummary || event.timestamp < current.updatedAt ||
    !event.outputJson || typeof event.outputJson !== "object") return null;
  const audit = event.outputJson as Record<string, unknown>;
  // Older audit entries contain only a summary. Recover them only when it
  // contains the full input, not when it was truncated.
  if (audit.input_fingerprint ? audit.input_fingerprint !== current.inputHash : current.inputSummary.length >= 1200) return null;
  return directorReviewPending(audit.response) ? audit.response : null;
}
export function directorMessage(raw: unknown): AgentMessage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw problem(502, "AgenticOrg returned an invalid Director response.");
  const result = raw as Record<string, unknown>;
  const status = String(result.status);
  const reviewDraft = directorReviewPending(raw);
  if (status === "budget_exceeded") throw problem(503, "Frames Director reached its AgenticOrg budget limit. Check the agent budget in the hackathon dashboard.");
  if (status !== "completed" && !reviewDraft) throw problem(502, `Frames Director did not complete (${status.slice(0, 50)}). No plan has been saved.`);
  if (result.error) throw problem(502, "AgenticOrg reported a Director error. No plan has been saved.");
  if (reviewDraft && (result.output === null || result.output === undefined || result.output === "")) {
    throw problem(409, "Frames Director is still reviewing this run and has not returned a draft yet. Check the run in AgenticOrg before retrying.");
  }
  return { content: [{ type: "text", text: typeof result.output === "string" ? result.output : JSON.stringify(result.output ?? null) }] };
}
export async function runAgenticOrgDirector(
  input: { brief: string; niche: string; length: number; vibe: string },
  systemPrompt: string,
  trace: DirectorTrace,
  config = environment(),
  fetcher: typeof fetch = fetch,
): Promise<AgentMessage> {
  if (!directorReady(config)) throw problem(503, "Frames Director needs a valid AgenticOrg API key, agent UUID and HTTPS base URL. Manual plans still work.");
  const body = { action: "process", inputs: { task: JSON.stringify({
    instructions: systemPrompt, ...input,
    response_format: "Return ONLY the JSON object requested in instructions. No markdown or extra commentary.",
  }) }, context: {} };
  trace.attempted = true;
  let response: Response;
  try {
    response = await fetcher(`${new URL(config.baseUrl!).origin}/api/v1/agents/${encodeURIComponent(config.agentId!)}/run`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw problem(502, "Could not get a response from Frames Director. Check the AgenticOrg run history before retrying; the run may still be processing.");
  }
  trace.http_status = response.status;
  const raw: unknown = await response.json().catch(() => null);
  trace.response = redactAgenticOrg(raw, config);
  if (response.status === 401 || response.status === 403) throw problem(503, "AgenticOrg rejected Director execution. Check the hackathon key and its agents:run permission.");
  if (!response.ok) throw problem(502, `AgenticOrg Director returned HTTP ${response.status}. No plan has been saved.`);
  return directorMessage(raw);
}
