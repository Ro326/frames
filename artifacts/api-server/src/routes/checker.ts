import { Router } from "express";
import { and, eq } from "@workspace/db";
import { db, projectsTable, agentEventsTable } from "@workspace/db";
import { CheckFramesBody, DecideShotBody, GetProjectResponse } from "@workspace/api-zod";
import { aiClient } from "../lib/anthropic";
import { CHECKER_PROMPT } from "../../../../server/prompts.js";
import { requestAgentJson } from "../lib/json-agent";
import { ownedProject, projectResponse, fail } from "../lib/frames";
import { refreshCoverage } from "../lib/coverage-producer";

export const checkerRouter = Router();
const verdictSchema = GetProjectResponse.shape.shots.element.shape.verdict.unwrap();

checkerRouter.post("/projects/:id/check", async (req, res) => {
  const { user, row, project } = await ownedProject(req);
  if (!row.approvedAt) fail(409, "Approve your plan before uploading clips.");
  const input = CheckFramesBody.parse(req.body);
  const shot = project.shots.find((item) => item.id === input.shotId);
  if (!shot) fail(404, "Shot not found.");
  const frames = input.frames.map((frame) => {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=\r\n]+$/.test(frame)) fail(400, "Each frame must be a JPEG data URL.");
    const data = frame.slice(frame.indexOf(",") + 1);
    const bytes = Buffer.from(data, "base64");
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail(400, "Invalid JPEG frame.");
    return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } };
  });
  const inputSummary = `Project ${row.id}, shot ${shot.id}: ${shot.description}`.slice(0, 1200);
  const verdict = await requestAgentJson({
    call: () => aiClient().messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 8192,
      system: CHECKER_PROMPT,
      messages: [{ role: "user", content: [
        { type: "text", text: JSON.stringify({
          description: shot.description, angle: shot.angle, movement: shot.movement, objects: shot.props,
        }) },
        ...frames,
      ] }],
    }, { maxRetries: 0 }),
    validate: (response) => verdictSchema.parse(response),
    audit: async (event) => {
      await db.insert(agentEventsTable).values({
        userId: user.id, agentName: "Frame Checker", inputSummary, outputJson: event, humanDecision: null,
      });
    },
  });
  const shots = project.shots.map((item) => item.id === shot.id
    ? { ...item, verdict, approved: verdict.match, clipName: input.clipName } : item);
  const [saved] = await db.update(projectsTable).set({
    shots, coverage: null, status: shots.every((item) => item.approved) ? "complete" : "shooting", updatedAt: new Date(),
  }).where(and(eq(projectsTable.id, row.id), eq(projectsTable.updatedAt, row.updatedAt))).returning();
  if (!saved) fail(409, "Another shot changed while checking. Reload and retry this check.");
  res.json(projectResponse(await refreshCoverage(saved)));
});

checkerRouter.post("/projects/:id/decision", async (req, res) => {
  const { user, row } = await ownedProject(req);
  const input = DecideShotBody.parse(req.body);
  const saved = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(projectsTable).where(eq(projectsTable.id, row.id)).for("update");
    const project = projectResponse(locked!);
    if (!locked!.approvedAt) fail(409, "Approve the plan first.");
    const shot = project.shots.find((item) => item.id === input.shotId);
    if (!shot) fail(404, "Shot not found.");
    if (input.decision === "override" && !shot.clipName) fail(400, "Upload and check a clip before approving it.");
    const shots = project.shots.map((item) => {
      if (item.id !== shot.id) return item;
      return input.decision === "override" ? { ...item, approved: true }
        : { ...item, approved: false, verdict: undefined, clipName: undefined };
    });
    const [updated] = await tx.update(projectsTable).set({
      shots, coverage: null, status: shots.every((item) => item.approved) ? "complete" : "shooting", updatedAt: new Date(),
    }).where(eq(projectsTable.id, row.id)).returning();
    await tx.insert(agentEventsTable).values({
      userId: user.id, agentName: "Human review",
      inputSummary: `Project ${row.id}, shot ${shot.id}`, outputJson: { previousVerdict: shot.verdict ?? null },
      humanDecision: input.decision,
    });
    return updated!;
  });
  res.json(projectResponse(input.decision === "override" ? await refreshCoverage(saved) : saved));
});
