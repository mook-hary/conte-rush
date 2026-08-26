import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAccess, isPaidStatus } from "./access.js";
import {
  isAuthUserUuid,
  isHandledStripeEventType,
  mapStripeStatus,
  readCancelAtPeriodEnd,
  readCurrentPeriodEndIso,
  readPriceId,
  readStripeId,
  unixSecondsToIso,
} from "../supabase/functions/_shared/stripe-webhook-map.js";

test("accepts Auth user UUIDs and rejects other client_reference_id values", () => {
  assert.equal(isAuthUserUuid("11111111-2222-4333-8444-555555555555"), true);
  assert.equal(isAuthUserUuid(" 11111111-2222-4333-8444-555555555555 "), true);
  assert.equal(isAuthUserUuid(""), false);
  assert.equal(isAuthUserUuid("not-a-uuid"), false);
  assert.equal(isAuthUserUuid("user@example.com"), false);
  assert.equal(isAuthUserUuid("11111111222243338444555555555555"), false);
});

test("maps Stripe statuses onto the app enum", () => {
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("trialing"), "trialing");
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("canceled"), "canceled");
  assert.equal(mapStripeStatus("incomplete_expired"), "canceled");
  assert.equal(mapStripeStatus("unknown_status"), null);
});

test("reads period end from Basil items and legacy top-level fields", () => {
  assert.equal(unixSecondsToIso(1_700_000_000), "2023-11-14T22:13:20.000Z");
  assert.equal(
    readCurrentPeriodEndIso({ current_period_end: 1_700_000_000 }),
    "2023-11-14T22:13:20.000Z",
  );
  assert.equal(
    readCurrentPeriodEndIso({
      items: { data: [{ current_period_end: 1_700_000_000 }] },
    }),
    "2023-11-14T22:13:20.000Z",
  );
  assert.equal(readCurrentPeriodEndIso({}), null);
});

test("reads Stripe ids, price, and cancel_at_period_end", () => {
  assert.equal(readStripeId("cus_abc"), "cus_abc");
  assert.equal(readStripeId({ id: "sub_xyz" }), "sub_xyz");
  assert.equal(readStripeId(""), null);
  assert.equal(
    readPriceId({ items: { data: [{ price: { id: "price_123" } }] } }),
    "price_123",
  );
  assert.equal(readCancelAtPeriodEnd({ cancel_at_period_end: true }), true);
  assert.equal(readCancelAtPeriodEnd({ cancel_at_period_end: false }), false);
});

test("M11.3 mapping does not change paid access rules", () => {
  assert.equal(isPaidStatus("active"), true);
  assert.equal(isPaidStatus("trialing"), true);
  assert.equal(isPaidStatus("past_due"), false);
  assert.equal(isPaidStatus("canceled"), false);
  assert.equal(
    effectiveAccess({
      internalUser: { enabled: true },
      subscription: { status: "active" },
    }),
    "internal",
  );
  assert.equal(effectiveAccess({ subscription: { status: "active" } }), "paid");
  assert.equal(effectiveAccess({ subscription: { status: "canceled" } }), "none");
});

test("only the M11.3 Stripe event set is handled", () => {
  assert.equal(isHandledStripeEventType("checkout.session.completed"), true);
  assert.equal(isHandledStripeEventType("customer.subscription.updated"), true);
  assert.equal(isHandledStripeEventType("invoice.paid"), false);
  assert.equal(isHandledStripeEventType("invoice.payment_failed"), false);
});
