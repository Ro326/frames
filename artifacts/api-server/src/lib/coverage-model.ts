import { GetProjectResponse } from "@workspace/api-zod";

export type CoverageProject = ReturnType<typeof GetProjectResponse.parse>;
export type Coverage = NonNullable<CoverageProject["coverage"]>;

export function localCoverage(project: Pick<CoverageProject, "shots">, reason?: string): Coverage {
  const approved = project.shots.filter((shot) => shot.approved).length;
  const next = project.shots.find((shot) => !shot.approved);
  return {
    coverage_pct: project.shots.length ? Math.round(approved / project.shots.length * 100) : 0,
    status: project.shots.length && approved === project.shots.length ? "All shots approved" : "Keep shooting",
    slots: project.shots.map((shot) => ({
      slot: shot.id, status: shot.approved ? "approved" : shot.verdict ? "needs_fix" : "missing",
      note: shot.approved ? "Approved" : shot.verdict?.fix || "No approved clip yet",
    })),
    next_shot: next ? { slot: next.id, instruction: next.verdict?.fix || next.description } : null,
    source: "local", ...(reason ? { fallback_reason: reason } : {}),
  };
}

export function parseCoverageResponse(raw: unknown, project: Pick<CoverageProject, "shots">): Coverage {
  let value = raw;
  for (let i = 0; i < 5; i++) {
    if (typeof value === "string") {
      value = JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid coverage response.");
    const object = value as Record<string, unknown>;
    if ("coverage_pct" in object) break;
    value = object.output ?? object.result ?? object.output_data ?? object.data;
  }
  const object = value as Record<string, unknown>;
  if (!object || typeof object !== "object") throw new Error("Coverage report missing.");
  const slotId = (slot: unknown): string => {
    const id = String(slot);
    if (project.shots.some((shot) => shot.id === id)) return id;
    const index = /^\d+$/.test(id) ? Number(id) - 1 : -1;
    if (index >= 0 && project.shots[index]) return project.shots[index]!.id;
    throw new Error("Coverage refers to an unknown shot.");
  };
  const slots = Array.isArray(object.slots) ? object.slots.map((slot: unknown) => {
    if (!slot || typeof slot !== "object") throw new Error("Invalid coverage slot.");
    const row = slot as Record<string, unknown>;
    return { ...row, slot: slotId(row.slot) };
  }) : [];
  let next: unknown = object.next_shot;
  if (next !== null) {
    if (typeof next !== "object") next = { slot: next };
    const row = next as Record<string, unknown>;
    const slot = slotId(row.slot);
    const shot = project.shots.find((item) => item.id === slot)!;
    next = { slot, instruction: typeof row.instruction === "string" && row.instruction.trim() ? row.instruction.slice(0, 1000) : shot.description };
  }
  const parsed = GetProjectResponse.shape.coverage.unwrap().parse({ ...object, slots, next_shot: next, source: "agenticorg" });
  if (slots.length !== project.shots.length || new Set(slots.map((slot) => slot.slot)).size !== slots.length) {
    throw new Error("Coverage must account for every planned shot once.");
  }
  for (const slot of parsed.slots) {
    const shot = project.shots.find((item) => item.id === slot.slot)!;
    if ((slot.status === "approved") !== shot.approved) throw new Error("Coverage cannot override a creator's shot approval.");
  }
  const incomplete = project.shots.some((shot) => !shot.approved);
  if (incomplete && (!parsed.next_shot || project.shots.find((shot) => shot.id === parsed.next_shot!.slot)?.approved ||
    parsed.coverage_pct === 100)) throw new Error("Coverage must identify an unfinished shot.");
  if (!incomplete && (parsed.next_shot !== null || parsed.coverage_pct !== 100)) throw new Error("Completed coverage is inconsistent.");
  return parsed;
}
