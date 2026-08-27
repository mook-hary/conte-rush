/**
 * Checkout return helpers. Does not build Payment Links. No Stripe secrets.
 */

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
