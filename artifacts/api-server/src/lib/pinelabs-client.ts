import { randomUUID } from "node:crypto";
import { z } from "zod";

export const PRO_AMOUNT = 4900;
export const PINE_BASE = "https://pluraluat.v2.pinepg.in";
export function pineReady() {
  return !!(process.env.PINELABS_MERCHANT_ID && process.env.PINELABS_CLIENT_ID &&
    process.env.PINELABS_CLIENT_SECRET && (process.env.PINELABS_ENV ?? "uat") === "uat");
}

let token: { value: string; until: number } | undefined;
let tokenRequest: Promise<string> | undefined;
async function accessToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    if (!pineReady()) throw new Error("Pine Labs UAT credentials are not configured.");
    const response = await fetch(`${PINE_BASE}/api/auth/v1/token`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ client_id: process.env.PINELABS_CLIENT_ID, client_secret: process.env.PINELABS_CLIENT_SECRET, grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Pine Labs authentication failed (HTTP ${response.status}).`);
    const data = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await response.json());
    token = { value: data.access_token, until: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
    return token.value;
  })();
  try { return await tokenRequest; } finally { tokenRequest = undefined; }
}
function headers(): Record<string, string> {
  return { Accept: "application/json", "Content-Type": "application/json", "Request-ID": randomUUID(), "Request-Timestamp": new Date().toISOString() };
}
export async function pineRequest(path: string, body?: unknown): Promise<unknown> {
  // Only fixed Pine Labs UAT endpoints; callers cannot supply another host.
  const response = await fetch(`${PINE_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...headers(), Authorization: `Bearer ${await accessToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401) token = undefined;
  if (!response.ok) throw new Error(`Pine Labs request failed (HTTP ${response.status}).`);
  return response.json();
}

export function validateCheckoutResponse(value: unknown) {
  const parsed = z.object({ order_id: z.string().min(1).max(200), redirect_url: z.string().url() }).parse(value);
  const url = new URL(parsed.redirect_url);
  const allowed = ["pinepg.in", "pluralonline.com", "pluralpay.in"];
  if (url.protocol !== "https:" || url.username || url.password ||
    !allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error("Pine Labs returned an unexpected checkout URL.");
  }
  return parsed;
}

const money = z.object({ value: z.number().int(), currency: z.string() });
export function validatePineOrder(value: unknown, expected: {
  orderId: string; merchantReference: string; merchantId: string;
}) {
  const { data } = z.object({ data: z.object({
    order_id: z.string(), merchant_order_reference: z.string(), merchant_id: z.union([z.string(), z.number()]),
    type: z.string(), status: z.string(), order_amount: money,
    payments: z.array(z.object({ status: z.string(), payment_amount: money })).optional(),
  }) }).parse(value);
  if (data.order_id !== expected.orderId || data.merchant_order_reference !== expected.merchantReference ||
    String(data.merchant_id) !== expected.merchantId || data.type !== "CHARGE" ||
    data.order_amount.value !== PRO_AMOUNT || data.order_amount.currency !== "INR") {
    throw new Error("Payment verification mismatch. Pro has not been granted.");
  }
  // AUTHORIZED, PENDING, redirect parameters and webhook statuses never unlock Pro.
  const paid = data.status === "PROCESSED";
  if (paid) {
    const captured = data.payments?.filter((payment) => payment.status === "PROCESSED");
    if (!captured?.length || captured.some((payment) => payment.payment_amount.currency !== "INR") ||
      captured.reduce((sum, payment) => sum + payment.payment_amount.value, 0) !== PRO_AMOUNT) {
      throw new Error("Pine Labs has not confirmed the full ₹49 payment.");
    }
  }
  return { status: data.status, paid };
}
