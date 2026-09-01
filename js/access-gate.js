import {
  accessLabel,
  effectiveAccess,
  isLikelyEmail,
  isSupabaseRuntimeConfigReady,
} from "./access.js?v=m11-2";
import { runtimeConfig } from "./runtime-config.js";
import {
  hasCheckoutSuccessParam,
  stripCheckoutSuccessFromLocation,
} from "./stripe-checkout.js?v=m11-4";
import {
  deniedUpgradeMode,
  shouldShowAccountPortal,
} from "./billing-ui.js?v=m11-8-gate-fix";
import {
  DEV_BYPASS_USER_ID,
  isLocalDevBypassEnabled,
  isSilentAuthRecheck,
} from "./gate-policy.js?v=draft-3";

const APP_MODULE_URL = new URL("./app.js?v=draft-3", import.meta.url).href;
const AUTH_MODULE_URL = new URL("./auth-client.js?v=m11-4", import.meta.url).href;

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
const portalButton = document.querySelector("#denied-portal");
const accountPortalButton = document.querySelector("#account-portal");
const inviteCodeInput = document.querySelector("#denied-invite-code");
const inviteSubmitButton = document.querySelector("#denied-invite-submit");
const inviteStatusEl = document.querySelector("#denied-invite-status");

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
let redeemingInvite = false;
let openingPortal = false;
let currentSubscription = null;
let deniedForcePortal = false;
let devBypassActive = false;

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

function deniedBillingMode() {
  if (deniedForcePortal) {
    return "portal";
  }
  return deniedUpgradeMode(currentSubscription);
}

function syncDeniedCheckoutUi({ successNote = false } = {}) {
  const showConfirming = successNote || checkoutConfirming;
  const upgradeMode = deniedBillingMode();
  const busy = openingCheckout || openingPortal || checkoutRecheckInFlight || redeemingInvite;
  if (checkoutButton) {
    checkoutButton.hidden = showConfirming || upgradeMode !== "checkout";
    checkoutButton.disabled = busy;
  }
  if (portalButton) {
    portalButton.hidden = showConfirming || upgradeMode !== "portal";
    portalButton.disabled = busy;
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
  checkoutStatusEl.textContent = "";
  checkoutStatusEl.classList.remove("is-error");
}

function syncAccountPortalUi(access) {
  if (!accountPortalButton) {
    return;
  }
  if (devBypassActive) {
    accountPortalButton.hidden = true;
    accountPortalButton.disabled = true;
    return;
  }
  const show = shouldShowAccountPortal(access, currentSubscription);
  accountPortalButton.hidden = !show;
  accountPortalButton.disabled = openingPortal;
}

function setInviteMessage(text, isError = false) {
  if (!inviteStatusEl) {
    return;
  }
  inviteStatusEl.textContent = text;
  inviteStatusEl.classList.toggle("is-error", Boolean(isError && text));
}

function syncDeniedInviteUi() {
  const busy = redeemingInvite || openingCheckout || openingPortal || checkoutRecheckInFlight;
  if (inviteCodeInput) {
    inviteCodeInput.disabled = busy;
  }
  if (inviteSubmitButton) {
    inviteSubmitButton.disabled = busy;
  }
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

function waitForAppShellLayout() {
  const shell = document.querySelector(".app-shell");
  if (shell) {
    void shell.offsetHeight;
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function initializeAppIfNeeded(userId) {
  if (appInitialized && initializedUserId === userId) {
    return;
  }
  if (appInitialized && initializedUserId && initializedUserId !== userId) {
    await teardownApp();
  }
  const app = await loadAppModule();
  await app.initializeConteRush(userId);
  appInitialized = true;
  initializedUserId = userId;
}

async function teardownApp({ clearPersistence = false } = {}) {
  if (!appModule) {
    appInitialized = false;
    initializedUserId = null;
    return;
  }
  await appModule.resetConteRushSession({ clearPersistence });
  appInitialized = false;
  initializedUserId = null;
}

function syncDevModeBadge() {
  const badge = document.querySelector("#dev-mode-badge");
  if (!badge) {
    return;
  }
  badge.hidden = !devBypassActive;
}

function renderAccount(session, access) {
  const email = session?.user?.email ?? "";
  if (accountEmailEl) {
    accountEmailEl.textContent = devBypassActive
      ? "ローカル検証モード"
      : email
        ? `ログイン中: ${email}`
        : "";
  }
  if (accountAccessEl) {
    accountAccessEl.textContent = devBypassActive
      ? "利用権: 開発bypass"
      : `利用権: ${accessLabel(access)}`;
  }
  syncDevModeBadge();
  syncAccountPortalUi(access);
}

async function enterUnauthenticated() {
  currentAccess = "none";
  pendingEmail = pendingEmail || "";
  checkoutConfirming = false;
  redeemingInvite = false;
  openingPortal = false;
  currentSubscription = null;
  deniedForcePortal = false;
  clearCheckoutAutoRecheck();
  if (inviteCodeInput) {
    inviteCodeInput.value = "";
  }
  setInviteMessage("");
  await teardownApp({ clearPersistence: false });
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
  currentSubscription = rows.subscription ?? null;
  renderAccount(session, access);

  if (access === "none") {
    await teardownApp();
    setAuthState("denied");
    setBusy(false);
    deniedCheckoutError = "";
    syncDeniedCheckoutUi();
    syncDeniedInviteUi();
    settleCheckoutSuccessQuery();
    return;
  }

  checkoutConfirming = false;
  clearCheckoutAutoRecheck();

  setAuthState("allowed");
  await waitForAppShellLayout();

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
  const userId = session?.user?.id ?? null;
  const silent = isSilentAuthRecheck({
    event,
    appInitialized,
    authState,
    initializedUserId,
    sessionUserId: userId,
  });
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

async function enterDevBypass() {
  devBypassActive = true;
  currentAccess = "internal";
  currentSubscription = null;
  deniedForcePortal = false;
  clearCheckoutAutoRecheck();
  renderAccount(null, "internal");
  setAuthState("allowed");
  await waitForAppShellLayout();
  await initializeAppIfNeeded(DEV_BYPASS_USER_ID);
  setBusy(false);
}

async function handleLogout() {
  if (signingOut) {
    return;
  }
  signingOut = true;
  setBusy(true);
  try {
    await teardownApp({ clearPersistence: false });
    if (devBypassActive) {
      await enterDevBypass();
      return;
    }
    const auth = await loadAuthApi();
    await auth.signOut();
  } catch (error) {
    console.error(error);
    if (devBypassActive) {
      await enterDevBypass();
      return;
    }
    await enterUnauthenticated();
    setLoginMessage(
      "ログアウトに失敗しました。この端末の制作データは残しています。",
      true,
    );
  } finally {
    signingOut = false;
    setBusy(false);
  }
}

async function handleDeniedCheckout() {
  if (
    openingCheckout ||
    openingPortal ||
    redeemingInvite ||
    authState !== "denied" ||
    currentAccess !== "none" ||
    deniedBillingMode() !== "checkout"
  ) {
    return;
  }
  openingCheckout = true;
  deniedCheckoutError = "";
  syncDeniedCheckoutUi();
  try {
    const auth = await loadAuthApi();
    const session = await auth.getSession();
    if (!session) {
      openingCheckout = false;
      await enterUnauthenticated();
      return;
    }
    const result = await auth.createCheckoutSession();
    if (result.ok && result.action === "checkout" && result.url) {
      window.location.href = result.url;
      return;
    }
    if (result.ok && result.action === "existing_subscription") {
      deniedForcePortal = true;
      deniedCheckoutError = "すでに契約があります。契約管理から確認してください。";
      openingCheckout = false;
      syncDeniedCheckoutUi();
      return;
    }
    if (result.error === "unauthorized") {
      openingCheckout = false;
      await enterUnauthenticated();
      return;
    }
    openingCheckout = false;
    deniedCheckoutError = "決済ページを開けませんでした。";
    syncDeniedCheckoutUi();
  } catch (error) {
    console.error(error);
    openingCheckout = false;
    deniedCheckoutError = "決済ページを開けませんでした。";
    syncDeniedCheckoutUi();
  }
}

async function handlePortal() {
  if (openingPortal || openingCheckout || redeemingInvite) {
    return;
  }
  openingPortal = true;
  deniedCheckoutError = "";
  syncDeniedCheckoutUi();
  syncAccountPortalUi(currentAccess);
  try {
    const auth = await loadAuthApi();
    const session = await auth.getSession();
    if (!session) {
      openingPortal = false;
      await enterUnauthenticated();
      return;
    }
    const result = await auth.createPortalSession();
    if (result.ok && result.url) {
      window.location.href = result.url;
      return;
    }
    if (result.error === "unauthorized") {
      openingPortal = false;
      await enterUnauthenticated();
      return;
    }
    openingPortal = false;
    deniedCheckoutError =
      result.error === "no_customer"
        ? "契約情報が見つかりませんでした。"
        : "契約管理を開けませんでした。";
    syncDeniedCheckoutUi();
    syncAccountPortalUi(currentAccess);
  } catch (error) {
    console.error(error);
    openingPortal = false;
    deniedCheckoutError = "契約管理を開けませんでした。";
    syncDeniedCheckoutUi();
    syncAccountPortalUi(currentAccess);
  }
}

async function handleDeniedInvite() {
  if (redeemingInvite || openingCheckout || openingPortal || authState !== "denied" || currentAccess !== "none") {
    return;
  }
  const code = inviteCodeInput?.value ?? "";
  if (!String(code).trim()) {
    setInviteMessage("招待コードを入力してください。", true);
    return;
  }
  redeemingInvite = true;
  setInviteMessage("コードを確認しています…");
  syncDeniedInviteUi();
  syncDeniedCheckoutUi();
  try {
    const auth = await loadAuthApi();
    const session = await auth.getSession();
    if (!session) {
      await enterUnauthenticated();
      return;
    }
    const result = await auth.redeemInternalInvite(code);
    if (result.ok) {
      setInviteMessage("");
      await checkAccess(session);
      return;
    }
    if (result.error === "rate_limited") {
      setInviteMessage("試行回数が多すぎます。しばらく時間をおいてから試してください。", true);
      return;
    }
    if (result.error === "unauthorized") {
      await enterUnauthenticated();
      return;
    }
    setInviteMessage("コードを確認できませんでした。", true);
  } catch (error) {
    console.error(error);
    setInviteMessage("コードを確認できませんでした。ネットワークを確認してください。", true);
  } finally {
    redeemingInvite = false;
    if (authState === "denied") {
      syncDeniedInviteUi();
      syncDeniedCheckoutUi();
    }
  }
}

async function handleDeniedAccessRecheck({ automatic = false } = {}) {
  if (checkoutRecheckInFlight || openingCheckout || openingPortal || authState !== "denied" || currentAccess !== "none") {
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
      syncDeniedInviteUi();
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
  if (
    isLocalDevBypassEnabled({
      hostname: window.location.hostname,
      search: window.location.search,
    })
  ) {
    try {
      await enterDevBypass();
    } catch (error) {
      console.error(error);
      setAuthState("network_error");
    }
    return;
  }

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
portalButton?.addEventListener("click", () => {
  void handlePortal();
});
accountPortalButton?.addEventListener("click", () => {
  void handlePortal();
});
checkoutRecheckButton?.addEventListener("click", () => {
  void handleDeniedAccessRecheck({ automatic: false });
});
inviteSubmitButton?.addEventListener("click", () => {
  void handleDeniedInvite();
});
inviteCodeInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void handleDeniedInvite();
  }
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
