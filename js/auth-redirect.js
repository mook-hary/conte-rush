export function canonicalizeAuthRedirectUrl(href) {
  const url = new URL(href);
  let path = url.pathname;
  if (path.endsWith("/index.html")) {
    path = path.slice(0, -"index.html".length);
  }
  if (!path.endsWith("/")) {
    path += "/";
  }
  return `${url.origin}${path}`;
}

function parseAuthHref(href) {
  const url = new URL(href);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return { url, hashParams: new URLSearchParams(hash) };
}

export function readAuthCallbackErrorFromHref(href) {
  const { url, hashParams } = parseAuthHref(href);
  return (
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error") ||
    ""
  );
}

export function getAuthCallbackCodeFromHref(href) {
  const { url, hashParams } = parseAuthHref(href);
  return url.searchParams.get("code") || hashParams.get("code") || "";
}

export function hasAuthCodeParamFromHref(href) {
  const { url, hashParams } = parseAuthHref(href);
  return (
    url.searchParams.has("code") ||
    hashParams.has("code") ||
    hashParams.has("access_token")
  );
}

export function hrefWithoutAuthParams(href) {
  const url = new URL(href);
  ["code", "error", "error_code", "error_description"].forEach((key) => {
    url.searchParams.delete(key);
  });
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

export function isPkceVerifierMissingError(error) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return (
    name === "AuthPKCECodeVerifierMissingError" ||
    (message.includes("pkce") && message.includes("verifier"))
  );
}
