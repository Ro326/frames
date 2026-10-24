import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable, agentEventsTable } from "@workspace/db";
import { desc, eq } from "@workspace/db";
import { SaveProfileBody, SaveProfileResponse, GetMeResponse, GetActivityResponse } from "@workspace/api-zod";
import { currentUser, fail } from "../lib/frames";
import { upiReady } from "../lib/upi-model";
import { directorReady } from "../lib/agenticorg-director";

export const accountRouter = Router();

accountRouter.get("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.json({ authenticated: false }); return; }
  const [row] = await db.select().from(usersTable).where(eq(usersTable.authId, userId));
  res.json(GetMeResponse.parse({
    authenticated: true,
    ...(row ? { user: { ...row, createdAt: row.createdAt.toISOString() } } : {}),
  }));
});

accountRouter.post("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) fail(401, "Sign in to create a profile.");
  const data = SaveProfileBody.parse(req.body);
  const identity = await clerkClient.users.getUser(userId);
  const email = identity.emailAddresses.find((item) =>
    item.emailAddress.toLowerCase() === data.email.toLowerCase() && item.verification?.status === "verified",
  );
  if (!email) fail(400, "Use your verified sign-in email address.");
   const [user] = await db.insert(usersTable).values({ ...data, phone: data.phone ?? "", authId: userId })
     .onConflictDoUpdate({ target: usersTable.authId, set: {
       name: data.name, email: email.emailAddress,
       ...(data.phone !== undefined ? { phone: data.phone } : {}),
     } })
    .returning();
  res.json(SaveProfileResponse.parse({ ...user, createdAt: user!.createdAt.toISOString() }));
});

accountRouter.get("/activity", async (req, res) => {
  const user = await currentUser(req);
  const events = await db.select().from(agentEventsTable).where(eq(agentEventsTable.userId, user.id))
    .orderBy(desc(agentEventsTable.timestamp)).limit(30);
  res.json(GetActivityResponse.parse(events.map((event) => ({ ...event, timestamp: event.timestamp.toISOString() }))));
});

accountRouter.get("/status", (_req, res) => {
  res.json({
    ai: directorReady(),
    voiceover: !!process.env.ELEVENLABS_API_KEY,
    payments: upiReady(),
    paymentMode: "manual_upi",
    coverage: false,
    admin: !!process.env.ADMIN_PASSWORD,
  });
});
