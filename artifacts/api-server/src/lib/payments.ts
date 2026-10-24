import { paymentsTable, usersTable, agentEventsTable, db, eq, type StoredPayment } from "@workspace/db";
import { assertReviewable, savedUpiIntent, UPI_ENVIRONMENT } from "./upi-model";

export function paymentResponse(payment: StoredPayment) {
  const manual = payment.environment === UPI_ENVIRONMENT;
  const intent = manual ? savedUpiIntent(payment.checkoutUrl, payment.merchantReference) : null;
  return {
    id: payment.id, userId: payment.userId, merchantReference: payment.merchantReference,
    orderId: payment.orderId, amount: payment.amount, currency: payment.currency,
    environment: payment.environment, status: payment.status,
    paid: payment.status === "PROCESSED" && payment.verifiedAt !== null,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(),
    upiUri: intent?.uri ?? null, upiId: intent?.id ?? null, payeeName: intent?.name ?? null,
    transactionReference: manual && payment.orderId?.startsWith("UPI:") ? payment.orderId.slice(4) : null,
  };
}
export function paymentAudit(payment: StoredPayment, operation: string, confirmed = false) {
  return {
    userId: payment.userId, agentName: "UPI Payment",
    inputSummary: `${operation}: Frames Pro ₹49, payment ${payment.id}`,
    humanDecision: operation === "approve" ? "Approved after manually checking receipt" : operation === "reject" ? "Rejected after manual review" : null,
    outputJson: {
      operation, status: payment.status, payment_id: payment.id,
      transaction_reference: payment.orderId, merchant_reference: payment.merchantReference,
      amount_paise: payment.amount, currency: payment.currency, environment: payment.environment,
      receipt_confirmed_by_admin: confirmed, timestamp: new Date().toISOString(),
    },
  };
}
export async function reviewManualPayment(id: number, decision: "approve" | "reject", confirmed: boolean) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, id)).for("update");
    if (!payment) throw Object.assign(new Error("Payment not found."), { status: 404 });
    if (!assertReviewable(payment, decision, confirmed)) return payment;
    const approved = decision === "approve";
    const [updated] = await tx.update(paymentsTable).set({
      status: approved ? "PROCESSED" : "REJECTED", verifiedAt: approved ? new Date() : null,
    }).where(eq(paymentsTable.id, payment.id)).returning();
    if (approved) await tx.update(usersTable).set({ pro: true }).where(eq(usersTable.id, payment.userId));
    await tx.insert(agentEventsTable).values(paymentAudit(updated!, decision, approved));
    return updated!;
  });
}
