import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeAuthRedirectUrl,
  getAuthCallbackCodeFromHref,
  hasAuthCodeParamFromHref,
  hrefWithoutAuthParams,
  isPkceVerifierMissingError,
  readAuthCallbackErrorFromHref,
} from "./auth-redirect.js";

test("canonicalizes GitHub Pages and localhost redirect URLs with a trailing slash", () => {
  assert.equal(
    canonicalizeAuthRedirectUrl("https://mook-hary.github.io/conte-rush"),
    "https://mook-hary.github.io/conte-rush/",
  );
  assert.equal(
    canonicalizeAuthRedirectUrl("https://mook-hary.github.io/conte-rush/"),
    "https://mook-hary.github.io/conte-rush/",
  );
  assert.equal(
    canonicalizeAuthRedirectUrl("https://mook-hary.github.io/conte-rush/index.html"),
    "https://mook-hary.github.io/conte-rush/",
  );
  assert.equal(
    canonicalizeAuthRedirectUrl("http://localhost:8080"),
    "http://localhost:8080/",
  );
  assert.equal(
    canonicalizeAuthRedirectUrl("http://localhost:8080/"),
    "http://localhost:8080/",
  );
  assert.equal(
    canonicalizeAuthRedirectUrl("http://127.0.0.1:8080/index.html"),
    "http://127.0.0.1:8080/",
  );
});

test("detects PKCE code without treating checkout query as auth", () => {
  assert.equal(
    hasAuthCodeParamFromHref("https://mook-hary.github.io/conte-rush/?code=abc"),
    true,
  );
  assert.equal(
    getAuthCallbackCodeFromHref("https://mook-hary.github.io/conte-rush/?code=abc&checkout=success"),
    "abc",
  );
  assert.equal(
    hasAuthCodeParamFromHref("https://mook-hary.github.io/conte-rush/?checkout=success"),
    false,
  );
});

test("strips auth params and keeps other query values", () => {
  assert.equal(
    hrefWithoutAuthParams(
      "https://mook-hary.github.io/conte-rush/?code=abc&checkout=success#access_token=x",
    ),
    "/conte-rush/?checkout=success",
  );
});

test("reads callback errors and PKCE verifier missing", () => {
  assert.equal(
    readAuthCallbackErrorFromHref(
      "https://mook-hary.github.io/conte-rush/?error=access_denied&error_description=Nope",
    ),
    "Nope",
  );
  assert.equal(
    isPkceVerifierMissingError({
      name: "AuthPKCECodeVerifierMissingError",
      message: "PKCE code verifier not found in storage",
    }),
    true,
  );
  assert.equal(isPkceVerifierMissingError({ message: "network down" }), false);
});
