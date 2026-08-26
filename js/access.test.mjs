import assert from "node:assert/strict";
import test from "node:test";
import {
  accessLabel,
  effectiveAccess,
  isLikelyEmail,
  isLikelyOtp,
  isPaidStatus,
  isSupabaseRuntimeConfigReady,
  normalizeEmail,
  normalizeOtp,
} from "./access.js";

test("internal enabled wins over a paid subscription", () => {
  assert.equal(
    effectiveAccess({
      internalUser: { user_id: "u1", enabled: true },
      subscription: { status: "active" },
    }),
    "internal",
  );
});

test("disabled internal falls through to paid", () => {
  assert.equal(
    effectiveAccess({
      internalUser: { user_id: "u1", enabled: false },
      subscription: { status: "active" },
    }),
    "paid",
  );
});

test("active and trialing are paid", () => {
  assert.equal(effectiveAccess({ subscription: { status: "active" } }), "paid");
  assert.equal(effectiveAccess({ subscription: { status: "trialing" } }), "paid");
  assert.equal(isPaidStatus("active"), true);
  assert.equal(isPaidStatus("trialing"), true);
});

test("past_due and other statuses are none", () => {
  for (const status of ["past_due", "canceled", "unpaid", "incomplete", "paused", ""]) {
    assert.equal(effectiveAccess({ subscription: { status } }), "none", status);
    assert.equal(isPaidStatus(status), false, status);
  }
});

test("missing rows are none", () => {
  assert.equal(effectiveAccess({}), "none");
  assert.equal(effectiveAccess({ internalUser: null, subscription: null }), "none");
});

test("client clock / current_period_end does not change paid status", () => {
  assert.equal(
    effectiveAccess({
      subscription: {
        status: "active",
        current_period_end: "2000-01-01T00:00:00.000Z",
      },
    }),
    "paid",
  );
  assert.equal(
    effectiveAccess({
      subscription: {
        status: "past_due",
        current_period_end: "2099-01-01T00:00:00.000Z",
      },
    }),
    "none",
  );
});

test("access labels", () => {
  assert.equal(accessLabel("internal"), "社内");
  assert.equal(accessLabel("paid"), "契約中");
  assert.equal(accessLabel("none"), "なし");
});

test("runtime config rejects placeholders", () => {
  assert.equal(
    isSupabaseRuntimeConfigReady({
      supabaseUrl: "",
      supabaseAnonKey: "",
    }),
    false,
  );
  assert.equal(
    isSupabaseRuntimeConfigReady({
      supabaseUrl: "https://YOUR_PROJECT.supabase.co",
      supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
    }),
    false,
  );
  assert.equal(
    isSupabaseRuntimeConfigReady({
      supabaseUrl: "https://abcd.supabase.co",
      supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example",
      stripePaymentLinkUrl: "",
    }),
    true,
  );
});

test("email and otp helpers", () => {
  assert.equal(normalizeEmail("  A@B.C  "), "a@b.c");
  assert.equal(isLikelyEmail("user@example.com"), true);
  assert.equal(isLikelyEmail("not-an-email"), false);
  assert.equal(normalizeOtp(" 12 3456 "), "123456");
  assert.equal(isLikelyOtp("123456"), true);
  assert.equal(isLikelyOtp("12345678"), true);
  assert.equal(isLikelyOtp("abc"), false);
});
