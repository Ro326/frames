import { Router } from "express";
import { db, usersTable, projectsTable, agentEventsTable } from "@workspace/db";
import { desc, eq } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody, ListProjectsResponse } from "@workspace/api-zod";
import { currentUser, ownedProject, projectResponse, fail } from "../lib/frames";
import { FREE_PROJECT_LIMIT, canCreateProject } from "../lib/usage";

export const projectsRouter = Router();

projectsRouter.get("/projects", async (req, res) => {
  const user = await currentUser(req);
  const rows = await db.select().from(projectsTable).where(eq(projectsTable.userId, user.id))
    .orderBy(desc(projectsTable.createdAt));
  res.json(ListProjectsResponse.parse(rows.map(projectResponse)));
});

projectsRouter.post("/projects", async (req, res) => {
  const user = await currentUser(req);
  const input = CreateProjectBody.parse(req.body);
  // Lock per user so concurrent requests cannot bypass the free-project limit.
  const row = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).for("update");
    const existing = await tx.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.userId, user.id)).limit(FREE_PROJECT_LIMIT);
    if (!canCreateProject(locked!.pro, existing.length)) fail(403, "You've used all 5 free tries (one project per try). Upgrade to Frames Pro to create more projects.");
    const [created] = await tx.insert(projectsTable).values({
      ...input, userId: user.id, title: input.brief.trim().slice(0, 70),
    }).returning();
    return created!;
  });
  res.status(201).json(projectResponse(row));
});

projectsRouter.get("/projects/:id", async (req, res) => {
  const { project } = await ownedProject(req);
  res.json(project);
});

projectsRouter.patch("/projects/:id", async (req, res) => {
  const { user, row } = await ownedProject(req);
  const input = UpdateProjectBody.parse(req.body);
  if (new Set(input.shots.map((shot) => shot.id)).size !== input.shots.length) fail(400, "Each shot needs a unique ID.");
  const shots = input.shots.map(({ verdict: _verdict, clipName: _clipName, ...shot }) => ({ ...shot, approved: false }));
  const [updated] = await db.transaction(async (tx) => {
    const updatedRows = await tx.update(projectsTable).set({
      ...input, shots, status: "planned", approvedAt: null, updatedAt: new Date(),
    }).where(eq(projectsTable.id, row.id)).returning();
    await tx.insert(agentEventsTable).values({
      userId: user.id, agentName: "Plan editor", inputSummary: `Project ${row.id}: plan edited`,
      outputJson: { shotCount: shots.length }, humanDecision: "edited",
    });
    return updatedRows;
  });
  res.json(projectResponse(updated!));
});

projectsRouter.post("/projects/:id/approve", async (req, res) => {
  const { user, row, project } = await ownedProject(req);
  if (!project.shots.length) fail(400, "Add at least one shot before approving.");
  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx.update(projectsTable).set({ status: "shooting", approvedAt: now, updatedAt: now })
      .where(eq(projectsTable.id, row.id)).returning();
    await tx.insert(agentEventsTable).values({
      userId: user.id, agentName: "Plan approval", inputSummary: `Project ${row.id}: ${project.shots.length} shots`,
      outputJson: { approvedAt: now.toISOString() }, humanDecision: "approved",
    });
    return rows;
  });
  res.json(projectResponse(updated!));
});
