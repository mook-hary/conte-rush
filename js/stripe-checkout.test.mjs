import assert from "node:assert/strict";
import test from "node:test";
import { hasCheckoutSuccessParam, hrefWithoutCheckoutSuccess } from "./stripe-checkout.js";
import {
  deniedUpgradeMode as browserDeniedUpgradeMode,
  shouldShowAccountPortal as browserShouldShowAccountPortal,
} from "./billing-ui.js";
import {
  canStartNewSubscription,
  checkoutFailureLog,
  checkoutIdempotencyKey,
  checkoutStageOf,
  deniedUpgradeMode,
  executeCheckoutInsideLock,
  findBlockingSubscription,
  isBlockingSubscriptionStatus,
  nextCheckoutCustomerStep,
  resolveAllowedReturnUrl,
  shouldIgnoreIncomingStripeSubscription,
  shouldShowAccountPortal,
  withCheckoutSuccess,
} from "../supabase/functions/_shared/billing.js";

const PRICE = "price_conte_rush";

test("checkout=success detection does not imply paid", () => {
  assert.equal(
    hasCheckoutSuccessParam("https://example.com/conte-rush/?checkout=success"),
    true,
  );
  assert.equal(
    hasCheckoutSuccessParam("https://example.com/conte-rush/?checkout=cancel"),
    false,
  );
  const next = hrefWithoutCheckoutSuccess(
    "https://example.com/conte-rush/?checkout=success&keep=1#gate",
  );
  assert.equal(next, "/conte-rush/?keep=1#gate");
  assert.match(next, /keep=1/);
  assert.doesNotMatch(next, /checkout=/);
});

test("blocking statuses cannot start a new subscription", () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
    assert.equal(isBlockingSubscriptionStatus(status), true, status);
    assert.equal(canStartNewSubscription(status), false, status);
  }
  assert.equal(canStartNewSubscription("canceled"), true);
  assert.equal(canStartNewSubscription(""), true);
});

test("finds a blocking subscription for the conte-rush price only", () => {
  const blocking = findBlockingSubscription(
    [
      {
        id: "sub_other",
        status: "active",
        items: { data: [{ price: { id: "price_other" } }] },
      },
      {
        id: "sub_ours",
        status: "past_due",
        items: { data: [{ price: { id: PRICE } }] },
      },
    ],
    PRICE,
  );
  assert.equal(blocking.id, "sub_ours");
  assert.equal(
    findBlockingSubscription(
      [
        {
          id: "sub_canceled",
          status: "canceled",
          items: { data: [{ price: { id: PRICE } }] },
        },
      ],
      PRICE,
    ),
    null,
  );
});

test("denied upgrade mode sends past_due to portal", () => {
  assert.equal(deniedUpgradeMode({ status: "past_due" }), "portal");
  assert.equal(deniedUpgradeMode({ status: "canceled" }), "checkout");
  assert.equal(deniedUpgradeMode(null), "checkout");
  assert.equal(browserDeniedUpgradeMode({ status: "past_due" }), "portal");
  assert.equal(browserDeniedUpgradeMode({ status: "unpaid" }), "portal");
  assert.equal(browserDeniedUpgradeMode({ status: "incomplete" }), "portal");
  assert.equal(browserDeniedUpgradeMode({ status: "paused" }), "portal");
  assert.equal(browserDeniedUpgradeMode({ status: "canceled" }), "checkout");
  assert.equal(browserDeniedUpgradeMode(null), "checkout");
});

test("account portal is shown for paid and for internal with a customer", () => {
  assert.equal(shouldShowAccountPortal("paid", { status: "active" }), true);
  assert.equal(shouldShowAccountPortal("internal", { customer_id: "cus_1" }), true);
  assert.equal(shouldShowAccountPortal("internal", {}), false);
  assert.equal(shouldShowAccountPortal("none", { customer_id: "cus_1" }), false);
  assert.equal(browserShouldShowAccountPortal("paid", { status: "active" }), true);
  assert.equal(browserShouldShowAccountPortal("internal", { customer_id: "cus_1" }), true);
  assert.equal(
    browserShouldShowAccountPortal("internal", { subscription_id: "sub_1" }),
    true,
  );
  assert.equal(browserShouldShowAccountPortal("internal", {}), false);
  assert.equal(browserShouldShowAccountPortal("none", { customer_id: "cus_1" }), false);
});

test("access-gate does not import Edge Function _shared billing", async () => {
  const { readFile } = await import("node:fs/promises");
  const gate = await readFile(new URL("./access-gate.js", import.meta.url), "utf8");
  assert.match(gate, /from "\.\/billing-ui\.js\?v=m11-8-gate-fix"/);
  assert.equal(gate.includes("supabase/functions/_shared/billing.js"), false);
});

test("webhook does not overwrite a different blocking subscription", () => {
  assert.equal(
    shouldIgnoreIncomingStripeSubscription(
      { subscription_id: "sub_old", status: "active" },
      "sub_new",
    ),
    true,
  );
  assert.equal(
    shouldIgnoreIncomingStripeSubscription(
      { subscription_id: "sub_old", status: "canceled" },
      "sub_new",
    ),
    false,
  );
  assert.equal(
    shouldIgnoreIncomingStripeSubscription(
      { subscription_id: "sub_same", status: "active" },
      "sub_same",
    ),
    false,
  );
});

test("return URLs are allowlisted", () => {
  assert.equal(
    resolveAllowedReturnUrl("https://mook-hary.github.io/conte-rush/"),
    "https://mook-hary.github.io/conte-rush/",
  );
  assert.equal(resolveAllowedReturnUrl("http://localhost:8080/"), "http://localhost:8080/");
  assert.equal(resolveAllowedReturnUrl("https://evil.example/conte-rush/"), "");
  assert.equal(
    withCheckoutSuccess("https://mook-hary.github.io/conte-rush/").includes("checkout=success"),
    true,
  );
});

test("idempotency keys are stable per user and price", () => {
  const user = "11111111-2222-4333-8444-555555555555";
  assert.equal(
    checkoutIdempotencyKey(user, PRICE),
    checkoutIdempotencyKey(user, PRICE),
  );
  assert.notEqual(checkoutIdempotencyKey(user, PRICE), checkoutIdempotencyKey(user, "price_other"));
});

const USER_A = "11111111-2222-4333-8444-555555555555";
const USER_B = "22222222-3333-4444-8555-666666666666";

function activeSub(customerId = "cus_existing") {
  return {
    id: "sub_paid",
    customer: customerId,
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ price: { id: PRICE } }] },
  };
}

function memoryCheckoutIo({
  userId = USER_A,
  mapped = "",
  subscriptionCustomerId = "",
  otherOwners = {},
  subscriptionsByCustomer = {},
  openSessionsByCustomer = {},
} = {}) {
  const customers = new Map();
  const owners = new Map(Object.entries(otherOwners));
  if (mapped) {
    customers.set(userId, mapped);
    owners.set(mapped, userId);
  }
  const calls = {
    createStripeCustomer: 0,
    insert: [],
    listSubscriptions: [],
    listOpenCheckoutSessions: [],
    createCheckoutSession: 0,
  };
  return {
    userId,
    priceId: PRICE,
    calls,
    customers,
    async readMappedCustomerId() {
      return customers.get(userId) ?? "";
    },
    async readSubscriptionCustomerId() {
      return subscriptionCustomerId;
    },
    async readCustomerOwnerUserId(customerId) {
      return owners.get(customerId) ?? "";
    },
    async insertStripeCustomerIfAbsent(nextUserId, customerId) {
      calls.insert.push({ userId: nextUserId, customerId });
      const owner = owners.get(customerId);
      if (owner && owner !== nextUserId) {
        return customers.get(nextUserId) ?? "";
      }
      if (customers.has(nextUserId)) {
        return customers.get(nextUserId);
      }
      customers.set(nextUserId, customerId);
      owners.set(customerId, nextUserId);
      return customerId;
    },
    async createStripeCustomer() {
      calls.createStripeCustomer += 1;
      return "cus_created";
    },
    async listSubscriptions(customerId) {
      calls.listSubscriptions.push(customerId);
      return subscriptionsByCustomer[customerId] ?? [];
    },
    async listOpenCheckoutSessions(customerId) {
      calls.listOpenCheckoutSessions.push(customerId);
      return openSessionsByCustomer[customerId] ?? [];
    },
    async createCheckoutSession() {
      calls.createCheckoutSession += 1;
      return { url: "https://checkout.stripe.com/c/pay/cs_test_new" };
    },
  };
}

test("stripe_customers mapping is used and Stripe customer create is skipped", async () => {
  const io = memoryCheckoutIo({
    mapped: "cus_mapped",
    subscriptionCustomerId: "cus_from_sub",
    subscriptionsByCustomer: { cus_mapped: [activeSub("cus_mapped")] },
  });
  const result = await executeCheckoutInsideLock(io);
  assert.equal(result.action, "existing_subscription");
  assert.equal(io.calls.createStripeCustomer, 0);
  assert.equal(io.calls.createCheckoutSession, 0);
  assert.deepEqual(io.calls.listSubscriptions, ["cus_mapped"]);
  assert.equal(io.calls.insert.length, 0);
});

test("subscriptions.customer_id fallback reuses the existing customer and backfills", async () => {
  const io = memoryCheckoutIo({
    subscriptionCustomerId: "cus_from_sub",
    subscriptionsByCustomer: { cus_from_sub: [activeSub("cus_from_sub")] },
  });
  const result = await executeCheckoutInsideLock(io);
  assert.equal(result.ok, true);
  assert.equal(result.action, "existing_subscription");
  assert.equal(result.status, "active");
  assert.equal(io.calls.createStripeCustomer, 0);
  assert.equal(io.calls.createCheckoutSession, 0);
  assert.deepEqual(io.calls.insert, [{ userId: USER_A, customerId: "cus_from_sub" }]);
  assert.equal(io.customers.get(USER_A), "cus_from_sub");
  assert.deepEqual(io.calls.listSubscriptions, ["cus_from_sub"]);
  assert.equal(io.calls.listOpenCheckoutSessions.length, 0);
});

test("blocking active subscription does not create a Checkout Session", async () => {
  const io = memoryCheckoutIo({
    mapped: "cus_mapped",
    subscriptionsByCustomer: { cus_mapped: [activeSub("cus_mapped")] },
  });
  const result = await executeCheckoutInsideLock(io);
  assert.equal(result.action, "existing_subscription");
  assert.equal(io.calls.createCheckoutSession, 0);
  assert.equal(io.calls.listOpenCheckoutSessions.length, 0);
});

test("no mapping and no subscription customer creates a Stripe customer", async () => {
  const io = memoryCheckoutIo();
  const result = await executeCheckoutInsideLock(io);
  assert.equal(result.action, "checkout");
  assert.equal(io.calls.createStripeCustomer, 1);
  assert.equal(io.calls.createCheckoutSession, 1);
  assert.deepEqual(io.calls.insert, [{ userId: USER_A, customerId: "cus_created" }]);
  assert.equal(io.customers.get(USER_A), "cus_created");
});

test("does not steal another user's stripe_customers customer_id", async () => {
  const io = memoryCheckoutIo({
    subscriptionCustomerId: "cus_other",
    otherOwners: { cus_other: USER_B },
  });
  const result = await executeCheckoutInsideLock(io);
  assert.equal(result.action, "checkout");
  assert.equal(io.calls.createStripeCustomer, 1);
  assert.equal(io.customers.get(USER_A), "cus_created");
  assert.equal(io.customers.get(USER_B), undefined);
  assert.equal(io.calls.insert.some((row) => row.customerId === "cus_other"), false);
});

test("nextCheckoutCustomerStep prefers stripe_customers over subscriptions", () => {
  const step = nextCheckoutCustomerStep({
    userId: USER_A,
    mappedCustomerId: "cus_mapped",
    subscriptionCustomerId: "cus_from_sub",
    fallbackOwnerUserId: "",
  });
  assert.equal(step.type, "use");
  assert.equal(step.customerId, "cus_mapped");
  assert.equal(step.backfill, false);
});

test("checkout failure logs include stage and redact secrets", async () => {
  const io = memoryCheckoutIo({ mapped: "cus_mapped" });
  io.listSubscriptions = async () => {
    const error = new Error("No such customer: cus_mapped for user@example.com sk_test_abc");
    error.type = "StripeInvalidRequestError";
    error.code = "resource_missing";
    throw error;
  };
  await assert.rejects(
    () => executeCheckoutInsideLock(io),
    (error) => {
      assert.equal(checkoutStageOf(error), "subscriptions.list");
      const log = checkoutFailureLog(checkoutStageOf(error), error);
      assert.equal(log.stage, "subscriptions.list");
      assert.equal(log.type, "StripeInvalidRequestError");
      assert.equal(log.code, "resource_missing");
      assert.equal(log.message.includes("sk_test_"), false);
      assert.equal(log.message.includes("user@example.com"), false);
      assert.match(log.message, /\[secret\]/);
      assert.match(log.message, /\[email\]/);
      return true;
    },
  );
});
