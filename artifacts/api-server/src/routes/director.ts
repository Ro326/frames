import { Router } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, sql } from "@workspace/db";
import { db, projectsTable, agentEventsTable, type StoredProject } from "@workspace/db";
import { runAgenticOrgDirector, redactAgenticOrg, directorMessage, directorReviewPending, reusableDirectorDraft, type DirectorTrace } from "../lib/agenticorg-director";
import { DIRECTOR_PROMPT } from "../../../../server/prompts.js";
import { requestAgentJson, InvalidAgentResponse } from "../lib/json-agent";
import { directorOutputSchema, directorPlan } from "../lib/director-output";
import { ownedProject, projectResponse, fail } from "../lib/frames";
import { sharedDirectorRequest, type DirectorRequest } from "../lib/director-request";
import { directorRequestStore } from "../lib/director-request-store";

export const directorRouter = Router();

directorRouter.post("/projects/:id/direct", async (req, res) => {
  const { user, row } = await ownedProject(req);
  if (row.approvedAt) fail(409, "Edit your plan before generating a replacement.");
  const inputSummary = `Project ${row.id}: ${row.niche}, ${row.targetLength}s, ${row.vibe}. ${row.brief}`.slice(0, 1200);
  const input = { brief: row.brief, niche: row.niche, length: row.targetLength, vibe: row.vibe };
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const result = await sharedDirectorRequest({
    scope: { userId: user.id, projectId: row.id, fingerprint: inputHash, revision: row.updatedAt.toISOString(), inputSummary },
    store: directorRequestStore,
    execute: (request) => generateDirector(user.id, row, input, inputHash, inputSummary, request),
    result: async (request) => {
      const { row: current } = await ownedProject(req);
      if (request.data.state !== "succeeded" && request.data.result_response !== undefined) {
        const output = directorOutputSchema.parse(JSON.parse(directorMessage(request.data.result_response).content[0]!.text!));
        return saveDirector(user.id, row.id, output, request.data.result_response, request);
      }
      if (current.updatedAt.toISOString() !== request.data.saved_revision) {
        fail(409, "The plan changed after generation. Reload to see the current plan.");
      }
      return projectResponse(current);
    },
  });
  res.json(result);
});

async function generateDirector(
  userId: number, row: StoredProject,
  input: { brief: string; niche: string; length: number; vibe: string },
  inputHash: string, inputSummary: string, request: DirectorRequest,
) {
  let trace: DirectorTrace = { attempted: false };
  let providerRejected = false;
  let resultAudited = false;
  try {
    let cached: { response: unknown; id: number } | undefined;
    if (Array.isArray(row.shots) && row.shots.length === 0) {
      const events = await db.select().from(agentEventsTable).where(and(
        eq(agentEventsTable.userId, userId), eq(agentEventsTable.agentName, "AgenticOrg Director"),
        eq(agentEventsTable.inputSummary, inputSummary), sql`${agentEventsTable.timestamp} >= ${row.updatedAt.toISOString()}::timestamptz`,
      )).orderBy(desc(agentEventsTable.timestamp)).limit(5);
      for (const event of events) {
        const candidate = reusableDirectorDraft(event, { inputSummary, updatedAt: row.updatedAt, inputHash });
        if (!candidate) continue;
        try {
          const message = directorMessage(candidate);
          directorOutputSchema.parse(JSON.parse(message.content[0]!.text!));
          cached = { response: candidate, id: event.id };
          break;
        } catch { /* Never restore an invalid or unrelated draft. */ }
      }
    }
    const output = await requestAgentJson({
      call: async () => {
        if (cached) {
          trace = { attempted: false, response: cached.response, recovered_from_event: cached.id };
          return directorMessage(cached.response);
        }
        trace = { attempted: false };
        try {
          return await runAgenticOrgDirector(input, DIRECTOR_PROMPT, trace);
        } catch (error) {
          providerRejected = trace.execution_unconfirmed === false;
          throw error;
        }
      },
      validate: (response) => directorOutputSchema.parse(response),
      audit: async (event) => {
        await db.transaction(async (tx) => {
          await tx.insert(agentEventsTable).values({
            userId, agentName: "AgenticOrg Director", inputSummary,
            outputJson: redactAgenticOrg({
              ...event, ...trace,
              status: event.status === "success" && directorReviewPending(trace.response) ? "draft_ready" : event.status,
              provider_review_pending: directorReviewPending(trace.response),
              input_fingerprint: inputHash, request_event_id: request.id,
              provider: "AgenticOrg", timestamp: new Date().toISOString(),
            }) as Record<string, unknown>,
            humanDecision: null,
          });
          if (event.status === "success") {
            // Persist usable output with its audit event before the project write.
            // A crash or uncertain save can then recover without another run.
            request.data = { ...request.data, result_response: trace.response };
            await tx.update(agentEventsTable).set({ outputJson: request.data }).where(eq(agentEventsTable.id, request.id));
          }
        });
        if (event.status === "success") resultAudited = true;
      },
    });
    return await saveDirector(userId, row.id, output, trace.response, request);
  } catch (error) {
    // Audit/database failures after dispatch must not silently unlock another
    // paid call. Only a confirmed terminal result/rejection can release a claim.
    const failure = error as { status?: number; message?: string };
    const retrySafe = (!trace.attempted && !resultAudited) || providerRejected ||
      (resultAudited && failure.status === 409) ||
      (error instanceof InvalidAgentResponse && trace.execution_unconfirmed === false);
    request.data = {
      ...request.data, state: retrySafe ? "failed" : "uncertain",
      failure: {
        status: failure.status ?? 500,
        message: String(redactAgenticOrg(failure.message ?? "Director generation failed.")),
      },
    };
    await directorRequestStore.write(request);
    throw error;
  }
}

async function saveDirector(
  userId: number, projectId: number,
  output: ReturnType<typeof directorOutputSchema.parse>, response: unknown, request: DirectorRequest,
) {
  const saved = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(projectsTable).where(and(
      eq(projectsTable.id, projectId), eq(projectsTable.userId, userId),
    )).for("update");
    if (!current) fail(404, "Project not found.");
    const [event] = await tx.select().from(agentEventsTable).where(and(
      eq(agentEventsTable.id, request.id), eq(agentEventsTable.userId, userId),
    ));
    const data = event?.outputJson as DirectorRequest["data"] | undefined;
    if (!data) fail(409, "The Director request record is unavailable. No new run was started.");
    if (data.state === "succeeded") {
      if (current.updatedAt.toISOString() !== data.saved_revision) fail(409, "The plan changed after generation. Reload to see the current plan.");
      return current;
    }
    if (current.approvedAt || current.updatedAt.toISOString() !== data.revision) {
      await tx.update(agentEventsTable).set({ outputJson: { ...data, state: "failed" } }).where(eq(agentEventsTable.id, request.id));
      return null;
    }
    const [updated] = await tx.update(projectsTable).set({
      ...directorPlan(output), coverage: null, title: output.title,
      status: directorReviewPending(response) ? "draft" : "planned", approvedAt: null, updatedAt: new Date(),
    }).where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId), eq(projectsTable.updatedAt, current.updatedAt))).returning();
    if (!updated) fail(409, "The plan changed while generating. Reload before trying again.");
    // Commit the plan and its shared result marker together, including on restart.
    await tx.update(agentEventsTable).set({
      outputJson: { ...data, state: "succeeded", saved_revision: updated.updatedAt.toISOString() },
    }).where(eq(agentEventsTable.id, request.id));
    return updated;
  });
  if (!saved) fail(409, "The plan changed while generating. Reload before trying again.");
  return projectResponse(saved);
}
