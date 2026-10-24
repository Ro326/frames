import { Router } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, sql } from "@workspace/db";
import { db, projectsTable, agentEventsTable } from "@workspace/db";
import { runAgenticOrgDirector, redactAgenticOrg, directorMessage, directorReviewPending, reusableDirectorDraft, type DirectorTrace } from "../lib/agenticorg-director";
import { DIRECTOR_PROMPT } from "../../../../server/prompts.js";
import { requestAgentJson } from "../lib/json-agent";
import { directorOutputSchema, directorPlan } from "../lib/director-output";
import { ownedProject, projectResponse, fail } from "../lib/frames";

export const directorRouter = Router();

directorRouter.post("/projects/:id/direct", async (req, res) => {
  const { user, row } = await ownedProject(req);
  if (row.approvedAt) fail(409, "Edit your plan before generating a replacement.");
  const inputSummary = `Project ${row.id}: ${row.niche}, ${row.targetLength}s, ${row.vibe}. ${row.brief}`.slice(0, 1200);
  const input = { brief: row.brief, niche: row.niche, length: row.targetLength, vibe: row.vibe };
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  let cached: { response: unknown; id: number } | undefined;
  if (Array.isArray(row.shots) && row.shots.length === 0) {
    const events = await db.select().from(agentEventsTable).where(and(
      eq(agentEventsTable.userId, user.id), eq(agentEventsTable.agentName, "AgenticOrg Director"),
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
  let trace: DirectorTrace = { attempted: false };
  const output = await requestAgentJson({
    call: () => {
      if (cached) {
        trace = { attempted: false, response: cached.response, recovered_from_event: cached.id };
        return Promise.resolve(directorMessage(cached.response));
      }
      trace = { attempted: false };
      return runAgenticOrgDirector(input, DIRECTOR_PROMPT, trace);
    },
    validate: (response) => directorOutputSchema.parse(response),
    audit: async (event) => {
      await db.insert(agentEventsTable).values({
        userId: user.id, agentName: "AgenticOrg Director", inputSummary,
        outputJson: redactAgenticOrg({
          ...event, ...trace,
          status: event.status === "success" && directorReviewPending(trace.response) ? "draft_ready" : event.status,
          provider_review_pending: directorReviewPending(trace.response),
          input_fingerprint: inputHash, provider: "AgenticOrg", timestamp: new Date().toISOString(),
        }) as Record<string, unknown>,
        humanDecision: null,
      });
    },
  });
  const plan = directorPlan(output);
  const [saved] = await db.update(projectsTable).set({
    ...plan, coverage: null, title: output.title,
    status: directorReviewPending(trace.response) ? "draft" : "planned", approvedAt: null, updatedAt: new Date(),
  }).where(and(eq(projectsTable.id, row.id), eq(projectsTable.updatedAt, row.updatedAt))).returning();
  if (!saved) fail(409, "The plan changed while generating. Reload before trying again.");
  res.json(projectResponse(saved));
});
