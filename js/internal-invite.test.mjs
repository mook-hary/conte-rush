import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAccess } from "./access.js";
import {
  formatInviteCode,
  hashNormalizedInviteCode,
  INVITE_ALPHABET,
  INVITE_FAIL_LIMIT,
  isInviteRateLimited,
  isNormalizedInviteCode,
  nextInviteFailAttempt,
  normalizeInviteCode,
} from "../supabase/functions/_shared/internal-invite.js";

test("normalizes invite codes and rejects bad shapes", () => {
  assert.equal(normalizeInviteCode(" cr-ab2de-fghjk "), "CRAB2DEFGHJK");
  assert.equal(INVITE_ALPHABET.length, 31);
  assert.equal(/[01IOL]/.test(INVITE_ALPHABET), false);
  assert.equal(isNormalizedInviteCode("CR23456ABCDE"), true);
  assert.equal(isNormalizedInviteCode("CR23456ABCD"), false);
  assert.equal(isNormalizedInviteCode("CR23456ABCDO"), false);
  assert.equal(isNormalizedInviteCode("CR23456ABCDL"), false);
  assert.equal(isNormalizedInviteCode("CR23456ABCDI"), false);
  assert.equal(isNormalizedInviteCode("CR23456ABCD0"), false);
  assert.equal(formatInviteCode("CR23456ABCDE"), "CR-23456-ABCDE");
});

test("hyphenated and compact codes hash to the same value", async () => {
  const compact = normalizeInviteCode("CR23456ABCDE");
  const hyphenated = normalizeInviteCode("CR-23456-ABCDE");
  assert.equal(compact, hyphenated);
  assert.equal(
    await hashNormalizedInviteCode(compact),
    await hashNormalizedInviteCode(hyphenated),
  );
  assert.notEqual(
    await hashNormalizedInviteCode("CR23456ABCDE"),
    await hashNormalizedInviteCode("CR23456ABCDF"),
  );
});

test("rate limit locks after 8 failures in a 15 minute window", () => {
  const windowStart = "2026-08-27T00:00:00.000Z";
  const inside = Date.parse("2026-08-27T00:14:59.000Z");
  const expired = Date.parse("2026-08-27T00:15:00.000Z");
  assert.equal(
    isInviteRateLimited({ fail_count: 7, window_started_at: windowStart }, inside),
    false,
  );
  assert.equal(
    isInviteRateLimited({ fail_count: 8, window_started_at: windowStart }, inside),
    true,
  );
  assert.equal(
    isInviteRateLimited({ fail_count: 8, window_started_at: windowStart }, expired),
    false,
  );
  const next = nextInviteFailAttempt(
    { fail_count: 7, window_started_at: windowStart },
    inside,
  );
  assert.equal(next.fail_count, INVITE_FAIL_LIMIT);
  assert.equal(next.window_started_at, windowStart);
});

test("invite success does not change paid vs internal derivation", () => {
  assert.equal(
    effectiveAccess({
      internalUser: { enabled: true },
      subscription: { status: "active" },
    }),
    "internal",
  );
  assert.equal(effectiveAccess({ subscription: { status: "active" } }), "paid");
});
