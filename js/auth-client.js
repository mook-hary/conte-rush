import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";
import { runtimeConfig } from "./runtime-config.js";
import { normalizeEmail, normalizeOtp } from "./access.js?v=m11-0";

export const SUPABASE_JS_VERSION = "2.112.3";
export const SUPABASE_JS_ESM =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";

let client = null;

function authUrlParts() {
  const url = new URL(window.location.href);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return { url, hashParams: new URLSearchParams(hash) };
}

export function authRedirectUrl() {
  const url = new URL(window.location.href);
  return `${url.origin}${url.pathname}`;
}

export function readAuthCallbackError() {
  const { url, hashParams } = authUrlParts();
  return (
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error") ||
    ""
  );
}

export function hasAuthCodeParam() {
  const { url, hashParams } = authUrlParts();
  return (
    url.searchParams.has("code") ||
    hashParams.has("code") ||
    hashParams.has("access_token")
  );
}

export function hasAuthCallbackParams() {
  return Boolean(readAuthCallbackError()) || hasAuthCodeParam();
}

export function stripAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  ["code", "error", "error_code", "error_description"].forEach((key) => {
    url.searchParams.delete(key);
  });
  url.hash = "";
  const next = `${url.origin}${url.pathname}${url.search}`;
  const current = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) {
    window.history.replaceState({}, document.title, next);
  }
}

export function getSupabaseClient() {
  if (client) {
    return client;
  }
  // detectSessionInUrl is required for Magic Link / PKCE return.
  // Numeric OTP (verifyEmailOtp) does not depend on it.
  client = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export async function getSession() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    throw error;
  }
  return data.session ?? null;
}

export async function sendEmailOtp(email) {
  const normalized = normalizeEmail(email);
  // Temporary Magic Link: default SMTP cannot customize {{ .Token }} OTP mail.
  // After custom SMTP, Auth UI can call verifyEmailOtp again without changing this API.
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: authRedirectUrl(),
    },
  });
  if (error) {
    throw error;
  }
  return normalized;
}

export async function verifyEmailOtp(email, token) {
  // Kept for restoring numeric OTP UI after custom SMTP (D119).
  const { data, error } = await getSupabaseClient().auth.verifyOtp({
    email: normalizeEmail(email),
    token: normalizeOtp(token),
    type: "email",
  });
  if (error) {
    throw error;
  }
  return data.session ?? null;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) {
    throw error;
  }
}

export function onAuthStateChange(handler) {
  return getSupabaseClient().auth.onAuthStateChange(handler);
}

export async function fetchOwnAccessRows(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }
  const supabase = getSupabaseClient();
  const [internalResult, subscriptionResult] = await Promise.all([
    supabase
      .from("internal_users")
      .select("user_id, enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select(
        "user_id, provider, status, current_period_end, customer_id, subscription_id",
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (internalResult.error) {
    throw internalResult.error;
  }
  if (subscriptionResult.error) {
    throw subscriptionResult.error;
  }
  return {
    internalUser: internalResult.data,
    subscription: subscriptionResult.data,
  };
}
