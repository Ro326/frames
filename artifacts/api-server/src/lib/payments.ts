import { db, paymentsTable, usersTable, agentEventsTable, eq, type StoredPayment } from "@workspace/db";
import { pineRequest, validatePineOrder } from "./pinelabs-client";

export function paymentResponse(payment: StoredPayment) {
  return {
    id: payment.id, userId: payment.userId, merchantReference: payment.merchantReference,
    orderId: payment.orderId, amount: payment.amount, currency: payment.currency,
    environment: payment.environment, status: payment.status,
    paid: payment.status === "PROCESSED" && payment.verifiedAt !== null,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(),
  };
}
export async function paymentEvent(payment: StoredPayment, status: string, operation: string) {
  await db.insert(agentEventsTable).values({
    userId: payment.userId, agentName: "Pine Labs", inputSummary: `${operation}: Frames Pro ₹49, payment ${payment.id}`,
    outputJson: { operation, status, order_id: payment.orderId, merchant_reference: payment.merchantReference,
      amount_paise: payment.amount, environment: payment.environment, timestamp: new Date().toISOString() },
  });
}

export async function verifyPayment(payment: StoredPayment): Promise<StoredPayment> {
  if (!payment.orderId || payment.environment !== "uat") throw new Error("This payment has no verifiable UAT order.");
  let verified: ReturnType<typeof validatePineOrder>;
  try {
    const response = await pineRequest(`/api/pay/v1/orders/${encodeURIComponent(payment.orderId)}`);
    verified = validatePineOrder(response, {
      orderId: payment.orderId, merchantReference: payment.merchantReference, merchantId: process.env.PINELABS_MERCHANT_ID ?? "",
    });
  } catch {
    await paymentEvent(payment, "VERIFICATION_FAILED", "verify");
    throw Object.assign(new Error("Pine Labs could not verify this payment. Pro has not been changed. Please check again shortly."), { status: 502 });
  }
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).for("update");
    if (!locked) throw new Error("Payment record missing.");
    // Replayed notifications are safe; a stale pending response cannot undo success.
    const status = locked.status === "PROCESSED" ? "PROCESSED" : verified.status;
    const [updated] = await tx.update(paymentsTable).set({
      status, verifiedAt: new Date(),
    }).where(eq(paymentsTable.id, payment.id)).returning();
    if (verified.paid) await tx.update(usersTable).set({ pro: true }).where(eq(usersTable.id, locked.userId));
    await tx.insert(agentEventsTable).values({
      userId: locked.userId, agentName: "Pine Labs", inputSummary: `Verify order ${locked.orderId}`,
      outputJson: { operation: "verify", status: verified.status, order_id: locked.orderId,
        timestamp: new Date().toISOString(), paid: verified.paid, environment: locked.environment, amount_paise: locked.amount },
    });
    return updated!;
  });
}
