/**
 * Stripe → conte-rush subscription mapping.
 * No Stripe SDK, no secrets. Safe for node --test and Edge Functions.
 */

export const APP_SUBSCRIPTION_STATUSES = Object.freeze([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "paused",
]);

export const STRIPE_STATUS_TO_APP = Object.freeze({
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "unpaid",
  incomplete: "incomplete",
  paused: "paused",
  canceled: "canceled",
  incomplete_expired: "canceled",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAuthUserUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

export function mapStripeStatus(status) {
  const key = String(status ?? "").trim();
  return STRIPE_STATUS_TO_APP[key] ?? null;
}

export function unixSecondsToIso(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function readCurrentPeriodEndIso(subscription) {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }
  if (Number.isFinite(subscription.current_period_end)) {
    return unixSecondsToIso(subscription.current_period_end);
  }
  const item = subscription.items?.data?.[0];
  if (item && Number.isFinite(item.current_period_end)) {
    return unixSecondsToIso(item.current_period_end);
  }
  return null;
}

export function readPriceId(subscription) {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id ?? item?.plan?.id ?? null;
  return typeof priceId === "string" && priceId ? priceId : null;
}

export function readStripeId(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const id = value.trim();
    return id || null;
  }
  if (typeof value === "object" && typeof value.id === "string") {
    const id = value.id.trim();
    return id || null;
  }
  return null;
}

export function readCancelAtPeriodEnd(subscription) {
  return Boolean(subscription?.cancel_at_period_end);
}

export function handledStripeEventTypes() {
  return Object.freeze([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]);
}

export function isHandledStripeEventType(type) {
  return handledStripeEventTypes().includes(String(type ?? ""));
}
