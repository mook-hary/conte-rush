export const DEV_BYPASS_USER_ID = "dev-local-user";

export function isLocalDevHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function hasDevBypassQuery(search) {
  const raw = String(search ?? "");
  const query = raw.startsWith("?") ? raw.slice(1) : raw;
  return new URLSearchParams(query).get("devBypass") === "1";
}

export function isLocalDevBypassEnabled({ hostname, search } = {}) {
  return isLocalDevHost(hostname) && hasDevBypassQuery(search);
}

export function isSilentAuthRecheck({
  event,
  appInitialized,
  authState,
  initializedUserId,
  sessionUserId,
} = {}) {
  if (!appInitialized || !sessionUserId) {
    return false;
  }
  if (event === "TOKEN_REFRESHED") {
    return true;
  }
  if (event !== "SIGNED_IN") {
    return false;
  }
  return authState === "allowed" && initializedUserId === sessionUserId;
}

export function shouldClearIndexedDbDraft({ explicitLogout } = {}) {
  return explicitLogout === true;
}
