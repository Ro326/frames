import { Router } from "express";
import { db, agentEventsTable } from "@workspace/db";
import { currentUser, ownedProject, fail } from "../lib/frames";

export const servicesRouter = Router();

servicesRouter.post("/projects/:id/voiceover", async (req, res) => {
  const { user, row, project } = await ownedProject(req);
  if (!project.shots.length || !project.shots.every((shot) => shot.approved)) fail(409, "Approve all shots to unlock the edit table.");
  if (!process.env.ELEVENLABS_API_KEY) fail(503, "Voiceover audio needs an ElevenLabs connection or ELEVENLABS_API_KEY in project Secrets.");
  if (!project.voiceover.trim()) fail(400, "Add a voiceover script to your plan first.");
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: project.voiceover, model_id: "eleven_multilingual_v2" }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) fail(502, "ElevenLabs could not generate audio. Check the voice, credentials, and remaining credits.");
  const audio = Buffer.from(await response.arrayBuffer());
  await db.insert(agentEventsTable).values({
    userId: user.id, agentName: "Voiceover", inputSummary: `Project ${row.id}: ${project.voiceover.length} characters`,
    outputJson: { format: "mp3", bytes: audio.byteLength }, humanDecision: "generated",
  });
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", 'attachment; filename="frames-voiceover.mp3"');
  res.setHeader("Cache-Control", "no-store");
  res.send(audio);
});

