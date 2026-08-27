/**
 * Billing helpers for M11.4. No secrets. Safe for node --test and Edge Functions.
 */

export const BLOCKING_SUBSCRIPTION_STATUSES = Object.freeze([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

export const DEFAULT_BILLING_RETURN_TARGETS = Object.freeze([
  { origin: "https://mook-hary.github.io", pathPrefix: "/conte-rush/" },
  { origin: "http://localhost:8080", pathPrefix: "/" },
  { origin: "http://127.0.0.1:8080", pathPrefix: "/" },
]);

export function isBlockingSubscriptionStatus(status) {
  return BLOCKING_SUBSCRIPTION_STATUSES.includes(String(status ?? ""));
}

export function subscriptionMatchesPrice(subscription, priceId) {
  const wanted = String(priceId ?? "");
  if (!wanted || !subscription || typeof subscription !== "object") {
    return false;
  }
  const items = subscription.items?.data;
  if (!Array.isArray(items)) {
    return false;
  }
  return items.some((item) => {
    const id = item?.price?.id ?? item?.plan?.id ?? "";
    return String(id) === wanted;
  });
}

export function findBlockingSubscription(subscriptions, priceId) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];
  return (
    list.find(
      (item) =>
        subscriptionMatchesPrice(item, priceId) &&
        isBlockingSubscriptionStatus(item?.status),
    ) ?? null
  );
}

export function canStartNewSubscription(status) {
  const value = String(status ?? "").trim();
  return !value || value === "canceled";
}

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

/**
 * Ignore webhook payloads that would replace a still-blocking row
 * with a different Stripe subscription id.
 */
export function shouldIgnoreIncomingStripeSubscription(existing, incomingSubscriptionId) {
  if (!existing?.subscription_id) {
    return false;
  }
  const incoming = String(incomingSubscriptionId ?? "").trim();
  if (!incoming || existing.subscription_id === incoming) {
    return false;
  }
  return isBlockingSubscriptionStatus(existing.status);
}

export function checkoutIdempotencyKey(userId, priceId) {
  return `conte-rush-checkout:${userId}:${priceId}`;
}

export function customerIdempotencyKey(userId) {
  return `conte-rush-customer:${userId}`;
}

export function advisoryLockKey(userId) {
  return `conte-rush-checkout:${userId}`;
}

export function normalizeStripeCustomerId(value) {
  const id = String(value ?? "").trim();
  return id.startsWith("cus_") ? id : "";
}

/**
 * Choose the next customer step from in-transaction reads.
 * stripe_customers is canonical. subscriptions.customer_id is a
 * migration fallback and must not steal another user's mapping.
 */
export function nextCheckoutCustomerStep({
  userId,
  mappedCustomerId,
  subscriptionCustomerId,
  fallbackOwnerUserId,
}) {
  const mapped = normalizeStripeCustomerId(mappedCustomerId);
  if (mapped) {
    return {
      type: "use",
      source: "stripe_customers",
      customerId: mapped,
      backfill: false,
      conflict: false,
    };
  }
  const fallback = normalizeStripeCustomerId(subscriptionCustomerId);
  if (fallback) {
    const owner = String(fallbackOwnerUserId ?? "").trim();
    if (!owner || owner === String(userId ?? "")) {
      return {
        type: "backfill",
        source: "subscriptions",
        customerId: fallback,
        backfill: true,
        conflict: false,
      };
    }
    return {
      type: "create",
      source: "create",
      customerId: "",
      backfill: false,
      conflict: true,
    };
  }
  return {
    type: "create",
    source: "create",
    customerId: "",
    backfill: false,
    conflict: false,
  };
}

export function findReusableCheckoutSession(sessions, userId) {
  const wanted = String(userId ?? "");
  const list = Array.isArray(sessions) ? sessions : [];
  return (
    list.find(
      (session) =>
        session?.mode === "subscription" &&
        session?.client_reference_id === wanted &&
        typeof session?.url === "string" &&
        session.url,
    ) ?? null
  );
}

export function sanitizeCheckoutLogMessage(text) {
  return String(text ?? "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[db-url]")
    .replace(/\b(sk|rk|whsec)_(live|test)?_[A-Za-z0-9]+/gi, "[secret]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\S+@\S+\.\S+/g, "[email]")
    .slice(0, 200);
}

export function stripeErrorLogFields(error) {
  if (!error || typeof error !== "object") {
    return {
      type: "Error",
      code: "",
      message: sanitizeCheckoutLogMessage(error),
    };
  }
  return {
    type: String(error.type ?? error.name ?? "Error"),
    code: String(error.code ?? ""),
    message: sanitizeCheckoutLogMessage(error.message),
  };
}

export function checkoutStageOf(error) {
  if (!error || typeof error !== "object") {
    return "unknown";
  }
  if (error.checkoutStage) {
    return String(error.checkoutStage);
  }
  return checkoutStageOf(error.cause);
}

export function checkoutFailureLog(stage, error) {
  return {
    stage: String(stage || checkoutStageOf(error) || "unknown"),
    ...stripeErrorLogFields(error),
  };
}

function markCheckoutStage(error, stage) {
  if (error && typeof error === "object") {
    error.checkoutStage = stage;
  }
  return error;
}

export async function resolveAndPersistCheckoutCustomer(io) {
  const userId = String(io.userId ?? "");
  const mapped = normalizeStripeCustomerId(await io.readMappedCustomerId());
  if (mapped) {
    return { customerId: mapped, source: "stripe_customers" };
  }
  const fallback = normalizeStripeCustomerId(await io.readSubscriptionCustomerId());
  const fallbackOwner = fallback ? String((await io.readCustomerOwnerUserId(fallback)) ?? "") : "";
  const step = nextCheckoutCustomerStep({
    userId,
    mappedCustomerId: mapped,
    subscriptionCustomerId: fallback,
    fallbackOwnerUserId: fallbackOwner,
  });

  if (step.type === "backfill") {
    const saved = normalizeStripeCustomerId(
      await io.insertStripeCustomerIfAbsent(userId, step.customerId),
    );
    if (saved) {
      return { customerId: saved, source: saved === step.customerId ? "subscriptions" : "stripe_customers" };
    }
  }

  const created = normalizeStripeCustomerId(await io.createStripeCustomer());
  if (!created) {
    throw new Error("stripe customer missing id");
  }
  const saved = normalizeStripeCustomerId(
    await io.insertStripeCustomerIfAbsent(userId, created),
  );
  if (!saved) {
    throw new Error("customer map missing");
  }
  return { customerId: saved, source: "create" };
}

/**
 * Holds caller-provided IO inside the existing Postgres transaction.
 * Does not COMMIT; the Edge Function transaction must stay open.
 */
export async function executeCheckoutInsideLock(io) {
  let stage = "customer_resolve";
  try {
    const resolved = await resolveAndPersistCheckoutCustomer(io);
    stage = "subscriptions.list";
    const subscriptions = await io.listSubscriptions(resolved.customerId);
    const blocking = findBlockingSubscription(subscriptions, io.priceId);
    if (blocking) {
      return {
        ok: true,
        action: "existing_subscription",
        status: blocking.status,
        cancel_at_period_end: Boolean(blocking.cancel_at_period_end),
      };
    }

    stage = "sessions.list";
    const openSessions = await io.listOpenCheckoutSessions(resolved.customerId);
    const reusable = findReusableCheckoutSession(openSessions, io.userId);
    if (reusable) {
      return { ok: true, action: "checkout", url: reusable.url };
    }

    stage = "sessions.create";
    const session = await io.createCheckoutSession(resolved.customerId);
    if (!session?.url) {
      throw new Error("checkout session missing url");
    }
    return { ok: true, action: "checkout", url: session.url };
  } catch (error) {
    throw markCheckoutStage(error, stage);
  }
}

function parseExtraReturnTargets(extraCsv) {
  const text = String(extraCsv ?? "").trim();
  if (!text) {
    return [];
  }
  const targets = [];
  for (const part of text.split(",")) {
    const raw = part.trim();
    if (!raw) {
      continue;
    }
    try {
      const url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
      const pathPrefix = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
      targets.push({ origin: url.origin, pathPrefix });
    } catch {
      continue;
    }
  }
  return targets;
}

export function allowedBillingReturnTargets(extraCsv) {
  return [...DEFAULT_BILLING_RETURN_TARGETS, ...parseExtraReturnTargets(extraCsv)];
}

export function resolveAllowedReturnUrl(candidate, extraCsv) {
  let parsed;
  try {
    parsed = new URL(String(candidate ?? ""));
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "";
  }
  const path = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  const match = allowedBillingReturnTargets(extraCsv).find((target) => {
    return parsed.origin === target.origin && path.startsWith(target.pathPrefix);
  });
  if (!match) {
    return "";
  }
  return `${match.origin}${match.pathPrefix}`;
}

export function withCheckoutSuccess(returnUrl) {
  const url = new URL(returnUrl);
  url.searchParams.set("checkout", "success");
  return url.toString();
}
