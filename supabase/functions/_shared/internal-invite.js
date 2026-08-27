/**
 * Internal invite code helpers. No secrets. Safe for node --test and Edge Functions.
 */

export const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const INVITE_PREFIX = "CR";
export const INVITE_BODY_LENGTH = 10;
export const INVITE_MAX_USES_DEFAULT = 20;
export const INVITE_FAIL_LIMIT = 8;
export const INVITE_FAIL_WINDOW_MS = 15 * 60 * 1000;

const NORMALIZED_RE = new RegExp(
  `^${INVITE_PREFIX}[${INVITE_ALPHABET}]{${INVITE_BODY_LENGTH}}$`,
);

export function normalizeInviteCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, "");
}

export function isNormalizedInviteCode(value) {
  return NORMALIZED_RE.test(String(value ?? ""));
}

export function formatInviteCode(normalized) {
  const text = normalizeInviteCode(normalized);
  if (!isNormalizedInviteCode(text)) {
    return "";
  }
  const body = text.slice(INVITE_PREFIX.length);
  return `${INVITE_PREFIX}-${body.slice(0, 5)}-${body.slice(5)}`;
}

export async function hashNormalizedInviteCode(normalized) {
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isInviteRateLimited(attempt, nowMs = Date.now()) {
  if (!attempt) {
    return false;
  }
  const started = Date.parse(String(attempt.window_started_at ?? ""));
  if (!Number.isFinite(started) || nowMs - started >= INVITE_FAIL_WINDOW_MS) {
    return false;
  }
  return Number(attempt.fail_count ?? 0) >= INVITE_FAIL_LIMIT;
}

export function nextInviteFailAttempt(attempt, nowMs = Date.now()) {
  const started = Date.parse(String(attempt?.window_started_at ?? ""));
  const inWindow =
    Number.isFinite(started) && nowMs - started < INVITE_FAIL_WINDOW_MS;
  if (!inWindow) {
    return {
      fail_count: 1,
      window_started_at: new Date(nowMs).toISOString(),
    };
  }
  return {
    fail_count: Number(attempt.fail_count ?? 0) + 1,
    window_started_at: attempt.window_started_at,
  };
}
