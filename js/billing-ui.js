/**
 * Browser-only billing UI helpers. No Stripe secrets.
 * Keep in sync with deniedUpgradeMode / shouldShowAccountPortal
 * in supabase/functions/_shared/billing.js.
 */

export function deniedUpgradeMode(subscription) {
  const status = String(subscription?.status ?? "");
  if (["past_due", "unpaid", "incomplete", "paused"].includes(status)) {
    return "portal";
  }
  return "checkout";
}

export function shouldShowAccountPortal(access, subscription) {
  if (access === "paid") {
    return true;
  }
  if (access === "internal") {
    return Boolean(subscription?.customer_id || subscription?.subscription_id);
  }
  return false;
}
