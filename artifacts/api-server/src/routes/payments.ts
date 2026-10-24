import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db, paymentsTable, usersTable, agentEventsTable, eq, and, desc, sql } from "@workspace/db";
import { SubmitPaymentReferenceBody } from "@workspace/api-zod";
import { currentUser, fail } from "../lib/frames";
import { paymentAudit, paymentResponse } from "../lib/payments";
import { upiReady, upiIntent, UPI_ENVIRONMENT, PRO_AMOUNT, storedReference, isDuplicateReference } from "../lib/upi-model";

export const paymentsRouter = Router();
const checkoutLimit = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false });
const readLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
function paymentId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, "Invalid payment reference.");
  return id;
}
paymentsRouter.post("/pay", checkoutLimit, async (req, res) => {
  const user = await currentUser(req);
  if (!upiReady()) fail(503, "UPI checkout needs its receiving account and payee name configured.");
  const payment = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).for("update");
    if (!locked || locked.pro) fail(409, "Frames Pro is already active.");
    const [recent] = await tx.select().from(paymentsTable).where(and(
      eq(paymentsTable.userId, user.id), eq(paymentsTable.environment, UPI_ENVIRONMENT),
      sql`${paymentsTable.status} IN ('AWAITING_PAYMENT', 'PENDING_REVIEW')`,
    )).orderBy(desc(paymentsTable.createdAt)).limit(1);
    // Reuse pending claims even after closing checkout; never encourage a second transfer.
    if (recent) return recent;
    const merchantReference = `frames-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const [created] = await tx.insert(paymentsTable).values({
      userId: user.id, merchantReference, checkoutUrl: upiIntent(merchantReference),
      amount: PRO_AMOUNT, currency: "INR", environment: UPI_ENVIRONMENT, status: "AWAITING_PAYMENT",
    }).returning();
    await tx.insert(agentEventsTable).values(paymentAudit(created!, "create"));
    return created!;
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({ url: `/payment/result?payment=${payment.id}`, paymentId: payment.id });
});
paymentsRouter.post("/pay/:id/reference", checkoutLimit, async (req, res) => {
  const user = await currentUser(req);
  const id = paymentId(req.params.id);
  const input = SubmitPaymentReferenceBody.parse(req.body);
  const reference = storedReference(input.transactionReference);
  try {
    const payment = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(paymentsTable).where(and(
        eq(paymentsTable.id, id), eq(paymentsTable.userId, user.id),
      )).for("update");
      if (!locked) fail(404, "Payment not found.");
      if (locked.environment !== UPI_ENVIRONMENT) fail(409, "This is a legacy payment. Start a new UPI checkout from Studio.");
      if (locked.status === "PENDING_REVIEW" && locked.orderId === reference) return locked;
      if (locked.status !== "AWAITING_PAYMENT") fail(409, "This claim has already been submitted or reviewed. Do not pay again.");
      const [updated] = await tx.update(paymentsTable).set({
        orderId: reference, status: "PENDING_REVIEW",
      }).where(eq(paymentsTable.id, id)).returning();
      // A submitted reference is a claim only: do not modify users.pro here.
      await tx.insert(agentEventsTable).values(paymentAudit(updated!, "submit_reference"));
      return updated!;
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(paymentResponse(payment));
  } catch (error) {
    if (isDuplicateReference(error)) fail(409, "This UPI reference has already been submitted. Check the reference or wait for the existing payment review.");
    throw error;
  }
});
// Old provider notifications cannot unlock Pro after switching to manual UPI.
paymentsRouter.all(["/pay/callback", "/pay/webhook"], (_req, res) => {
  res.status(410).json({ error: "Provider checkout is disabled. UPI payments require manual admin verification." });
});
paymentsRouter.get("/pay/:id", readLimit, async (req, res) => {
  const user = await currentUser(req);
  const id = paymentId(req.params.id);
  const [payment] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.id, id), eq(paymentsTable.userId, user.id)));
  if (!payment) fail(404, "Payment not found.");
  res.setHeader("Cache-Control", "no-store");
  res.json(paymentResponse(payment));
});
