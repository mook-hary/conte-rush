/**
 * Public client settings for GitHub Pages / localhost.
 * These are not secrets. Never put service role, Stripe secret,
 * or webhook secret in this file.
 *
 * Fill in values from the Supabase project Settings > API page.
 * stripePaymentLinkUrl is a public Test Mode Payment Link base URL.
 */
export const runtimeConfig = {
  supabaseUrl: "https://pbopfwxbxkvsibnxutkd.supabase.co",
  supabaseAnonKey: "sb_publishable_hsBqZb_E7LBARoa-2yhEGg_a3qhnFG8",
  stripePaymentLinkUrl: "https://buy.stripe.com/test_4gM4gB5O11zA1LN4U29R600",
};
