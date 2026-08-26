import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";
import { runtimeConfig } from "./runtime-config.js";
import { normalizeEmail, normalizeOtp } from "./access.js?v=m11-2-1";
import {
  canonicalizeAuthRedirectUrl,
  getAuthCallbackCodeFromHref,
  hasAuthCodeParamFromHref,
  hrefWithoutAuthParams,
  isPkceVerifierMissingError,
  readAuthCallbackErrorFromHref,
} from "./auth-redirect.js?v=m11-2-1";

export const SUPABASE_JS_VERSION = "2.112.3";
export const SUPABASE_JS_ESM =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";

export {
  canonicalizeAuthRedirectUrl,
  isPkceVerifierMissingError,
};

let client = null;

export function authRedirectUrl() {
  return canonicalizeAuthRedirectUrl(window.location.href);
}

export function readAuthCallbackError() {
  return readAuthCallbackErrorFromHref(window.location.href);
}

export function getAuthCallbackCode() {
  return getAuthCallbackCodeFromHref(window.location.href);
}

export function hasAuthCodeParam() {
  return hasAuthCodeParamFromHref(window.location.href);
}

export function hasAuthCallbackParams() {
  return Boolean(readAuthCallbackError()) || hasAuthCodeParam();
}

export function stripAuthParamsFromUrl() {
  const next = hrefWithoutAuthParams(window.location.href);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) {
    window.history.replaceState({}, document.title, next);
  }
}

export function getSupabaseClient() {
  if (client) {
    return client;
  }
  client = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
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

function authCallbackFailureMessage(error) {
  if (isPkceVerifierMissingError(error)) {
    return "ログインリンクを、メールを送った同じブラウザで開いてください。";
  }
  const detail = String(error?.message ?? "").trim();
  return detail
    ? `ログインリンクの確認に失敗しました。${detail}`
    : "ログインリンクの確認に失敗しました。もう一度送ってください。";
}

/**
 * Finish PKCE Magic Link return. Does not change access / Stripe state.
 * Auth failures are returned as { error } for the login screen, not thrown.
 */
export async function establishSessionFromUrl() {
  const existing = await getSession();
  if (existing) {
    stripAuthParamsFromUrl();
    return { session: existing, error: null };
  }

  const redirectError = readAuthCallbackError();
  if (redirectError) {
    stripAuthParamsFromUrl();
    return {
      session: null,
      error: `ログインリンクを確認できませんでした。${redirectError}`,
    };
  }

  const code = getAuthCallbackCode();
  if (!code) {
    return { session: null, error: null };
  }

  try {
    const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
    stripAuthParamsFromUrl();
    if (error) {
      return { session: null, error: authCallbackFailureMessage(error) };
    }
    return { session: data.session ?? null, error: null };
  } catch (error) {
    stripAuthParamsFromUrl();
    return { session: null, error: authCallbackFailureMessage(error) };
  }
}

export async function sendEmailOtp(email) {
  const normalized = normalizeEmail(email);
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
