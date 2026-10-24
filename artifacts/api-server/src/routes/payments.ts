import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { db, paymentsTable, usersTable, eq, and, desc } from "@workspace/db";
import { currentUser, fail } from "../lib/frames";
import { pineReady, pineRequest, PRO_AMOUNT, validateCheckoutResponse } from "../lib/pinelabs-client";
import { paymentEvent, paymentResponse, verifyPayment } from "../lib/payments";

export const paymentsRouter = Router();
const checkoutLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
const verifyLimit = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false });

function callbackOrigin(req: Request): string {
  const configured = process.env.PAYMENT_PUBLIC_URL;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const candidate = new URL(configured || req.get("origin") || `https://${host}`);
  if (candidate.protocol !== "https:" || candidate.username || candidate.password ||
    (!configured && candidate.host !== host)) fail(400, "Could not determine the secure payment return URL.");
  return candidate.origin;
}
paymentsRouter.post("/pay", checkoutLimit, async (req, res) => {
  const user = await currentUser(req);
  if (user.pro) fail(409, "Frames Pro is already active.");
  if (!pineReady()) fail(503, "Pine Labs UAT checkout needs PINELABS_MERCHANT_ID, PINELABS_CLIENT_ID and PINELABS_CLIENT_SECRET in Secrets, with PINELABS_ENV=uat.");
  const origin = callbackOrigin(req);
  const payment = await db.transaction(async (tx) => {
    await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).for("update");
    const [recent] = await tx.select().from(paymentsTable).where(and(
      eq(paymentsTable.userId, user.id), eq(paymentsTable.environment, "uat"),
    )).orderBy(desc(paymentsTable.createdAt)).limit(1);
    if (recent && Date.now() - recent.createdAt.getTime() < 15 * 60_000) {
      if (recent.status === "CREATED" && recent.checkoutUrl) return recent;
      if (recent.status === "CREATING") fail(409, "A checkout is already being prepared. Please try again shortly.");
    }
    const [created] = await tx.insert(paymentsTable).values({
      userId: user.id, merchantReference: `frames-${user.id}-${randomUUID()}`, amount: PRO_AMOUNT,
    }).returning();
    return created!;
  });
  if (payment.checkoutUrl) { res.json({ url: payment.checkoutUrl, paymentId: payment.id }); return; }
  try {
    const callback = `${origin}/api/pay/callback?payment=${payment.id}`;
    const result = validateCheckoutResponse(await pineRequest("/api/checkout/v1/orders", {
      merchant_order_reference: payment.merchantReference,
      order_amount: { value: PRO_AMOUNT, currency: "INR" }, integration_mode: "REDIRECT", pre_auth: false,
      callback_url: callback, failure_callback_url: callback, notes: `Frames Pro user ${user.id}`,
      purchase_details: { customer: { customer_id: String(user.id), email_id: user.email, first_name: user.name },
        merchant_metadata: { frames_user_id: String(user.id), product: "frames_pro" } },
    }));
    const [saved] = await db.update(paymentsTable).set({
      orderId: result.order_id, checkoutUrl: result.redirect_url, status: "CREATED",
    }).where(eq(paymentsTable.id, payment.id)).returning();
    await paymentEvent(saved!, "CREATED", "create");
    res.json({ url: result.redirect_url, paymentId: payment.id });
  } catch {
    await db.update(paymentsTable).set({ status: "CREATION_FAILED" }).where(eq(paymentsTable.id, payment.id));
    await paymentEvent(payment, "CREATION_FAILED", "create");
    fail(502, "Pine Labs could not create checkout. No Pro access has been granted. Check the UAT merchant credentials and try again.");
  }
});

// Notifications are untrusted hints. Never consume their amount/status/user ID
// as proof: look up our own order and fetch its complete status from Pine Labs.
paymentsRouter.all("/pay/callback", verifyLimit, async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) { res.sendStatus(405); return; }
  const id = Number(req.query.payment);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, "Invalid payment reference.");
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!payment) fail(404, "Payment not found.");
  try { await verifyPayment(payment); } catch { /* Result page retries server verification, never assumes success. */ }
  res.setHeader("Cache-Control", "no-store");
  res.redirect(303, `/payment/result?payment=${payment.id}`);
});
paymentsRouter.post("/pay/webhook", verifyLimit, async (req, res) => {
  const orderId = req.body?.data?.order_id ?? req.body?.order_id ?? req.body?.orderId;
  if (typeof orderId !== "string" || orderId.length > 200) fail(400, "Missing order identifier.");
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId));
  if (!payment) fail(404, "Unknown payment order.");
  await verifyPayment(payment);
  res.json({ status: "verified" });
});
paymentsRouter.get("/pay/:id", verifyLimit, async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, "Invalid payment reference.");
  const [payment] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.id, id), eq(paymentsTable.userId, user.id)));
  if (!payment) fail(404, "Payment not found.");
  res.setHeader("Cache-Control", "no-store");
  const confirmed = payment.status === "PROCESSED" && payment.verifiedAt !== null;
  res.json(paymentResponse(!confirmed && payment.orderId ? await verifyPayment(payment) : payment));
});
