import assert from "node:assert/strict";
import test from "node:test";
import {
  DEV_BYPASS_USER_ID,
  hasDevBypassQuery,
  isLocalDevBypassEnabled,
  isLocalDevHost,
  isSilentAuthRecheck,
  shouldClearIndexedDbDraft,
} from "./gate-policy.js";

test("dev bypass user id is stable", () => {
  assert.equal(DEV_BYPASS_USER_ID, "dev-local-user");
});

test("dev bypass is only localhost or 127.0.0.1 with the query flag", () => {
  assert.equal(
    isLocalDevBypassEnabled({ hostname: "localhost", search: "?devBypass=1" }),
    true,
  );
  assert.equal(
    isLocalDevBypassEnabled({ hostname: "127.0.0.1", search: "devBypass=1" }),
    true,
  );
  assert.equal(
    isLocalDevBypassEnabled({ hostname: "localhost", search: "" }),
    false,
  );
  assert.equal(
    isLocalDevBypassEnabled({ hostname: "localhost", search: "?devBypass=true" }),
    false,
  );
  assert.equal(
    isLocalDevBypassEnabled({
      hostname: "mook-hary.github.io",
      search: "?devBypass=1",
    }),
    false,
  );
  assert.equal(
    isLocalDevBypassEnabled({
      hostname: "conte-rush.localhost",
      search: "?devBypass=1",
    }),
    false,
  );
  assert.equal(isLocalDevHost("localhost"), true);
  assert.equal(isLocalDevHost("127.0.0.1"), true);
  assert.equal(isLocalDevHost("::1"), false);
  assert.equal(hasDevBypassQuery("?foo=1&devBypass=1"), true);
});

test("same-user SIGNED_IN while allowed is silent", () => {
  assert.equal(
    isSilentAuthRecheck({
      event: "SIGNED_IN",
      appInitialized: true,
      authState: "allowed",
      initializedUserId: "user-1",
      sessionUserId: "user-1",
    }),
    true,
  );
});

test("fresh SIGNED_IN login is not silent", () => {
  assert.equal(
    isSilentAuthRecheck({
      event: "SIGNED_IN",
      appInitialized: false,
      authState: "loading",
      initializedUserId: null,
      sessionUserId: "user-1",
    }),
    false,
  );
  assert.equal(
    isSilentAuthRecheck({
      event: "SIGNED_IN",
      appInitialized: true,
      authState: "denied",
      initializedUserId: "user-1",
      sessionUserId: "user-1",
    }),
    false,
  );
  assert.equal(
    isSilentAuthRecheck({
      event: "SIGNED_IN",
      appInitialized: true,
      authState: "allowed",
      initializedUserId: "user-1",
      sessionUserId: "user-2",
    }),
    false,
  );
});

test("TOKEN_REFRESHED is silent once the app is initialized", () => {
  assert.equal(
    isSilentAuthRecheck({
      event: "TOKEN_REFRESHED",
      appInitialized: true,
      authState: "allowed",
      initializedUserId: "user-1",
      sessionUserId: "user-1",
    }),
    true,
  );
  assert.equal(
    isSilentAuthRecheck({
      event: "TOKEN_REFRESHED",
      appInitialized: false,
      authState: "loading",
      initializedUserId: null,
      sessionUserId: "user-1",
    }),
    false,
  );
});

test("IndexedDB projects are never cleared by logout policy", () => {
  assert.equal(shouldClearIndexedDbDraft({ explicitLogout: true }), false);
  assert.equal(shouldClearIndexedDbDraft({ explicitLogout: false }), false);
  assert.equal(shouldClearIndexedDbDraft({}), false);
});

test("access-gate keeps IndexedDB projects on unauth and logout", async () => {
  const { readFile } = await import("node:fs/promises");
  const gate = await readFile(new URL("./access-gate.js", import.meta.url), "utf8");
  assert.equal(gate.includes("isSilentAuthRecheck"), true);
  assert.equal(gate.includes("isLocalDevBypassEnabled"), true);
  assert.match(
    gate,
    /async function enterUnauthenticated\(\)[\s\S]*?teardownApp\(\{ clearPersistence: false \}\)/,
  );
  assert.match(
    gate,
    /async function handleLogout\(\)[\s\S]*?teardownApp\(\{ clearPersistence: false \}\)/,
  );
  assert.equal(gate.includes("auth.signOut()"), true);
  const logout = gate.slice(gate.indexOf("async function handleLogout"));
  const logoutBody = logout.slice(0, logout.indexOf("async function handleDeniedCheckout"));
  assert.equal(logoutBody.includes("if (devBypassActive)"), true);
  assert.equal(logoutBody.includes("await auth.signOut()"), true);
  assert.equal(logoutBody.includes("clearPersistence: true"), false);
});
