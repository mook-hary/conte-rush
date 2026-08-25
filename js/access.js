export const PAID_STATUSES = Object.freeze(["active", "trialing"]);

export function isPaidStatus(status) {
  return PAID_STATUSES.includes(String(status ?? ""));
}

export function isEnabledInternalUser(internalUser) {
  return Boolean(internalUser) && internalUser.enabled === true;
}

/**
 * Derive entitlement. Status is the source of truth for paid access.
 * current_period_end is auxiliary and must not be decided by the client clock.
 */
export function effectiveAccess({ internalUser = null, subscription = null } = {}) {
  if (isEnabledInternalUser(internalUser)) {
    return "internal";
  }
  if (subscription && isPaidStatus(subscription.status)) {
    return "paid";
  }
  return "none";
}

export function accessLabel(access) {
  if (access === "internal") {
    return "社内";
  }
  if (access === "paid") {
    return "契約中";
  }
  return "なし";
}

export function isPlaceholderValue(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return true;
  }
  return /YOUR_|REPLACE_ME|TODO|placeholder/i.test(text);
}

export function isSupabaseRuntimeConfigReady(config) {
  const url = String(config?.supabaseUrl ?? "").trim();
  const anonKey = String(config?.supabaseAnonKey ?? "").trim();
  if (isPlaceholderValue(url) || isPlaceholderValue(anonKey)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isLikelyEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeOtp(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

export function isLikelyOtp(value) {
  return /^[0-9]{6,8}$/.test(normalizeOtp(value));
}
