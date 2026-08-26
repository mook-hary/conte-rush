import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStripeCheckoutUrl,
  hasCheckoutSuccessParam,
  hrefWithoutCheckoutSuccess,
  isStripePaymentLinkReady,
} from "./stripe-checkout.js";

const BASE = "https://buy.stripe.com/test_abc";
const USER_ID = "11111111-2222-4333-8444-555555555555";

test("empty and placeholder payment links are not ready", () => {
  assert.equal(isStripePaymentLinkReady(""), false);
  assert.equal(isStripePaymentLinkReady("   "), false);
  assert.equal(isStripePaymentLinkReady("YOUR_PAYMENT_LINK"), false);
  assert.equal(isStripePaymentLinkReady("https://buy.stripe.com/test_abc"), true);
});

test("builds client_reference_id and prefilled_email", () => {
  const href = buildStripeCheckoutUrl({
    paymentLinkUrl: BASE,
    userId: USER_ID,
    email: "user@example.com",
  });
  const url = new URL(href);
  assert.equal(url.origin + url.pathname, BASE);
  assert.equal(url.searchParams.get("client_reference_id"), USER_ID);
  assert.equal(url.searchParams.get("prefilled_email"), "user@example.com");
});

test("omits prefilled_email when session has no email", () => {
  const href = buildStripeCheckoutUrl({
    paymentLinkUrl: `${BASE}?utm_source=app`,
    userId: USER_ID,
    email: "  ",
  });
  const url = new URL(href);
  assert.equal(url.searchParams.get("client_reference_id"), USER_ID);
  assert.equal(url.searchParams.has("prefilled_email"), false);
  assert.equal(url.searchParams.get("utm_source"), "app");
});

test("keeps existing query parameters on the payment link", () => {
  const href = buildStripeCheckoutUrl({
    paymentLinkUrl: `${BASE}?locale=ja&utm_campaign=m11`,
    userId: USER_ID,
    email: "a@b.c",
  });
  const url = new URL(href);
  assert.equal(url.searchParams.get("locale"), "ja");
  assert.equal(url.searchParams.get("utm_campaign"), "m11");
  assert.equal(url.searchParams.get("client_reference_id"), USER_ID);
  assert.equal(url.searchParams.get("prefilled_email"), "a@b.c");
});

test("refuses a missing session user id", () => {
  assert.throws(
    () =>
      buildStripeCheckoutUrl({
        paymentLinkUrl: BASE,
        userId: "",
        email: "user@example.com",
      }),
    /user id is required/,
  );
  assert.throws(
    () =>
      buildStripeCheckoutUrl({
        paymentLinkUrl: BASE,
        email: "user@example.com",
      }),
    /user id is required/,
  );
});

test("refuses an unconfigured payment link", () => {
  assert.throws(
    () =>
      buildStripeCheckoutUrl({
        paymentLinkUrl: "",
        userId: USER_ID,
      }),
    /not configured/,
  );
});

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
