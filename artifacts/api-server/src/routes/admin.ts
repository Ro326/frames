import { timingSafeEqual, createHash } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db, usersTable, projectsTable, agentEventsTable, paymentsTable, eq, and, sql } from "@workspace/db";
import { count, desc } from "@workspace/db";
import { paymentResponse } from "../lib/payments";
import { GetAdminResponse } from "@workspace/api-zod";
import { fail } from "../lib/frames";

export const adminRouter = Router();
const adminLimit = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false });
adminRouter.get("/admin", adminLimit, async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) fail(503, "Admin access is disabled. Add ADMIN_PASSWORD in project Secrets.");
  const header = req.headers.authorization ?? "";
  const credentials = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString() : "";
  const password = credentials.slice(credentials.indexOf(":") + 1);
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!credentials.includes(":") || !timingSafeEqual(hash(password), hash(process.env.ADMIN_PASSWORD))) {
    res.status(401).json({ error: "Incorrect admin password." }); return;
  }
  const [users, events, [userTotal], [projectTotal], [eventTotal], payments, [coverageTotal]] = await Promise.all([
    db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(200),
    db.select().from(agentEventsTable).orderBy(desc(agentEventsTable.timestamp)).limit(300),
    db.select({ total: count() }).from(usersTable),
    db.select({ total: count() }).from(projectsTable),
    db.select({ total: count() }).from(agentEventsTable),
    db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)).limit(200),
    db.select({ total: count() }).from(agentEventsTable).where(and(
      eq(agentEventsTable.agentName, "AgenticOrg Coverage Producer"),
      sql`${agentEventsTable.outputJson}->>'attempted' = 'true'`,
    )),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json(GetAdminResponse.parse({
    userCount: userTotal!.total, projectCount: projectTotal!.total, eventCount: eventTotal!.total,
    payments: payments.map(paymentResponse), coverageCallCount: coverageTotal!.total,
    users: users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() })),
    events: events.map((event) => ({ ...event, timestamp: event.timestamp.toISOString() })),
  }));
});
