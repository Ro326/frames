import { Router } from "express";
import { eq, and } from "@workspace/db";
import { db, projectsTable, agentEventsTable } from "@workspace/db";
import { aiClient } from "../lib/anthropic";
import { DIRECTOR_PROMPT } from "../../../../server/prompts.js";
import { requestAgentJson } from "../lib/json-agent";
import { directorOutputSchema, directorPlan } from "../lib/director-output";
import { ownedProject, projectResponse, fail } from "../lib/frames";

export const directorRouter = Router();

directorRouter.post("/projects/:id/direct", async (req, res) => {
  const { user, row } = await ownedProject(req);
  if (row.approvedAt) fail(409, "Edit your plan before generating a replacement.");
  const inputSummary = `Project ${row.id}: ${row.niche}, ${row.targetLength}s, ${row.vibe}. ${row.brief}`.slice(0, 1200);
  const output = await requestAgentJson({
    call: () => aiClient().messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 8192,
      system: DIRECTOR_PROMPT,
      messages: [{ role: "user", content: JSON.stringify({
        brief: row.brief, niche: row.niche, length: row.targetLength, vibe: row.vibe,
      }) }],
    }, { maxRetries: 0 }),
    validate: (response) => directorOutputSchema.parse(response),
    audit: async (event) => {
      await db.insert(agentEventsTable).values({
        userId: user.id, agentName: "Director", inputSummary, outputJson: event, humanDecision: null,
      });
    },
  });
  const plan = directorPlan(output);
  const [saved] = await db.update(projectsTable).set({
    ...plan, title: output.title, status: "planned", updatedAt: new Date(),
  }).where(and(eq(projectsTable.id, row.id), eq(projectsTable.updatedAt, row.updatedAt))).returning();
  if (!saved) fail(409, "The plan changed while generating. Reload before trying again.");
  res.json(projectResponse(saved));
});
