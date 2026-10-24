import { z } from "zod";
import { randomUUID } from "node:crypto";
import { UpdateProjectBody } from "@workspace/api-zod";

export const directorOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  total_duration_sec: z.number().positive().max(600),
  shots: z.array(z.object({
    slot: z.number().int().min(1).max(14),
    section: z.enum(["Intro", "Body", "Outro"]),
    description: z.string().trim().min(1).max(2000),
    angle: z.string(),
    movement: z.string(),
    type: z.enum(["A-roll", "B-roll"]),
    objects: z.array(z.string()),
    duration_sec: z.number().min(1).max(600),
    tip: z.string(),
  })).min(8).max(14),
  voiceover_script: z.string().max(15000),
  prep_checklist: z.array(z.string()),
}).refine(
  (output) => output.shots.every((shot, index) => shot.slot === index + 1),
  { message: "Slots must be sequential, starting at 1." },
).refine(
  (output) => output.shots.filter((shot) => shot.type === "B-roll").length >= 3,
  { message: "The plan needs at least three B-roll inserts." },
);

export function directorPlan(output: z.infer<typeof directorOutputSchema>) {
  return UpdateProjectBody.parse({
    shots: output.shots.map((shot) => ({
      id: randomUUID(),
      section: shot.section,
      description: shot.description,
      angle: shot.angle,
      movement: shot.movement,
      type: shot.type,
      props: shot.objects,
      duration: shot.duration_sec,
      tip: shot.tip,
      approved: false,
    })),
    voiceover: output.voiceover_script,
    checklist: output.prep_checklist,
  });
}
