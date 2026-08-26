import {
  accessLabel,
  effectiveAccess,
  isLikelyEmail,
  isSupabaseRuntimeConfigReady,
} from "./access.js?v=m11-2";
import { runtimeConfig } from "./runtime-config.js";
import {
  buildStripeCheckoutUrl,
  hasCheckoutSuccessParam,
  isStripePaymentLinkReady,
  stripCheckoutSuccessFromLocation,
} from "./stripe-checkout.js?v=m11-2";

const APP_MODULE_URL = new URL("./app.js?v=m11-2", import.meta.url).href;
const AUTH_MODULE_URL = new URL("./auth-client.js?v=m11-3", import.meta.url).href;

const gateEl = document.querySelector("#auth-gate");
const loginForm = document.querySelector("#gate-login-form");
const emailInput = document.querySelector("#gate-email");
const sendLinkButton = document.querySelector("#gate-send-link");
const loginMessageEl = document.querySelector("#gate-login-message");
const accountEmailEl = document.querySelector("#account-email");
const accountAccessEl = document.querySelector("#account-access");
const checkoutButton = document.querySelector("#denied-checkout");
const checkoutRecheckButton = document.querySelector("#denied-recheck");
const checkoutStatusEl = document.querySelector("#denied-checkout-status");

let authState = "loading";
let appModule = null;
let appInitialized = false;
let initializedUserId = null;
let accessCheckSeq = 0;
let sendingLink = false;
let pendingEmail = "";
let signingOut = false;
let currentAccess = "none";
let authApi = null;
let authSubscription = null;
let awaitingAuthCallback = false;
let pendingCheckoutSuccess = false;
let checkoutConfirming = false;
let checkoutAutoRecheckDone = false;
let checkoutAutoRecheckTimer = null;
let checkoutRecheckInFlight = false;
let openingCheckout = false;
let deniedCheckoutError = "";

const CHECKOUT_AUTO_RECHECK_MS = 4000;

async function loadAuthApi() {
  if (!authApi) {
    authApi = await import(AUTH_MODULE_URL);
  }
  return authApi;
}

function setAuthState(nextState) {
  authState = nextState;
  document.body.dataset.authState = nextState;
  if (!gateEl) {
    return;
  }
  for (const panel of gateEl.querySelectorAll("[data-gate-panel]")) {
    panel.hidden = panel.dataset.gatePanel !== nextState;
  }
}

function setLoginMessage(text, isError = false) {
  if (!loginMessageEl) {
    return;
  }
  loginMessageEl.textContent = text;
  loginMessageEl.classList.toggle("is-error", Boolean(isError && text));
}

function setBusy(busy) {
  if (emailInput) {
    emailInput.disabled = busy;
  }
  if (sendLinkButton) {
    sendLinkButton.disabled = busy || sendingLink;
  }
}

function isPaymentLinkConfigured() {
  return isStripePaymentLinkReady(runtimeConfig.stripePaymentLinkUrl);
}

function syncDeniedCheckoutUi({ successNote = false } = {}) {
  const configured = isPaymentLinkConfigured();
  const showConfirming = successNote || checkoutConfirming;
  if (checkoutButton) {
    checkoutButton.hidden = !configured;
    checkoutButton.disabled = !configured || openingCheckout || checkoutRecheckInFlight;
  }
  if (checkoutRecheckButton) {
    checkoutRecheckButton.hidden = !showConfirming;
    checkoutRecheckButton.disabled = checkoutRecheckInFlight;
  }
  if (!checkoutStatusEl) {
    return;
  }
  if (showConfirming) {
    checkoutStatusEl.textContent =
      "決済を確認しています。反映まで数秒かかることがあります。";
    checkoutStatusEl.classList.remove("is-error");
    return;
  }
  if (deniedCheckoutError) {
    checkoutStatusEl.textContent = deniedCheckoutError;
    checkoutStatusEl.classList.add("is-error");
    return;
  }
  if (!configured) {
    checkoutStatusEl.textContent = "決済設定を準備中です";
    checkoutStatusEl.classList.remove("is-error");
    return;
  }
  checkoutStatusEl.textContent = "";
  checkoutStatusEl.classList.remove("is-error");
}

function settleCheckoutSuccessQuery() {
  if (!pendingCheckoutSuccess) {
    return;
  }
  pendingCheckoutSuccess = false;
  if (authState === "denied") {
    checkoutConfirming = true;
    deniedCheckoutError = "";
    syncDeniedCheckoutUi({ successNote: true });
    scheduleOneCheckoutRecheck();
  } else {
    checkoutConfirming = false;
    clearCheckoutAutoRecheck();
  }
  stripCheckoutSuccessFromLocation();
}

function clearCheckoutAutoRecheck() {
  if (checkoutAutoRecheckTimer) {
    clearTimeout(checkoutAutoRecheckTimer);
    checkoutAutoRecheckTimer = null;
  }
}

function scheduleOneCheckoutRecheck() {
  if (checkoutAutoRecheckDone || checkoutAutoRecheckTimer) {
    return;
  }
  checkoutAutoRecheckTimer = setTimeout(() => {
    checkoutAutoRecheckTimer = null;
    void handleDeniedAccessRecheck({ automatic: true });
  }, CHECKOUT_AUTO_RECHECK_MS);
}

async function loadAppModule() {
  if (!appModule) {
    appModule = await import(APP_MODULE_URL);
  }
  return appModule;
}

async function initializeAppIfNeeded(userId) {
  if (appInitialized && initializedUserId === userId) {
    return;
  }
  if (appInitialized && initializedUserId && initializedUserId !== userId) {
    await teardownApp();
  }
  const app = await loadAppModule();
  app.initializeConteRush();
  appInitialized = true;
  initializedUserId = userId;
}

async function teardownApp() {
  if (!appModule) {
    appInitialized = false;
    initializedUserId = null;
    return;
  }
  await appModule.resetConteRushSession();
  appInitialized = false;
  initializedUserId = null;
}

function renderAccount(session, access) {
  const email = session?.user?.email ?? "";
  if (accountEmailEl) {
    accountEmailEl.textContent = email ? `ログイン中: ${email}` : "";
  }
  if (accountAccessEl) {
    accountAccessEl.textContent = `利用権: ${accessLabel(access)}`;
  }
}

async function enterUnauthenticated() {
  currentAccess = "none";
  pendingEmail = pendingEmail || "";
  checkoutConfirming = false;
  clearCheckoutAutoRecheck();
  await teardownApp();
  setAuthState("unauthenticated");
  setBusy(false);
  settleCheckoutSuccessQuery();
}

async function checkAccess(session, { silent = false } = {}) {
  const seq = ++accessCheckSeq;
  const userId = session?.user?.id;
  if (!userId) {
    await enterUnauthenticated();
    return;
  }

  if (!silent) {
    setAuthState("checking_access");
    setBusy(true);
  }

  let rows;
  try {
    const auth = await loadAuthApi();
    rows = await auth.fetchOwnAccessRows(userId);
  } catch (error) {
    if (seq !== accessCheckSeq) {
      return;
    }
    console.error(error);
    currentAccess = "none";
    await teardownApp();
    setAuthState("network_error");
    setBusy(false);
    settleCheckoutSuccessQuery();
    return;
  }

  if (seq !== accessCheckSeq) {
    return;
  }

  const access = effectiveAccess(rows);
  currentAccess = access;
  renderAccount(session, access);

  if (access === "none") {
    await teardownApp();
    setAuthState("denied");
    setBusy(false);
    deniedCheckoutError = "";
    syncDeniedCheckoutUi();
    settleCheckoutSuccessQuery();
    return;
  }

  checkoutConfirming = false;
  clearCheckoutAutoRecheck();

  try {
    await initializeAppIfNeeded(userId);
  } catch (error) {
    if (seq !== accessCheckSeq) {
      return;
    }
    console.error(error);
    await teardownApp();
    setAuthState("network_error");
    setBusy(false);
    settleCheckoutSuccessQuery();
    return;
  }

  if (seq !== accessCheckSeq) {
    return;
  }

  setAuthState("allowed");
  setBusy(false);
  settleCheckoutSuccessQuery();
}

async function handleAuthEvent(event, session) {
  if (signingOut && event !== "SIGNED_OUT") {
    return;
  }
  if (!session) {
    const auth = await loadAuthApi();
    if (event !== "SIGNED_OUT" && (awaitingAuthCallback || auth.hasAuthCodeParam())) {
      return;
    }
    if (event === "INITIAL_SESSION") {
      return;
    }
    awaitingAuthCallback = false;
    pendingEmail = "";
    setLoginMessage("");
    await enterUnauthenticated();
    return;
  }
  const auth = await loadAuthApi();
  awaitingAuthCallback = false;
  auth.stripAuthParamsFromUrl();
  const silent = event === "TOKEN_REFRESHED" && appInitialized;
  await checkAccess(session, { silent });
}

async function handleSendLoginLink(event) {
  event.preventDefault();
  if (sendingLink) {
    return;
  }
  if (!isLikelyEmail(emailInput?.value)) {
    setLoginMessage("メールアドレスを入力してください。", true);
    return;
  }
  sendingLink = true;
  sendLinkButton.disabled = true;
  setLoginMessage("ログインリンクを送信しています…");
  try {
    const auth = await loadAuthApi();
    pendingEmail = await auth.sendEmailOtp(emailInput.value);
    setLoginMessage(
      "メールのログインリンクを、このブラウザで開いてください。この画面に戻ると利用権を確認します。",
    );
  } catch (error) {
    console.error(error);
    setLoginMessage(
      error?.message
        ? `リンクを送れませんでした。${error.message}`
        : "リンクを送れませんでした。ネットワークを確認してください。",
      true,
    );
  } finally {
    sendingLink = false;
    sendLinkButton.disabled = false;
  }
}

async function handleLogout() {
  if (signingOut) {
    return;
  }
  signingOut = true;
  setBusy(true);
  try {
    await teardownApp();
    const auth = await loadAuthApi();
    await auth.signOut();
  } catch (error) {
    console.error(error);
    await enterUnauthenticated();
    setLoginMessage(
      "ログアウトに失敗したため、この端末の制作データは破棄しました。",
      true,
    );
  } finally {
    signingOut = false;
    setBusy(false);
  }
}

async function handleDeniedCheckout() {
  if (openingCheckout || authState !== "denied" || currentAccess !== "none") {
    return;
  }
  if (!isPaymentLinkConfigured()) {
    deniedCheckoutError = "";
    syncDeniedCheckoutUi();
    return;
  }
  openingCheckout = true;
  deniedCheckoutError = "";
  syncDeniedCheckoutUi();
  try {
    const auth = await loadAuthApi();
    const session = await auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      openingCheckout = false;
      await enterUnauthenticated();
      return;
    }
    window.location.href = buildStripeCheckoutUrl({
      paymentLinkUrl: runtimeConfig.stripePaymentLinkUrl,
      userId,
      email: session.user?.email ?? "",
    });
  } catch (error) {
    console.error(error);
    openingCheckout = false;
    deniedCheckoutError = "決済ページを開けませんでした。";
    syncDeniedCheckoutUi();
  }
}

async function handleDeniedAccessRecheck({ automatic = false } = {}) {
  if (checkoutRecheckInFlight || authState !== "denied" || currentAccess !== "none") {
    return;
  }
  checkoutAutoRecheckDone = true;
  clearCheckoutAutoRecheck();
  checkoutRecheckInFlight = true;
  syncDeniedCheckoutUi();
  try {
    const auth = await loadAuthApi();
    const session = await auth.getSession();
    if (!session) {
      await enterUnauthenticated();
      return;
    }
    await checkAccess(session, { silent: automatic });
  } catch (error) {
    console.error(error);
    await teardownApp();
    setAuthState("network_error");
  } finally {
    checkoutRecheckInFlight = false;
    if (authState === "denied") {
      syncDeniedCheckoutUi();
    }
  }
}

async function handleRetryAccess() {
  try {
    const auth = await loadAuthApi();
    const session = await auth.getSession();
    if (!session) {
      await enterUnauthenticated();
      return;
    }
    await checkAccess(session);
  } catch (error) {
    console.error(error);
    await teardownApp();
    setAuthState("network_error");
  }
}

async function start() {
  if (!isSupabaseRuntimeConfigReady(runtimeConfig)) {
    setAuthState("unconfigured");
    return;
  }

  pendingCheckoutSuccess = hasCheckoutSuccessParam(window.location.href);
  setAuthState("loading");

  let auth;
  try {
    auth = await loadAuthApi();
  } catch (error) {
    console.error(error);
    setAuthState("network_error");
    return;
  }

  awaitingAuthCallback = auth.hasAuthCodeParam();
  const { data } = auth.onAuthStateChange((event, session) => {
    void handleAuthEvent(event, session);
  });
  authSubscription = data?.subscription ?? null;

  try {
    const { session, error } = await auth.establishSessionFromUrl();
    awaitingAuthCallback = false;
    if (authState !== "loading") {
      return;
    }
    if (error) {
      await enterUnauthenticated();
      setLoginMessage(error, true);
      return;
    }
    if (session) {
      await checkAccess(session);
      return;
    }
    await enterUnauthenticated();
  } catch (error) {
    console.error(error);
    awaitingAuthCallback = false;
    if (authState !== "loading") {
      return;
    }
    await teardownApp();
    setAuthState("network_error");
  }
}

loginForm?.addEventListener("submit", (event) => {
  void handleSendLoginLink(event);
});
document.querySelectorAll("[data-gate-logout]").forEach((button) => {
  button.addEventListener("click", () => {
    void handleLogout();
  });
});
checkoutButton?.addEventListener("click", () => {
  void handleDeniedCheckout();
});
checkoutRecheckButton?.addEventListener("click", () => {
  void handleDeniedAccessRecheck({ automatic: false });
});
document.querySelector("#gate-retry")?.addEventListener("click", () => {
  void handleRetryAccess();
});
document.querySelector("#account-logout")?.addEventListener("click", () => {
  void handleLogout();
});

void start();

window.addEventListener("pagehide", () => {
  authSubscription?.unsubscribe?.();
  clearCheckoutAutoRecheck();
});
