import test from "node:test";
import assert from "node:assert/strict";
import { SubmitPaymentReferenceBody, ReviewPaymentBody } from "@workspace/api-zod";
import { upiReady, upiIntent, savedUpiIntent, storedReference, isDuplicateReference, assertReviewable, PRO_AMOUNT } from "./upi-model";

const config = { id: "frames-test@examplebank", name: "Frames test" };
const claim = { environment: "manual_upi", amount: 4900, currency: "INR", orderId: "UPI:123456789012", status: "PENDING_REVIEW" };
test("QR encodes exactly ₹49 INR, recipient, payee and unique order reference", () => {
  const uri = new URL(upiIntent("frames-test-reference", config));
  assert.equal(uri.protocol, "upi:");
  assert.equal(uri.hostname, "pay");
  assert.equal(uri.searchParams.get("pa"), config.id);
  assert.equal(uri.searchParams.get("pn"), config.name);
  assert.equal(uri.searchParams.get("am"), "49.00");
  assert.equal(uri.searchParams.get("cu"), "INR");
  assert.equal(uri.searchParams.get("tr"), "frames-test-reference");
  assert.equal(PRO_AMOUNT, 4900);
});
test("UPI recipient config cannot supply a URL, control chars or injected query", () => {
  assert.equal(upiReady(config), true);
  for (const id of ["", "https://evil.test", "person@bank&am=1", "person@bank\n", "person"]) {
    assert.equal(upiReady({ ...config, id }), false);
  }
  assert.equal(upiReady({ ...config, name: "Bad\nname" }), false);
});
test("existing order preserves its original payee and amount regardless of later config changes", () => {
  const uri = upiIntent("reference", config);
  assert.deepEqual(savedUpiIntent(uri, "reference"), { uri, ...config });
  assert.equal(savedUpiIntent(uri, "different-reference"), null);
  assert.equal(savedUpiIntent(uri.replace("49.00", "1.00"), "reference"), null);
  assert.equal(savedUpiIntent(uri.replace("INR", "USD"), "reference"), null);
  assert.equal(savedUpiIntent("https://example.test", "reference"), null);
});
test("only a 12-digit UPI reference is accepted; claim input cannot specify paid or Pro", () => {
  assert.equal(storedReference("123456789012"), "UPI:123456789012");
  for (const value of ["", "123", "1234567890123", "abcdefghijkl", "12345678901 ", "1e1234567890"]) {
    assert.throws(() => storedReference(value));
    assert.equal(SubmitPaymentReferenceBody.safeParse({ transactionReference: value }).success, false);
  }
  assert.deepEqual(SubmitPaymentReferenceBody.parse({ transactionReference: "123456789012", paid: true, pro: true, userId: 2 }),
    { transactionReference: "123456789012" });
});
test("admin approval requires an explicit true receipt confirmation", () => {
  assert.throws(() => assertReviewable(claim, "approve", false), /Confirm/);
  assert.equal(assertReviewable(claim, "approve", true), true);
  assert.equal(ReviewPaymentBody.safeParse({ decision: "approve", confirmed: "true" }).success, false);
  assert.equal(ReviewPaymentBody.safeParse({ decision: "approve" }).success, false);
  assert.equal(ReviewPaymentBody.safeParse({ decision: "grant_pro", confirmed: true }).success, false);
});
test("rejection does not require claiming receipt", () => {
  assert.equal(assertReviewable(claim, "reject", false), true);
});
for (const [field, value] of [["amount", 1], ["currency", "USD"], ["environment", "uat"], ["status", "AWAITING_PAYMENT"], ["orderId", null], ["orderId", "UPI:fake"]] as const) {
  test(`cannot approve a mismatched or unsubmitted claim (${field}=${value})`, () => {
    assert.throws(() => assertReviewable({ ...claim, [field]: value }, "approve", true));
  });
}
test("terminal decisions are idempotent and cannot be reversed", () => {
  assert.equal(assertReviewable({ ...claim, status: "PROCESSED" }, "approve", true), false);
  assert.equal(assertReviewable({ ...claim, status: "REJECTED" }, "reject", false), false);
  assert.throws(() => assertReviewable({ ...claim, status: "REJECTED" }, "approve", true));
  assert.throws(() => assertReviewable({ ...claim, status: "PROCESSED" }, "reject", false));
});
test("unique reference collisions from PostgreSQL or wrapped Drizzle errors are recognized", () => {
  assert.equal(isDuplicateReference({ code: "23505" }), true);
  assert.equal(isDuplicateReference({ cause: { code: "23505" } }), true);
  assert.equal(isDuplicateReference({ code: "500" }), false);
  assert.equal(isDuplicateReference(null), false);
});
