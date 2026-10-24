import test from "node:test";
import assert from "node:assert/strict";
import { validatePineOrder, validateCheckoutResponse } from "./pinelabs-client";
import { localCoverage, parseCoverageResponse, type CoverageProject } from "./coverage-model";

const expected = { orderId: "order-test", merchantReference: "frames-user-test", merchantId: "merchant-test" };
const paidOrder = () => ({ data: {
  order_id: expected.orderId, merchant_order_reference: expected.merchantReference, merchant_id: expected.merchantId,
  type: "CHARGE", status: "PROCESSED", order_amount: { value: 4900, currency: "INR" },
  payments: [{ status: "PROCESSED", payment_amount: { value: 4900, currency: "INR" } }],
} });
test("₹49 means 4900 paise; only independently confirmed full payment is accepted", () => {
  assert.deepEqual(validatePineOrder(paidOrder(), expected), { status: "PROCESSED", paid: true });
});
for (const status of ["PENDING", "AUTHORIZED", "CREATED", "FAILED", "CANCELLED"]) {
  test(`${status} cannot grant Pro even when a notification claims success`, () => {
    const order = paidOrder(); order.data.status = status;
    assert.equal(validatePineOrder(order, expected).paid, false);
  });
}
for (const field of ["order_id", "merchant_order_reference", "merchant_id", "type"] as const) {
  test(`rejects mismatched ${field}`, () => {
    const order = paidOrder(); order.data[field] = "wrong";
    assert.throws(() => validatePineOrder(order, expected));
  });
}
test("rejects wrong amount, currency, partial capture, missing proof and refunded orders", () => {
  for (const bad of [49, 4899, 5000]) {
    const order = paidOrder(); order.data.order_amount.value = bad;
    assert.throws(() => validatePineOrder(order, expected));
  }
  const order = paidOrder(); order.data.payments[0]!.payment_amount.value = 49;
  assert.throws(() => validatePineOrder(order, expected));
  order.data.payments = [];
  assert.throws(() => validatePineOrder(order, expected));
  order.data.order_amount.currency = "USD";
  assert.throws(() => validatePineOrder(order, expected));
  const refunded = paidOrder(); refunded.data.status = "FULLY_REFUNDED";
  assert.equal(validatePineOrder(refunded, expected).paid, false);
});
test("only trusted HTTPS Pine Labs checkout domains can be returned", () => {
  assert.ok(validateCheckoutResponse({ order_id: "test", redirect_url: "https://pluraluat.v2.pinepg.in/checkout" }));
  for (const url of ["http://pluralonline.com/pay", "https://pluralpay.in.evil.test/pay", "https://evil.test", "javascript:alert(1)"]) {
    assert.throws(() => validateCheckoutResponse({ order_id: "test", redirect_url: url }));
  }
});
const shots = [
  { id: "shot-one", description: "Opening wide", approved: true, verdict: { match: false, confidence: 0.8, verdict: "Too tight", fix: "Step back" } },
  { id: "shot-two", description: "Detail", approved: false },
] as CoverageProject["shots"];
test("local fallback respects Approve anyway rather than only the AI verdict", () => {
  const result = localCoverage({ shots });
  assert.equal(result.coverage_pct, 50);
  assert.equal(result.slots[0]!.status, "approved");
  assert.equal(result.next_shot?.slot, "shot-two");
  assert.equal(result.source, "local");
});
const report = () => ({
  coverage_pct: 50, status: "One shot to go",
  slots: [{ slot: 1, status: "approved" }, { slot: 2, status: "missing" }],
  next_shot: { slot: 2, instruction: "Film a close detail" },
});
test("normalises numbered slots and extracts documented A2A output envelopes", () => {
  const result = parseCoverageResponse({ result: { output: JSON.stringify(report()) } }, { shots });
  assert.equal(result.next_shot?.slot, "shot-two");
  assert.equal(result.source, "agenticorg");
  assert.equal(result.coverage_pct, 50);
});
test("rejects invented shots, missing slots, duplicate slots and approval overrides", () => {
  const invalid = report(); invalid.slots[1]!.slot = 999;
  assert.throws(() => parseCoverageResponse(invalid, { shots }));
  const duplicate = report(); duplicate.slots[1]!.slot = 1;
  assert.throws(() => parseCoverageResponse(duplicate, { shots }));
  const override = report(); override.slots[0]!.status = "missing";
  assert.throws(() => parseCoverageResponse(override, { shots }));
  assert.throws(() => parseCoverageResponse({ ...report(), slots: [] }, { shots }));
  assert.throws(() => parseCoverageResponse({ ...report(), coverage_pct: 100 }, { shots }));
});
test("finished projects have 100 percent coverage and no next shot", () => {
  const result = localCoverage({ shots: shots.map((shot) => ({ ...shot, approved: true })) });
  assert.equal(result.coverage_pct, 100);
  assert.equal(result.next_shot, null);
  assert.equal(localCoverage({ shots: [] }).coverage_pct, 0);
});
