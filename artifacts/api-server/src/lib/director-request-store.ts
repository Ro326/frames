import { db, agentEventsTable, projectsTable, and, eq, desc, sql } from "@workspace/db";
import type { DirectorRequest, DirectorRequestData, DirectorRequestStore } from "./director-request";
import { matchesDirectorRequest } from "./director-request";
import { fail } from "./frames";

// Separate from invocation events so reservations never count as paid calls.
const agentName = "Director request";
export const directorRequestStore: DirectorRequestStore = {
  async claim(scope) {
    return db.transaction(async (tx) => {
      // Serialize claims across processes without holding a connection during AI.
      const [project] = await tx.select().from(projectsTable).where(and(
        eq(projectsTable.id, scope.projectId), eq(projectsTable.userId, scope.userId),
      )).for("update");
      if (!project) fail(404, "Project not found.");
      if (project.approvedAt) fail(409, "Edit your plan before generating a replacement.");
      const events = await tx.select().from(agentEventsTable).where(and(
        eq(agentEventsTable.userId, scope.userId), eq(agentEventsTable.agentName, agentName),
        sql`${agentEventsTable.outputJson}->>'project_id' = ${String(scope.projectId)}`,
        sql`${agentEventsTable.outputJson}->>'input_fingerprint' = ${scope.fingerprint}`,
      )).orderBy(desc(agentEventsTable.id));
      for (const event of events) {
        const data = event.outputJson as DirectorRequestData;
        if (matchesDirectorRequest(data, scope)) return { request: { id: event.id, data }, owner: false };
      }
      if (project.updatedAt.toISOString() !== scope.revision) fail(409, "The plan changed. Reload before trying again.");
      const data: DirectorRequestData = {
        state: "running", project_id: scope.projectId,
        input_fingerprint: scope.fingerprint, revision: scope.revision,
      };
      const [created] = await tx.insert(agentEventsTable).values({
        userId: scope.userId, agentName, inputSummary: scope.inputSummary, outputJson: data,
      }).returning();
      return { request: { id: created!.id, data }, owner: true };
    });
  },
  async read(id, userId) {
    const [event] = await db.select().from(agentEventsTable).where(and(
      eq(agentEventsTable.id, id), eq(agentEventsTable.userId, userId), eq(agentEventsTable.agentName, agentName),
    ));
    if (!event) fail(409, "The Director request record is unavailable. No new run was started.");
    return { id: event.id, data: event.outputJson as DirectorRequestData };
  },
  async write(request: DirectorRequest) {
    await db.update(agentEventsTable).set({ outputJson: request.data }).where(and(
      eq(agentEventsTable.id, request.id), eq(agentEventsTable.agentName, agentName),
      sql`${agentEventsTable.outputJson}->>'state' <> 'succeeded'`,
    ));
  },
};
