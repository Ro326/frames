export const PRO_AMOUNT = 4900;
export const UPI_ENVIRONMENT = "manual_upi";
type UpiConfig = { id: string; name: string };
export const upiConfig = (): UpiConfig => ({
  id: (process.env.FRAMES_UPI_ID || "").trim(),
  name: (process.env.FRAMES_UPI_PAYEE_NAME || "").trim(),
});
export function upiReady(config = upiConfig()): boolean {
  return /^[a-zA-Z0-9._-]{2,200}@[a-zA-Z0-9.-]{2,80}$/.test(config.id) &&
    config.name.length > 0 && config.name.length <= 80 && !/[\u0000-\u001f]/.test(config.name);
}
export function upiIntent(reference: string, config = upiConfig()): string {
  if (!upiReady(config)) throw Object.assign(new Error("UPI checkout is not configured."), { status: 503 });
  return `upi://pay?${new URLSearchParams({
    pa: config.id, pn: config.name, am: (PRO_AMOUNT / 100).toFixed(2), cu: "INR",
    tr: reference, tn: "Frames Pro",
  })}`;
}
export function storedReference(reference: string): string {
  if (!/^[0-9]{12}$/.test(reference)) throw Object.assign(new Error("Enter the 12-digit UPI transaction reference from your payment app."), { status: 400 });
  return `UPI:${reference}`;
}
export function savedUpiIntent(uri: string | null, reference: string) {
  try {
    const url = new URL(uri || "");
    const config = { id: url.searchParams.get("pa") || "", name: url.searchParams.get("pn") || "" };
    if (url.protocol !== "upi:" || url.hostname !== "pay" || !upiReady(config) ||
      url.searchParams.get("am") !== "49.00" || url.searchParams.get("cu") !== "INR" ||
      url.searchParams.get("tr") !== reference) return null;
    return { uri: url.href, ...config };
  } catch { return null; }
}
export function isDuplicateReference(error: unknown): boolean {
  for (let i = 0; error && typeof error === "object" && i < 4; i++) {
    if ((error as { code?: string }).code === "23505") return true;
    error = (error as { cause?: unknown }).cause;
  }
  return false;
}
export function assertReviewable(
  payment: { environment: string; status: string; amount: number; currency: string; orderId: string | null },
  decision: "approve" | "reject", confirmed: boolean,
): boolean {
  const reject = (message: string) => { throw Object.assign(new Error(message), { status: 409 }); };
  if (payment.environment !== UPI_ENVIRONMENT) reject("Only manual UPI claims can be reviewed here.");
  if (payment.amount !== PRO_AMOUNT || payment.currency !== "INR") reject("Payment amount or currency does not match Frames Pro.");
  if (decision === "approve" && !confirmed) reject("Confirm that the receiving account actually received ₹49 with this exact UPI reference.");
  if (payment.status === (decision === "approve" ? "PROCESSED" : "REJECTED")) return false;
  if (payment.status !== "PENDING_REVIEW" || !/^UPI:[0-9]{12}$/.test(payment.orderId || "")) {
    reject("This payment is not awaiting review with a valid transaction reference.");
  }
  return true;
}
