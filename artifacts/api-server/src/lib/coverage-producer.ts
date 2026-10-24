import { db, projectsTable, eq, and, type StoredProject } from "@workspace/db";
import { GetProjectResponse } from "@workspace/api-zod";
import { localCoverage } from "./coverage-model";

// Coverage is intentionally local. The configured AgenticOrg UUID is the
// Frames Director, not a separate Coverage Producer.
export async function refreshCoverage(row: StoredProject): Promise<StoredProject> {
  const shots = GetProjectResponse.shape.shots.parse(row.shots);
  await db.update(projectsTable).set({ coverage: localCoverage({ shots }) })
    .where(and(eq(projectsTable.id, row.id), eq(projectsTable.updatedAt, row.updatedAt)));
  const [latest] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.id));
  return latest ?? row;
}
