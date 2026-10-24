import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, projectsTable, type StoredProject } from "@workspace/db";
import { and, eq } from "@workspace/db";
import { GetProjectParams, GetProjectResponse } from "@workspace/api-zod";
import { localCoverage } from "./coverage-model";

export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

export async function currentUser(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) fail(401, "Sign in to continue.");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.authId, userId));
  if (!user) fail(409, "Complete your creator profile first.");
  return user;
}

export function projectResponse(project: StoredProject) {
  return GetProjectResponse.parse({
    ...project,
    coverage: project.coverage ?? localCoverage({ shots: GetProjectResponse.shape.shots.parse(project.shots) }),
    createdAt: project.createdAt.toISOString(),
    approvedAt: project.approvedAt?.toISOString() ?? null,
  });
}

export async function ownedProject(req: Request) {
  const user = await currentUser(req);
  const { id } = GetProjectParams.parse(req.params);
  const [row] = await db.select().from(projectsTable).where(and(
    eq(projectsTable.id, id), eq(projectsTable.userId, user.id),
  ));
  if (!row) fail(404, "Project not found.");
  return { user, row, project: projectResponse(row) };
}
