import {
  accessLabel,
  effectiveAccess,
  isLikelyEmail,
  isSupabaseRuntimeConfigReady,
} from "./access.js?v=m11-0";
import { runtimeConfig } from "./runtime-config.js";

const APP_MODULE_URL = new URL("./app.js?v=m11-0", import.meta.url).href;
const AUTH_MODULE_URL = new URL("./auth-client.js?v=m11-0-2", import.meta.url).href;

const gateEl = document.querySelector("#auth-gate");
const loginForm = document.querySelector("#gate-login-form");
const emailInput = document.querySelector("#gate-email");
const sendLinkButton = document.querySelector("#gate-send-link");
const loginMessageEl = document.querySelector("#gate-login-message");
const accountEmailEl = document.querySelector("#account-email");
const accountAccessEl = document.querySelector("#account-access");
const deniedUpgradeSlot = document.querySelector("#denied-upgrade-slot");

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
  await teardownApp();
  setAuthState("unauthenticated");
  setBusy(false);
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
    return;
  }

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
    return;
  }

  if (seq !== accessCheckSeq) {
    return;
  }

  setAuthState("allowed");
  setBusy(false);
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
      "メールのログインリンクを開いてください。この画面に戻ると利用権を確認します。",
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
  if (deniedUpgradeSlot) {
    deniedUpgradeSlot.replaceChildren();
  }

  if (!isSupabaseRuntimeConfigReady(runtimeConfig)) {
    setAuthState("unconfigured");
    return;
  }

  setAuthState("loading");

  let auth;
  try {
    auth = await loadAuthApi();
  } catch (error) {
    console.error(error);
    setAuthState("network_error");
    return;
  }

  const { data } = auth.onAuthStateChange((event, session) => {
    void handleAuthEvent(event, session);
  });
  authSubscription = data?.subscription ?? null;
  awaitingAuthCallback = auth.hasAuthCodeParam();

  queueMicrotask(() => {
    if (authState !== "loading") {
      return;
    }
    void auth
      .getSession()
      .then(async (session) => {
        if (authState !== "loading") {
          return;
        }
        const callbackError = auth.readAuthCallbackError();
        if (callbackError) {
          awaitingAuthCallback = false;
          auth.stripAuthParamsFromUrl();
          await enterUnauthenticated();
          setLoginMessage(
            `ログインリンクを確認できませんでした。${callbackError}`,
            true,
          );
          return;
        }
        if (session) {
          awaitingAuthCallback = false;
          auth.stripAuthParamsFromUrl();
          await checkAccess(session);
          return;
        }
        if (awaitingAuthCallback || auth.hasAuthCodeParam()) {
          window.setTimeout(() => {
            if (authState !== "loading") {
              return;
            }
            void auth
              .getSession()
              .then(async (laterSession) => {
                if (authState !== "loading") {
                  return;
                }
                if (laterSession) {
                  awaitingAuthCallback = false;
                  auth.stripAuthParamsFromUrl();
                  await checkAccess(laterSession);
                  return;
                }
                awaitingAuthCallback = false;
                auth.stripAuthParamsFromUrl();
                await enterUnauthenticated();
                setLoginMessage(
                  "ログインリンクの確認に失敗しました。もう一度送ってください。",
                  true,
                );
              })
              .catch(async (error) => {
                console.error(error);
                if (authState !== "loading") {
                  return;
                }
                await teardownApp();
                setAuthState("network_error");
              });
          }, 12000);
          return;
        }
        await enterUnauthenticated();
      })
      .catch(async (error) => {
        console.error(error);
        if (authState !== "loading") {
          return;
        }
        await teardownApp();
        setAuthState("network_error");
      });
  });
}

loginForm?.addEventListener("submit", (event) => {
  void handleSendLoginLink(event);
});
document.querySelectorAll("[data-gate-logout]").forEach((button) => {
  button.addEventListener("click", () => {
    void handleLogout();
  });
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
});
