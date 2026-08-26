import { isPlaceholderValue } from "./access.js";

export function isStripePaymentLinkReady(url) {
  const text = String(url ?? "").trim();
  if (isPlaceholderValue(text)) {
    return false;
  }
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Build a Payment Link URL. userId must come from the current Auth session.
 * Does not read DOM, query, or stored ids.
 */
export function buildStripeCheckoutUrl({
  paymentLinkUrl,
  userId,
  email = "",
} = {}) {
  if (!isStripePaymentLinkReady(paymentLinkUrl)) {
    throw new Error("Payment Link is not configured");
  }
  const id = String(userId ?? "").trim();
  if (!id) {
    throw new Error("user id is required");
  }
  const url = new URL(paymentLinkUrl);
  url.searchParams.set("client_reference_id", id);
  const mail = String(email ?? "").trim();
  if (mail) {
    url.searchParams.set("prefilled_email", mail);
  } else {
    url.searchParams.delete("prefilled_email");
  }
  return url.toString();
}

export function hasCheckoutSuccessParam(href) {
  try {
    return new URL(href).searchParams.get("checkout") === "success";
  } catch {
    return false;
  }
}

export function hrefWithoutCheckoutSuccess(href) {
  const url = new URL(href);
  if (url.searchParams.get("checkout") === "success") {
    url.searchParams.delete("checkout");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function stripCheckoutSuccessFromLocation() {
  if (typeof window === "undefined") {
    return;
  }
  const href = window.location.href;
  if (!hasCheckoutSuccessParam(href)) {
    return;
  }
  const next = hrefWithoutCheckoutSuccess(href);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next) {
    window.history.replaceState({}, document.title, next);
  }
}
